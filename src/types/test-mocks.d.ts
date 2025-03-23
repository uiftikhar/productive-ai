// Mock declaration for testing purposes
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      role: string;
      isAdmin: boolean;
      roles: string[];
    }
  }
}
