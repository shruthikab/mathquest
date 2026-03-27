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
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session middleware (required for passport OAuth)
app.use(session({
  secret: process.env.SESSION_SECRET || 'session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
  },
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// For Vercel serverless - export the app
module.exports = app;

// Static files - MUST be before API routes and catch-all
app.use(express.static(path.join(__dirname)));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/import-questions', importQuestionsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'MathQuest API is running' });
});

// Login failed route
app.get('/login-failed', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve index.html for all other routes (SPA fallback) - MUST be last
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// For Vercel serverless - export the app
module.exports = app;

// Only start server if not in Vercel/lambda environment
if (process.env.VERCEL !== '1') {
  initializeDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`MathQuest server running at http://localhost:${PORT}`);
      console.log('Press Ctrl+C to stop');
    });
  });
}
