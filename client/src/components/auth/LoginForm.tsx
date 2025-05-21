'use client';

import React, { useState } from 'react';
import { AuthService } from '../../lib/api/auth-service';
import { useRouter } from 'next/navigation';

interface LoginFormProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export default function LoginForm({ onSuccess, onError }: LoginFormProps) {
  const [email, setEmail] = useState('abc@gmail.com');
  const [password, setPassword] = useState('temp123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await AuthService.login({ email, password });

      // Store tokens in local storage
      AuthService.setToken(response.accessToken);
      AuthService.setRefreshToken(response.refreshToken);

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.message || (err instanceof Error ? err.message : 'Login failed');
      setError(errorMessage);

      if (onError && err instanceof Error) {
        onError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoginAsDefault = async () => {
    setEmail('abc@gmail.com');
    setPassword('temp123456');
    setLoading(true);
    setError(null);

    try {
      const response = await AuthService.login({
        email: 'abc@gmail.com',
        password: 'temp123456',
      });

      // Store tokens in local storage
      AuthService.setToken(response.accessToken);
      AuthService.setRefreshToken(response.refreshToken);

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.message || (err instanceof Error ? err.message : 'Login failed');
      setError(errorMessage);

      if (onError && err instanceof Error) {
        onError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='mx-auto w-full max-w-md rounded-lg bg-white p-6 shadow-md'>
      <h2 className='mb-6 text-center text-2xl font-bold'>Login</h2>

      {error && (
        <div className='mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600'>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className='mb-4'>
          <label htmlFor='email' className='mb-1 block text-sm font-medium text-gray-700'>
            Email
          </label>
          <input
            id='email'
            type='email'
            value={email}
            onChange={e => setEmail(e.target.value)}
            className='w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500'
            required
          />
        </div>

        <div className='mb-6'>
          <label htmlFor='password' className='mb-1 block text-sm font-medium text-gray-700'>
            Password
          </label>
          <input
            id='password'
            type='password'
            value={password}
            onChange={e => setPassword(e.target.value)}
            className='w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500'
            required
          />
        </div>

        <div className='flex flex-col space-y-2'>
          <button
            type='submit'
            disabled={loading}
            className='w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50'
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>

          <button
            type='button'
            onClick={handleLoginAsDefault}
            disabled={loading}
            className='w-full rounded-md bg-gray-100 px-4 py-2 font-medium text-gray-800 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50'
          >
            Login as Default User
          </button>
        </div>
      </form>

      <div className='mt-4 text-center text-sm text-gray-500'>
        <p>Default credentials: abc@gmail.com / temp123456</p>
      </div>
    </div>
  );
}
