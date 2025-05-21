'use client';

import React, { useEffect, useState } from 'react';
import { AuthService } from '../../lib/auth/auth.service';

interface AutoLoginProps {
  children: React.ReactNode;
  enabled?: boolean;
}

/**
 * AutoLogin Component
 *
 * Automatically logs in the default user when the component mounts
 */
export default function AutoLogin({ children, enabled = true }: AutoLoginProps) {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Effect to run on component mount
  useEffect(() => {
    // Skip if auto-login is disabled or already logged in
    if (!enabled || AuthService.isAuthenticated()) {
      setIsLoggedIn(AuthService.isAuthenticated());
      return;
    }

    const loginDefaultUser = async () => {
      setIsLoggingIn(true);
      setError(null);

      try {
        await AuthService.login({
          email: 'abc@gmail.com',
          password: 'temp123456',
        });

        setIsLoggedIn(true);
        console.log('Auto login successful');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Auto login failed');
        console.error('Auto login failed:', err);
      } finally {
        setIsLoggingIn(false);
      }
    };

    loginDefaultUser();
  }, [enabled]);

  // Loading indicator while logging in
  if (isLoggingIn) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-gray-50'>
        <div className='text-center'>
          <p className='mb-2 text-sm text-gray-600'>Logging in automatically...</p>
          <div className='mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-blue-500'></div>
        </div>
      </div>
    );
  }

  // Error message if auto-login fails
  if (error) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-gray-50'>
        <div className='max-w-md rounded bg-white p-4 shadow'>
          <h2 className='mb-2 text-xl font-bold text-red-600'>Auto Login Failed</h2>
          <p className='mb-4 text-gray-700'>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className='rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600'
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Render children if auto-login is disabled or login is successful
  return <>{children}</>;
}
