const express = require('express');
const cors = require('cors');
const path = require('path');
const serverless = require('serverless-http');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Demo login
app.post('/api/auth/login', (req, res) => {
  const jwt = require('jsonwebtoken');
  const { email, name } = req.body;
  const secret = process.env.JWT_SECRET || 'demo-secret-key-for-vercel';
  const token = jwt.sign({ userId: 'demo', email: email || 'user@example.com', name: name || email }, secret, { expiresIn: '7d' });
  res.json({ user: { id: 'demo', name: name || email, email: email || 'user@example.com' }, token });
});

// Demo signup
app.post('/api/auth/signup', (req, res) => {
  const jwt = require('jsonwebtoken');
  const { name, email } = req.body;
  const secret = process.env.JWT_SECRET || 'demo-secret-key-for-vercel';
  const token = jwt.sign({ userId: 'demo', email, name }, secret, { expiresIn: '7d' });
  res.status(201).json({ user: { id: 'demo', name, email }, token });
});

// Get current user
app.get('/api/auth/me', (req, res) => {
  const jwt = require('jsonwebtoken');
  const auth = req.headers.authorization;
  const secret = process.env.JWT_SECRET || 'demo-secret-key-for-vercel';
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(auth.substring(7), secret);
    res.json({ user: { id: decoded.userId, email: decoded.email, name: decoded.name || decoded.email } });
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Import questions placeholder
app.post('/api/import-questions', (req, res) => res.json({ questions: [] }));

module.exports.handler = serverless(app);
