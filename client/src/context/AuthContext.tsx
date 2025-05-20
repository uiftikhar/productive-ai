'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthService } from '../lib/api/auth-service';

// User type
interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

// Auth context type
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<any>;
  logout: () => Promise<void>;
}

// Create the auth context
const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

// Auth provider props
interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Parse a JWT token to extract user information
 */
function parseJwt(token: string): User | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    const payload = JSON.parse(jsonPayload);

    // Basic validation of expected fields
    if (!payload.sub && !payload.id && !payload.email) {
      console.error('Invalid token payload:', payload);
      return null;
    }

    return {
      id: payload.sub || payload.id,
      email: payload.email,
      firstName: payload.firstName || payload.given_name || '',
      lastName: payload.lastName || payload.family_name || '',
    };
  } catch (error) {
    console.error('Error parsing JWT token:', error);
    return null;
  }
}

// Auth provider component
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check authentication status on component mount
  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true);
      try {
        const token = AuthService.getToken();
        console.log('Auth Context - Initial token exists:', !!token);
        if (token) {
          setUser(parseJwt(token));
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Login function
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await AuthService.login({ email, password });

      // Set tokens in localStorage and cookies
      AuthService.setToken(response.accessToken);
      AuthService.setRefreshToken(response.refreshToken);

      // Parse the token to set user info
      const userInfo = parseJwt(response.accessToken);
      setUser(userInfo);
      setIsAuthenticated(true);

      console.log('Login successful, token stored in both localStorage and cookies');
      return response;
    } catch (error) {
      console.error('Login failed:', error);
      setIsAuthenticated(false);
      setUser(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await AuthService.logout();
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      setUser(null);
    }
  };

  // Auth context value
  const value = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook to use auth context
export function useAuth() {
  return useContext(AuthContext);
}

export default AuthContext;
