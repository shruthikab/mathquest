const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { pool, isConnected } = require('./db');

// In-memory store for demo users (when no database)
const demoUsers = new Map();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || 'your-client-id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'your-client-secret',
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0]?.value;
        const name = profile.displayName;
        const googleId = profile.id;
        const avatar = profile.photos[0]?.value;

        if (!email) {
          return done(new Error('No email found in Google profile'));
        }

        // If no database, use in-memory storage
        if (!pool || !isConnected) {
          console.log('No database - using in-memory user storage');
          let user = demoUsers.get(googleId);
          if (!user) {
            user = { id: googleId, name, email, googleId, avatar };
            demoUsers.set(googleId, user);
          }
          return done(null, user);
        }

        // Check if user exists by Google ID
        let user = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
        if (user.rows.length > 0) {
          return done(null, user.rows[0]);
        }

        // Check if user exists by email (link Google to existing account)
        user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (user.rows.length > 0) {
          await pool.query('UPDATE users SET google_id = $1 WHERE email = $2', [googleId, email]);
          return done(null, user.rows[0]);
        }

        // Create new user with Google
        const newUser = await pool.query(
          `INSERT INTO users (name, email, google_id, avatar) VALUES ($1, $2, $3, $4) RETURNING id, name, email, google_id, avatar, created_at`,
          [name, email, googleId, avatar]
        );
        return done(null, newUser.rows[0]);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  // If no database, check in-memory store
  if (!pool || !isConnected) {
    const user = demoUsers.get(id);
    if (user) {
      return done(null, user);
    }
    return done(new Error('User not found'), null);
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0]);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;
