import bcrypt from 'bcryptjs';
import express from 'express';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';

import { User } from '../database/models/User.model.ts';
import { mapUserFromDb } from '../types/user.types.ts';

export function setupAuth(app: express.Application): void {
  // Configure passport local strategy
  passport.use(
    new LocalStrategy(
      { usernameField: 'email' },
      async (email, password, done) => {
        try {
          // Find the user by email
          const user = await User.findOne({ email });

          // If user doesn't exist
          if (!user) {
            return done(null, false, { message: 'User not found' });
          }

          // Check if password is correct
          const isValidPassword = await bcrypt.compare(password, user.password);

          if (!isValidPassword) {
            return done(null, false, { message: 'Incorrect password' });
          }

          // Map database user to our User type
          return done(null, mapUserFromDb(user));
        } catch (error) {
          return done(error);
        }
      },
    ),
  );

  // Serialize user for session
  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await User.findById(id);
      if (!user) {
        return done(null, false);
      }

      // Map to our User type
      return done(null, mapUserFromDb(user));
    } catch (error) {
      return done(error);
    }
  });

  // Initialize passport and restore authentication state from session
  app.use(passport.initialize());
  app.use(passport.session());
}
