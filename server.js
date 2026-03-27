require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const { initializeDatabase } = require('./db');
const passport = require('./passport');
const authRoutes = require('./api/auth');
const importQuestionsRoutes = require('./api/import-questions');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  },
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Static files - MUST come first
app.use(express.static(path.join(__dirname)));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/import-questions', importQuestionsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Login failed
app.get('/login-failed', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Catch-all - MUST be last
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Export for Vercel
module.exports = app;

// Local development server
if (process.env.VERCEL !== '1') {
  initializeDatabase().then(() => {
    app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
      console.log('Server running on http://localhost:3000');
    });
  });
}
