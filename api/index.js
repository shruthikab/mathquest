const jwt = require('jsonwebtoken');

let HTML = null;

const users = new Map();

module.exports.handler = async (event, context) => {
  try {
    const { path: urlPath, httpMethod, body, headers, queryStringParameters } = event;
    const secret = process.env.JWT_SECRET || 'demo-secret-key-for-vercel';

    // Lazy load index.html
    if (!HTML && httpMethod === 'GET' && !urlPath.startsWith('/api/')) {
      const fs = require('fs');
      const path = require('path');
      try {
        HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
      } catch (e) {
        HTML = '<h1>Error loading page</h1>';
      }
    }

    // Health check
    if (urlPath === '/api/health' && httpMethod === 'GET') {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ status: 'ok' }) };
    }

    // Google OAuth start
    if (urlPath === '/api/auth/google' && httpMethod === 'GET') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const callbackUrl = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';

      if (!clientId || !clientSecret) {
        return { statusCode: 302, headers: { 'Location': '/?error=Google+not+configured', 'Access-Control-Allow-Origin': '*' }, body: '' };
      }

      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=openid%20email%20profile`;
      return { statusCode: 302, headers: { 'Location': googleAuthUrl, 'Access-Control-Allow-Origin': '*' }, body: '' };
    }

    // Google OAuth callback
    if (urlPath === '/api/auth/google/callback' && httpMethod === 'GET') {
      const code = queryStringParameters?.code;
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const callbackUrl = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';

      if (!code) {
        return { statusCode: 302, headers: { 'Location': '/?error=No+auth+code', 'Access-Control-Allow-Origin': '*' }, body: '' };
      }

      if (!clientId || !clientSecret) {
        return { statusCode: 302, headers: { 'Location': '/?error=Google+not+configured', 'Access-Control-Allow-Origin': '*' }, body: '' };
      }

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `code=${encodeURIComponent(code)}&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&redirect_uri=${encodeURIComponent(callbackUrl)}&grant_type=authorization_code`
      });

      if (!tokenResponse.ok) {
        console.error('Token exchange failed:', await tokenResponse.text());
        return { statusCode: 302, headers: { 'Location': '/?error=Token+exchange+failed', 'Access-Control-Allow-Origin': '*' }, body: '' };
      }

      const tokens = await tokenResponse.json();
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` }
      });

      if (!userInfoResponse.ok) {
        return { statusCode: 302, headers: { 'Location': '/?error=Failed+to+get+user+info', 'Access-Control-Allow-Origin': '*' }, body: '' };
      }

      const googleUser = await userInfoResponse.json();
      let user = users.get(googleUser.id);
      if (!user) {
        user = { id: googleUser.id, name: googleUser.name, email: googleUser.email };
        users.set(googleUser.id, user);
      }

      const jwtToken = jwt.sign({ userId: user.id, email: user.email, name: user.name }, secret, { expiresIn: '7d' });
      const redirectUrl = `/?google_auth=true&token=${encodeURIComponent(jwtToken)}&user=${encodeURIComponent(JSON.stringify(user))}`;
      return { statusCode: 302, headers: { 'Location': redirectUrl, 'Access-Control-Allow-Origin': '*' }, body: '' };
    }

    // Demo login
    if (urlPath === '/api/auth/login' && httpMethod === 'POST') {
      const data = JSON.parse(body || '{}');
      const token = jwt.sign({ userId: 'demo', email: data.email || 'user@example.com', name: data.name || data.email }, secret, { expiresIn: '7d' });
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ user: { id: 'demo', name: data.name || data.email, email: data.email || 'user@example.com' }, token }) };
    }

    // Demo signup
    if (urlPath === '/api/auth/signup' && httpMethod === 'POST') {
      const data = JSON.parse(body || '{}');
      const token = jwt.sign({ userId: 'demo', email: data.email, name: data.name }, secret, { expiresIn: '7d' });
      return { statusCode: 201, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ user: { id: 'demo', name: data.name, email: data.email }, token }) };
    }

    // Get current user
    if (urlPath === '/api/auth/me' && httpMethod === 'GET') {
      const authHeader = headers.authorization || headers.Authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { statusCode: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'No token' }) };
      }
      const decoded = jwt.verify(authHeader.substring(7), secret);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ user: { id: decoded.userId, email: decoded.email, name: decoded.name || decoded.email } }) };
    }

    // Import questions
    if (urlPath === '/api/import-questions' && httpMethod === 'POST') {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ questions: [] }) };
    }

    // Default: serve HTML
    return { statusCode: 200, headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' }, body: HTML || '<h1>Loading...</h1>' };
  } catch (e) {
    console.error('Handler error:', e);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
