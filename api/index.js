// Vercel Serverless Function - Google OAuth Handler
// No external dependencies - uses only Node.js built-ins

let HTML = null;
const users = new Map();

// Simple JWT implementation
const simpleJWT = {
  sign(payload, secret, options) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    payload.iat = now;
    if (options && options.expiresIn) {
      const seconds = parseInt(options.expiresIn) || 7 * 24 * 60 * 60;
      payload.exp = now + seconds;
    }
    const base64UrlEncode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const signature = Buffer.from(base64UrlEncode(header) + '.' + base64UrlEncode(payload) + '.' + secret).toString('base64');
    return base64UrlEncode(header) + '.' + base64UrlEncode(payload) + '.' + signature;
  },
  verify(token, secret) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) throw new Error('Token expired');
    return payload;
  }
};

// HTTP request helper using built-in http/https modules
function makeRequest(url, options) {
  return new Promise(function(resolve, reject) {
    var urlObj = new URL(url);
    var isHttps = urlObj.protocol === 'https:';
    var httpModule = isHttps ? require('https') : require('http');
    var requestData = options.body;
    var headers = options.headers || {};
    var reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: headers
    };
    var req = httpModule.request(reqOptions, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: function() { return Promise.resolve(data); },
          json: function() { return Promise.resolve(JSON.parse(data)); }
        });
      });
    });
    req.on('error', reject);
    if (requestData) req.write(requestData);
    req.end();
  });
}

module.exports = function handler(event, context) {
  return (async function() {
    try {
      var urlPath = event.path;
      var httpMethod = event.httpMethod;
      var body = event.body;
      var headers = event.headers || {};
      var queryStringParameters = event.queryStringParameters || {};
      var secret = process.env.JWT_SECRET || 'demo-secret-key-for-vercel';

      // Health check
      if (urlPath === '/api/health' && httpMethod === 'GET') {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            status: 'ok',
            env: {
              googleConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
              callbackUrl: process.env.GOOGLE_CALLBACK_URL
            }
          })
        };
      }

      // Google OAuth start
      if (urlPath === '/api/auth/google' && httpMethod === 'GET') {
        var clientId = process.env.GOOGLE_CLIENT_ID;
        var clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        var callbackUrl = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';

        if (!clientId || !clientSecret) {
          return {
            statusCode: 302,
            headers: { 'Location': '/?error=Google+not+configured', 'Access-Control-Allow-Origin': '*' },
            body: ''
          };
        }

        var googleAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=' + encodeURIComponent(clientId) + '&redirect_uri=' + encodeURIComponent(callbackUrl) + '&response_type=code&scope=openid%20email%20profile';
        return {
          statusCode: 302,
          headers: { 'Location': googleAuthUrl, 'Access-Control-Allow-Origin': '*' },
          body: ''
        };
      }

      // Google OAuth callback
      if (urlPath === '/api/auth/google/callback' && httpMethod === 'GET') {
        var code = queryStringParameters.code;
        clientId = process.env.GOOGLE_CLIENT_ID;
        clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        callbackUrl = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';

        if (!code) {
          return {
            statusCode: 302,
            headers: { 'Location': '/?error=No+auth+code', 'Access-Control-Allow-Origin': '*' },
            body: ''
          };
        }

        if (!clientId || !clientSecret) {
          return {
            statusCode: 302,
            headers: { 'Location': '/?error=Google+not+configured', 'Access-Control-Allow-Origin': '*' },
            body: ''
          };
        }

        var tokenResponse = await makeRequest('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'code=' + encodeURIComponent(code) + '&client_id=' + encodeURIComponent(clientId) + '&client_secret=' + encodeURIComponent(clientSecret) + '&redirect_uri=' + encodeURIComponent(callbackUrl) + '&grant_type=authorization_code'
        });

        if (!tokenResponse.ok) {
          var errorText = await tokenResponse.text();
          console.error('Token exchange failed:', errorText);
          return {
            statusCode: 302,
            headers: { 'Location': '/?error=Token+exchange+failed', 'Access-Control-Allow-Origin': '*' },
            body: ''
          };
        }

        var tokens = await tokenResponse.json();
        var userInfoResponse = await makeRequest('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { 'Authorization': 'Bearer ' + tokens.access_token }
        });

        if (!userInfoResponse.ok) {
          return {
            statusCode: 302,
            headers: { 'Location': '/?error=Failed+to+get+user+info', 'Access-Control-Allow-Origin': '*' },
            body: ''
          };
        }

        var googleUser = await userInfoResponse.json();
        var user = users.get(googleUser.id);
        if (!user) {
          user = { id: googleUser.id, name: googleUser.name, email: googleUser.email };
          users.set(googleUser.id, user);
        }

        var jwtToken = simpleJWT.sign({ userId: user.id, email: user.email, name: user.name }, secret);
        var redirectUrl = '/?google_auth=true&token=' + encodeURIComponent(jwtToken) + '&user=' + encodeURIComponent(JSON.stringify(user));

        return {
          statusCode: 302,
          headers: { 'Location': redirectUrl, 'Access-Control-Allow-Origin': '*' },
          body: ''
        };
      }

      // Demo login
      if (urlPath === '/api/auth/login' && httpMethod === 'POST') {
        var data = JSON.parse(body || '{}');
        var token = simpleJWT.sign({ userId: 'demo', email: data.email || 'user@example.com', name: data.name || data.email }, secret);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ user: { id: 'demo', name: data.name || data.email, email: data.email || 'user@example.com' }, token })
        };
      }

      // Demo signup
      if (urlPath === '/api/auth/signup' && httpMethod === 'POST') {
        data = JSON.parse(body || '{}');
        token = simpleJWT.sign({ userId: 'demo', email: data.email, name: data.name }, secret);
        return {
          statusCode: 201,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ user: { id: 'demo', name: data.name, email: data.email }, token })
        };
      }

      // Get current user
      if (urlPath === '/api/auth/me' && httpMethod === 'GET') {
        var authHeader = headers.authorization || headers.Authorization;
        if (!authHeader || authHeader.indexOf('Bearer ') !== 0) {
          return {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'No token' })
          };
        }
        var decoded = simpleJWT.verify(authHeader.substring(7), secret);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ user: { id: decoded.userId, email: decoded.email, name: decoded.name || decoded.email } })
        };
      }

      // Import questions
      if (urlPath === '/api/import-questions' && httpMethod === 'POST') {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ questions: [] })
        };
      }

      // Serve HTML for all other requests
      if (!HTML) {
        var fs = require('fs');
        var path = require('path');
        HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' },
        body: HTML || '<h1>Loading...</h1>'
      };

    } catch (e) {
      console.error('Handler error:', e.message, e.stack);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: e.message })
      };
    }
  })();
};
