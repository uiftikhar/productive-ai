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
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

// Create the auth context
const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: () => {},
});

// Auth provider props
interface AuthProviderProps {
  children: React.ReactNode;
}

// Auth provider component
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication status on component mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Check if user is authenticated
  const checkAuth = async () => {
    setIsLoading(true);
    
    try {
      if (AuthService.isAuthenticated()) {
        // Here we'd normally fetch the user profile from the backend
        // For now, we'll assume the token is valid if it exists
        // In a production app, you'd verify the token with the backend
        try {
          // We could add a refresh token flow here if needed
          // await AuthService.refreshToken();
          
          // For now, we'll just set a basic user from the token
          setUser({
            id: '1',
            email: 'user@example.com',
            firstName: 'User',
            lastName: 'Name'
          });
        } catch (err) {
          console.error('Error refreshing token:', err);
          setUser(null);
          AuthService.logout();
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Error checking authentication:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Login function
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await AuthService.login({ email, password });
      AuthService.setToken(response.accessToken);
      AuthService.setRefreshToken(response.refreshToken);
      setUser(response.user);
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
    isAuthenticated: !!user,
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