const http = require('http');
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

module.exports.handler = async (event, context) => {
  const { path: urlPath, httpMethod } = event;

  // Health check
  if (urlPath === '/api/health') {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'ok' }) };
  }

  // Demo login
  if (urlPath === '/api/auth/login' && httpMethod === 'POST') {
    const jwt = require('jsonwebtoken');
    const body = JSON.parse(event.body || '{}');
    const token = jwt.sign({ userId: 'demo', email: body.email || 'user@example.com' }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: { id: 'demo', name: body.name || body.email, email: body.email }, token }) };
  }

  // Demo signup
  if (urlPath === '/api/auth/signup' && httpMethod === 'POST') {
    const jwt = require('jsonwebtoken');
    const body = JSON.parse(event.body || '{}');
    const token = jwt.sign({ userId: 'demo', email: body.email }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: { id: 'demo', name: body.name, email: body.email }, token }) };
  }

  // Get current user
  if (urlPath === '/api/auth/me' && httpMethod === 'GET') {
    const jwt = require('jsonwebtoken');
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No token' }) };
    }
    try {
      const decoded = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET || 'secret');
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: { id: decoded.userId, email: decoded.email, name: decoded.name || decoded.email } }) };
    } catch (e) {
      return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid token' }) };
    }
  }

  // Default: serve index.html
  return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: HTML };
};
