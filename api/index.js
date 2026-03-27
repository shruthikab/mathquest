const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const authRoutes = require('./auth');
const importQuestionsRoutes = require('./import-questions');
const serverless = require('serverless-http');

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

// Static files - serve from parent directory
app.use(express.static(path.join(__dirname, '..')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/import-questions', importQuestionsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Catch-all - serve index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

module.exports.handler = serverless(app);
