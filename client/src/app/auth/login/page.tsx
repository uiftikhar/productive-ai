import { Metadata } from 'next';
import LoginForm from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Login | Productive AI',
  description: 'Login to access your Productive AI account',
};

export default function LoginPage() {
  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-100 p-4 dark:bg-gray-900'>
      <LoginForm />
    </div>
  );
}
