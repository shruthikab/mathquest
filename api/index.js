const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const authRoutes = require('../api/auth');
const importQuestionsRoutes = require('../api/import-questions');
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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/import-questions', importQuestionsRoutes);

module.exports.handler = serverless(app);
