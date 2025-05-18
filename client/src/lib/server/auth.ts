import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Get the auth token from cookies with debugging
 */
export function getAuthToken(): string | undefined {
  try {
    const cookieStore = cookies();
    const allCookies = cookieStore.getAll();
    
    // Debug: List all cookie names
    console.log('Available cookies:', allCookies.map(c => c.name));
    
    // Try to get the token from different possible cookie names
    const token = cookieStore.get('auth_token')?.value || 
                  cookieStore.get('token')?.value ||
                  cookieStore.get('accessToken')?.value;
    
    console.log('Found auth token in cookies:', !!token);
    
    if (!token) {
      // Check all cookies for partial matches in case of naming inconsistency
      for (const cookie of allCookies) {
        if (cookie.name.toLowerCase().includes('token') || 
            cookie.name.toLowerCase().includes('auth')) {
          console.log(`Found potential auth cookie: ${cookie.name}`);
        }
      }
    }
    
    return token;
  } catch (error) {
    console.error('Error reading cookies:', error);
    return undefined;
  }
}

/**
 * Check if the user is authenticated on the server side
 * Returns true if authenticated, false otherwise
 */
export function isAuthenticated(): boolean {
  const token = getAuthToken();
  return !!token;
}

/**
 * Get authenticated headers for server-side API calls
 * This version doesn't redirect and provides a fallback for API calls
 */
export function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  
  return {
    'Authorization': token ? `Bearer ${token}` : '',
    'Content-Type': 'application/json',
  };
}

/**
 * Check if the user is authenticated on the server side
 * Redirects to login if not authenticated
 * Only use this in layout files or pages where redirect is acceptable
 */
export function requireAuth(): string {
  const token = getAuthToken();
  
  if (!token) {
    console.log('No auth token found, redirecting to login');
    redirect('/auth/login');
  }
  
  return token;
} 