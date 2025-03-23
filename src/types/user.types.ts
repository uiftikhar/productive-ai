import type { IUser } from '../database/models/User.model.ts';

/**
 * User representation for use in authenticated requests
 */
export interface User {
  id: string;
  email: string;
  role: string;
  isAdmin: boolean; // Explicitly defined for admin access checks
  roles: string[]; // Changed from optional to required
}

/**
 * Extended Express Request interface with strongly typed user
 */
declare global {
  namespace Express {
    // This is Express's own declaration merging
    interface User {
      id: string;
      email: string;
      role: string;
      isAdmin: boolean;
      roles: string[];
    }
  }
}

/**
 * Convert database user model to application user type
 */
export function mapUserFromDb(dbUser: IUser): User {
  return {
    id: dbUser._id?.toString() || dbUser.id || '',
    email: dbUser.email,
    role: dbUser.role,
    isAdmin: dbUser.role === 'admin',
    roles: [dbUser.role], // Convert single role to roles array for compatibility
  };
}
