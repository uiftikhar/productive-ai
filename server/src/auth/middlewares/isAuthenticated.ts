import type { NextFunction, Request, Response } from 'express';

/**
 * Middleware: isAuthenticated
 */
export function isAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // In test mode, bypass authentication
  if (process.env.TEST_MODE === 'true') {
    return next();
  }

  // Normal authentication flow
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Unauthorized' });
}
