/* istanbul ignore file */

import bcryptjs from 'bcryptjs';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';

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
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    },
  ),
);

// Serialize user instance to the session
passport.serializeUser((user, done) => {
  done(null, (user as IUser).id);
});

// Deserialize user instance from the session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export { passport as passportClient };
