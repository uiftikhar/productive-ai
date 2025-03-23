/* istanbul ignore file */

// Import the User type declarations
import '../../types/user.types.ts';

import bcryptjs from 'bcryptjs';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';

import { mapUserFromDb } from '../../types/user.types.ts';
import type { IUser } from '../models/User.model.ts';
import { User } from '../models/User.model.ts';

passport.use(
  new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
      try {
        const user: IUser | null = await User.findOne({ email });
        if (!user) {
          return done(null, false, { message: 'Incorrect email.' });
        }

        // Compare passwords (ensure passwords are hashed during registration)
        const isMatch = await bcryptjs.compare(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: 'Incorrect password.' });
        }

        return done(null, mapUserFromDb(user));
      } catch (error) {
        return done(error);
      }
    },
  ),
);

// Serialize user instance to the session
// Set any for now as the types are complex with passport
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user instance from the session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id);
    if (!user) {
      return done(null, null);
    }
    done(null, mapUserFromDb(user));
  } catch (error) {
    done(error, null);
  }
});

export { passport as passportClient };
