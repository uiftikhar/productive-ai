'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AuthService } from '@/lib/api/auth-service';
import Cookies from 'js-cookie';

/**
 * Component that verifies authentication is properly synced between
 * localStorage and cookies. This ensures server components can access auth.
 */
export function AuthCheck() {
  const { isAuthenticated } = useAuth();
  const [synced, setSynced] = useState(true);

  useEffect(() => {
    // Check if authenticated according to context
    if (isAuthenticated) {
      // Check if token exists in localStorage but not in cookies
      const localToken = localStorage.getItem('auth_token');
      const cookieToken = Cookies.get('auth_token');

      console.log('Auth Check - Local Storage Token:', !!localToken);
      console.log('Auth Check - Cookie Token:', !!cookieToken);

      if (localToken && !cookieToken) {
        console.log('Syncing token from localStorage to cookies');
        // Re-sync token to cookies
        AuthService.setToken(localToken);
        setSynced(false);

        // Verify sync was successful
        setTimeout(() => {
          const cookieToken = Cookies.get('auth_token');
          console.log('Auth Check - Cookie Token after sync:', !!cookieToken);
          setSynced(!!cookieToken);
        }, 100);
      }
    }
  }, [isAuthenticated]);

  // This component doesn't render anything visible
  return null;
}
