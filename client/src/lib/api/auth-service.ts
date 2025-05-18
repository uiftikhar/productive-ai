import axios from 'axios';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Cookie settings for better security
const COOKIE_OPTIONS = {
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  expires: 7, // 7 days
  path: '/'
};

interface LoginCredentials {
  email: string;
  password: string;
}

interface SignUpCredentials {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export const AuthService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, credentials, {
        withCredentials: true,
      });
      
      // Store tokens in both localStorage and cookies for client/server sync
      this.setToken(response.data.accessToken);
      this.setRefreshToken(response.data.refreshToken);
      
      return response.data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },

  async signup(credentials: SignUpCredentials): Promise<AuthResponse> {
    try {
      const response = await axios.post(`${API_URL}/auth/register`, credentials, {
        withCredentials: true,
      });
      
      // Store tokens in both localStorage and cookies
      this.setToken(response.data.accessToken);
      this.setRefreshToken(response.data.refreshToken);
      
      return response.data;
    } catch (error) {
      console.error('Signup error:', error);
      throw error;
    }
  },

  async logout(): Promise<void> {
    try {
      await axios.post(`${API_URL}/auth/logout`, {}, {
        withCredentials: true,
      });
      this.clearToken();
    } catch (error) {
      console.error('Logout error:', error);
      this.clearToken(); // Clear tokens even if API call fails
      throw error;
    }
  },

  async refreshToken(): Promise<AuthResponse> {
    try {
      const refreshToken = this.getRefreshToken();
      const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken }, {
        withCredentials: true,
      });
      
      // Update stored tokens
      this.setToken(response.data.accessToken);
      this.setRefreshToken(response.data.refreshToken);
      
      return response.data;
    } catch (error) {
      console.error('Token refresh error:', error);
      throw error;
    }
  },

  getToken(): string | null {
    return localStorage.getItem('auth_token') || Cookies.get('auth_token') || null;
  },

  getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token') || Cookies.get('refresh_token') || null;
  },

  setToken(token: string): void {
    localStorage.setItem('auth_token', token);
    Cookies.set('auth_token', token, COOKIE_OPTIONS);
    
    // Also set in document.cookie for server components to access
    document.cookie = `auth_token=${token}; path=/; ${COOKIE_OPTIONS.secure ? 'secure; ' : ''}samesite=${COOKIE_OPTIONS.sameSite}; max-age=${60*60*24*COOKIE_OPTIONS.expires}`;
  },

  setRefreshToken(token: string): void {
    localStorage.setItem('refresh_token', token);
    Cookies.set('refresh_token', token, COOKIE_OPTIONS);
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },

  clearToken(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    Cookies.remove('auth_token');
    Cookies.remove('refresh_token');
    
    // For server components to know tokens were cleared
    document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  },
}; 