const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const serverless = require('serverless-http');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 604800000, sameSite: 'lax' },
}));

// Static files
app.use(express.static(path.join(__dirname, '..')));

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Demo login
app.post('/api/auth/login', (req, res) => {
  const jwt = require('jsonwebtoken');
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const token = jwt.sign({ userId: 'demo', email, name: name || email }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
  res.json({ user: { id: 'demo', name: name || email, email }, token });
});

// Demo signup
app.post('/api/auth/signup', (req, res) => {
  const jwt = require('jsonwebtoken');
  const { name, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const token = jwt.sign({ userId: 'demo', email, name }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
  res.status(201).json({ user: { id: 'demo', name, email }, token });
});

// Get current user
app.get('/api/auth/me', (req, res) => {
  const jwt = require('jsonwebtoken');
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(auth.substring(7), process.env.JWT_SECRET || 'secret');
    res.json({ user: { id: decoded.userId, email: decoded.email, name: decoded.name || decoded.email } });
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Google auth - lazy load only if env vars exist
app.get('/api/auth/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({ error: 'Google OAuth not configured' });
  }
  const passport = require('passport');
  const GoogleStrategy = require('passport-google-oauth20').Strategy;
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
  }, (ac, rf, profile, done) => {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(new Error('No email'));
    done(null, { id: profile.id, name: profile.displayName, email });
  }));
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

app.get('/api/auth/google/callback', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect('/?error=Google+not+configured');
  }
  const passport = require('passport');
  const GoogleStrategy = require('passport-google-oauth20').Strategy;
  if (!passport._strategies.google) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
    }, (ac, rf, profile, done) => {
      done(null, { id: profile.id, name: profile.displayName, email: profile.emails?.[0]?.value });
    }));
  }
  passport.authenticate('google', { session: false, failureRedirect: '/' }, (err, user) => {
    if (err || !user) return res.redirect('/?error=Auth+failed');
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    res.redirect(`/?google_auth=true&token=${token}&user=${encodeURIComponent(JSON.stringify(user))}`);
  })(req, res, next);
});

// Import questions - placeholder
app.post('/api/import-questions', async (req, res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'No API key' });
  res.json({ questions: [] });
});

// Catch-all
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));

module.exports.handler = serverless(app);
