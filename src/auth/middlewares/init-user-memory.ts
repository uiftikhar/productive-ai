import type { NextFunction, Request, Response } from 'express';

import { initMemory } from '../../memory-client/mem0-client.ts';

/**
 * Middleware to initialize mem0 memory for authenticated users
 * This can be added to routes that need mem0 integration
 */
export async function initUserMemory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Skip if not authenticated
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
      return next();
    }

    // Check if user has id property to avoid type errors
    if (req.user && 'id' in req.user) {
      // Initialize mem0 memories for this user
      (req as any).userMemory = await initMemory(`user-tickets-${req.user.id}`);
      (req as any).userPreferences = await initMemory(
        `user-preferences-${req.user.id}`,
      );
    }

    next();
  } catch (error) {
    console.error('Error initializing user memory:', error);
    next(error);
  }
}
