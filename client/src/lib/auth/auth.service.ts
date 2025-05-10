/**
 * Authentication Service
 * 
 * Handles authentication functionality, including login, logout, and token management
 */
import { API_CONFIG } from '../../config/api';

// Default user credentials
const DEFAULT_USER = {
  email: 'abc@gmail.com',
  password: 'temp123456',
  name: 'Default User',
  role: 'admin'
};

/**
 * Authentication response
 */
export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Auth service for managing authentication
 */
export const AuthService = {
  /**
   * Login with credentials
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    // For development purposes, we'll simulate a successful login with the default user
    if (credentials.email === DEFAULT_USER.email && credentials.password === DEFAULT_USER.password) {
      // Create a mock JWT token
      const token = this.generateMockToken();
      
      // Store in localStorage
      localStorage.setItem('authToken', token);
      localStorage.setItem('user', JSON.stringify({
        id: 'user-1',
        email: DEFAULT_USER.email,
        name: DEFAULT_USER.name,
        role: DEFAULT_USER.role
      }));
      
      return {
        token,
        user: {
          id: 'user-1',
          email: DEFAULT_USER.email,
          name: DEFAULT_USER.name,
          role: DEFAULT_USER.role
        }
      };
    }
    
    throw new Error('Invalid credentials');
  },
  
  /**
   * Logout user
   */
  logout(): void {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  },
  
  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!localStorage.getItem('authToken');
  },
  
  /**
   * Get current user
   */
  getCurrentUser(): { id: string; email: string; name: string; role: string } | null {
    const userJson = localStorage.getItem('user');
    if (!userJson) return null;
    
    try {
      return JSON.parse(userJson);
    } catch (e) {
      return null;
    }
  },
  
  /**
   * Get auth token
   */
  getToken(): string | null {
    return localStorage.getItem('authToken');
  },
  
  /**
   * Generate a mock JWT token for development
   */
  generateMockToken(): string {
    // This is just a mock token for development
    // In production, you would get a real JWT from your server
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
      sub: 'user-1',
      name: DEFAULT_USER.name,
      email: DEFAULT_USER.email,
      role: DEFAULT_USER.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 // 24 hours
    }));
    const signature = btoa('mock-signature');
    
    return `${header}.${payload}.${signature}`;
  }
}; 