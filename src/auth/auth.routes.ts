import bcryptjs from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';

import { passportClient } from '../database/config/passport.ts';
import type { IUser } from '../database/models/index.ts';
import { User } from '../database/models/index.ts';
import { hasRole, isAuthenticated } from './middlewares/index.ts';

const router = Router();

router.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, role } = req.body;

      // Validate required fields
      if (!email || !password) {
        return res
          .status(400)
          .json({ message: 'Email and password are required.' });
      }

      // Check if a user with the provided email already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists.' });
      }

      // Hash the password
      const saltRounds = 10;
      const hashedPassword = await bcryptjs.hash(password, saltRounds);

      // Create and save the new user
      const newUser: IUser = new User({
        email,
        password: hashedPassword,
        role: role || 'user', // default to 'user' if no role is provided
      });

      await newUser.save();

      // Optionally, you could automatically log in the user after registration

      return res
        .status(201)
        .json({ message: 'User registered successfully', user: newUser });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Example route for login
 */
router.post('/login', (req: Request, res: Response, next: NextFunction) => {
  passportClient.authenticate(
    'local',
    (err: any, user: Express.User | false, info: { message?: string }) => {
      if (err) return next(err);

      if (!user) return res.status(400).json({ message: info.message });

      req.logIn(user, (err) => {
        if (err) return next(err);
        return res.json({ message: 'Logged in successfully', user });
      });
    },
  )(req, res, next);
});

/**
 * Example protected route
 */
router.get('/protected', isAuthenticated, (req: Request, res: Response) => {
  res.json({
    message: 'You have access to this protected route!',
    user: req.user,
  });
});

/**
 * Example admin route
 */
router.get(
  '/admin',
  isAuthenticated,
  hasRole('admin'),
  (req: Request, res: Response) => {
    res.json({ message: 'Welcome, Admin!' });
  },
);

/**
 * Logout route
 */
router.get('/logout', (req: Request, res: Response) => {
  req.logout(() => {
    res.json({ message: 'Logged out successfully' });
  });
});

export { router as authRoutes };
