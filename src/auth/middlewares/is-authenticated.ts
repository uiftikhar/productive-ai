import type { NextFunction, Request, Response } from 'express';

/**
 * Middleware to check if user is authenticated
 */
export function isAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Unauthorized' });
}
