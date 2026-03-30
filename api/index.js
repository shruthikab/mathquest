const jwt = require('jsonwebtoken');

let HTML = null;

const users = new Map();

module.exports.handler = async (event, context) => {
  console.log('Incoming event:', {
    path: event.path,
    method: event.httpMethod,
    headers: Object.keys(event.headers || {}),
  });

  try {
    const { path: urlPath, httpMethod, body, headers, queryStringParameters } = event;
    const secret = process.env.JWT_SECRET || 'demo-secret-key-for-vercel';

    console.log('Processing request:', urlPath, httpMethod);
    console.log('GOOGLE_CLIENT_ID configured:', !!process.env.GOOGLE_CLIENT_ID);
    console.log('GOOGLE_CLIENT_SECRET configured:', !!process.env.GOOGLE_CLIENT_SECRET);
    console.log('GOOGLE_CALLBACK_URL:', process.env.GOOGLE_CALLBACK_URL || 'not set');

    // Lazy load index.html
    if (!HTML && httpMethod === 'GET' && !urlPath.startsWith('/api/')) {
      const fs = require('fs');
      const path = require('path');
      try {
        HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        console.log('Loaded index.html successfully');
      } catch (e) {
        console.error('Failed to load index.html:', e.message);
        HTML = '<h1>Error loading page</h1>';
      }
    }

    // Health check
    if (urlPath === '/api/health' && httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,OPTIONS,POST',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        body: JSON.stringify({ status: 'ok', env: {
          googleConfigured: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
        }})
      };
    }

    // Google OAuth start
    if (urlPath === '/api/auth/google' && httpMethod === 'GET') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const callbackUrl = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';

      console.log('Google OAuth request - clientId:', clientId ? 'present' : 'missing');

      if (!clientId || !clientSecret) {
        console.error('Google OAuth not configured - missing credentials');
        return {
          statusCode: 302,
          headers: {
            'Location': '/?error=Google+not+configured',
            'Access-Control-Allow-Origin': '*'
          },
          body: ''
        };
      }

      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=openid%20email%20profile`;
      console.log('Redirecting to Google OAuth');
      return {
        statusCode: 302,
        headers: {
          'Location': googleAuthUrl,
          'Access-Control-Allow-Origin': '*'
        },
        body: ''
      };
    }

    // Google OAuth callback
    if (urlPath === '/api/auth/google/callback' && httpMethod === 'GET') {
      const code = queryStringParameters?.code;
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const callbackUrl = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';

      console.log('Google OAuth callback - code present:', !!code);

      if (!code) {
        return {
          statusCode: 302,
          headers: {
            'Location': '/?error=No+auth+code',
            'Access-Control-Allow-Origin': '*'
          },
          body: ''
        };
      }

      if (!clientId || !clientSecret) {
        return {
          statusCode: 302,
          headers: {
            'Location': '/?error=Google+not+configured',
            'Access-Control-Allow-Origin': '*'
          },
          body: ''
        };
      }

      console.log('Exchanging code for tokens...');
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `code=${encodeURIComponent(code)}&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&redirect_uri=${encodeURIComponent(callbackUrl)}&grant_type=authorization_code`
      });

      console.log('Token response status:', tokenResponse.status);

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Token exchange failed:', errorText);
        return {
          statusCode: 302,
          headers: {
            'Location': '/?error=Token+exchange+failed',
            'Access-Control-Allow-Origin': '*'
          },
          body: ''
        };
      }

      const tokens = await tokenResponse.json();
      console.log('Got tokens, fetching user info...');

      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` }
      });

      if (!userInfoResponse.ok) {
        return {
          statusCode: 302,
          headers: {
            'Location': '/?error=Failed+to+get+user+info',
            'Access-Control-Allow-Origin': '*'
          },
          body: ''
        };
      }

      const googleUser = await userInfoResponse.json();
      console.log('Got user:', googleUser.email);

      let user = users.get(googleUser.id);
      if (!user) {
        user = { id: googleUser.id, name: googleUser.name, email: googleUser.email };
        users.set(googleUser.id, user);
      }

      const jwtToken = jwt.sign({ userId: user.id, email: user.email, name: user.name }, secret, { expiresIn: '7d' });
      const redirectUrl = `/?google_auth=true&token=${encodeURIComponent(jwtToken)}&user=${encodeURIComponent(JSON.stringify(user))}`;

      return {
        statusCode: 302,
        headers: {
          'Location': redirectUrl,
          'Access-Control-Allow-Origin': '*'
        },
        body: ''
      };
    }

    // Demo login
    if (urlPath === '/api/auth/login' && httpMethod === 'POST') {
      const data = JSON.parse(body || '{}');
      const token = jwt.sign({ userId: 'demo', email: data.email || 'user@example.com', name: data.name || data.email }, secret, { expiresIn: '7d' });
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,OPTIONS,POST',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        body: JSON.stringify({ user: { id: 'demo', name: data.name || data.email, email: data.email || 'user@example.com' }, token })
      };
    }

    // Demo signup
    if (urlPath === '/api/auth/signup' && httpMethod === 'POST') {
      const data = JSON.parse(body || '{}');
      const token = jwt.sign({ userId: 'demo', email: data.email, name: data.name }, secret, { expiresIn: '7d' });
      return {
        statusCode: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,OPTIONS,POST',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        body: JSON.stringify({ user: { id: 'demo', name: data.name, email: data.email }, token })
      };
    }

    // Get current user
    if (urlPath === '/api/auth/me' && httpMethod === 'GET') {
      const authHeader = headers.authorization || headers.Authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
          statusCode: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ error: 'No token' })
        };
      }
      const decoded = jwt.verify(authHeader.substring(7), secret);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ user: { id: decoded.userId, email: decoded.email, name: decoded.name || decoded.email } })
      };
    }

    // Import questions
    if (urlPath === '/api/import-questions' && httpMethod === 'POST') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ questions: [] })
      };
    }

    // Default: serve HTML
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*'
      },
      body: HTML || '<h1>Loading...</h1>'
    };
  } catch (e) {
    console.error('Handler error:', e);
    console.error('Stack trace:', e.stack);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: e.message,
        stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
      })
    };
  }
};
