import type { NextFunction, Request, Response } from 'express';

import { initUserMemory } from './init-user-memory.ts';
import { isAuthenticated } from './is-authenticated.ts';

/**
 * Combined middleware for authentication and memory initialization
 */
export function authenticateWithMemory(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  isAuthenticated(req, res, (err?: any) => {
    if (err) return next(err);

    // If authenticated, initialize memory
    initUserMemory(req, res, next);
  });
}
