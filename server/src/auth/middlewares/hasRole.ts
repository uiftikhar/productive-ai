import type { NextFunction, Request, Response } from 'express';

export function hasRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user && (req.user as any).role === role) {
      return next();
    }
    res.status(403).json({ message: 'Forbidden: Insufficient role' });
  };
}
