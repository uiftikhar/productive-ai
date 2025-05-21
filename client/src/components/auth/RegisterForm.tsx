'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { AuthService } from '../../lib/api/auth-service';

// Registration form validation schema
const registerSchema = z
  .object({
    email: z.string().email('Please enter a valid email'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Password must be at least 6 characters'),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

const RegisterForm: React.FC = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormValues) => {
    try {
      setIsLoading(true);
      setError(null);

      // Register user via AuthService
      const response = await AuthService.signup({
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
      });

      // Store tokens
      AuthService.setToken(response.accessToken);
      AuthService.setRefreshToken(response.refreshToken);

      // Redirect to dashboard on successful registration
      router.push('/dashboard');
    } catch (err: any) {
      console.error('Registration error details:', err);
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='mx-auto w-full max-w-md rounded-lg bg-white p-6 shadow-md dark:bg-gray-800'>
      <h2 className='mb-6 text-center text-2xl font-bold'>Create an Account</h2>

      {error && (
        <div className='mb-4 rounded border border-red-400 bg-red-100 p-3 text-red-700'>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
        <div>
          <label htmlFor='email' className='mb-2 block text-sm font-medium'>
            Email
          </label>
          <input
            id='email'
            type='email'
            {...register('email')}
            className='w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500'
            disabled={isLoading}
          />
          {errors.email && <p className='mt-1 text-sm text-red-600'>{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor='firstName' className='mb-2 block text-sm font-medium'>
            First Name
          </label>
          <input
            id='firstName'
            type='text'
            {...register('firstName')}
            className='w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500'
            disabled={isLoading}
          />
          {errors.firstName && (
            <p className='mt-1 text-sm text-red-600'>{errors.firstName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor='lastName' className='mb-2 block text-sm font-medium'>
            Last Name
          </label>
          <input
            id='lastName'
            type='text'
            {...register('lastName')}
            className='w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500'
            disabled={isLoading}
          />
          {errors.lastName && (
            <p className='mt-1 text-sm text-red-600'>{errors.lastName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor='password' className='mb-2 block text-sm font-medium'>
            Password
          </label>
          <input
            id='password'
            type='password'
            {...register('password')}
            className='w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500'
            disabled={isLoading}
          />
          {errors.password && (
            <p className='mt-1 text-sm text-red-600'>{errors.password.message}</p>
          )}
        </div>

        <div>
          <label htmlFor='confirmPassword' className='mb-2 block text-sm font-medium'>
            Confirm Password
          </label>
          <input
            id='confirmPassword'
            type='password'
            {...register('confirmPassword')}
            className='w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500'
            disabled={isLoading}
          />
          {errors.confirmPassword && (
            <p className='mt-1 text-sm text-red-600'>{errors.confirmPassword.message}</p>
          )}
        </div>

        <button
          type='submit'
          disabled={isLoading}
          className='w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50'
        >
          {isLoading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div className='mt-4 text-center'>
        <p className='text-sm'>
          Already have an account?{' '}
          <a href='/auth/login' className='text-blue-600 hover:underline'>
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
};

export default RegisterForm;
