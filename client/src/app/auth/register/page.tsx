import { Metadata } from 'next';
import RegisterForm from '@/components/auth/RegisterForm';

export const metadata: Metadata = {
  title: 'Register | Productive AI',
  description: 'Create a new Productive AI account',
};

export default function RegisterPage() {
  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-100 p-4 dark:bg-gray-900'>
      <RegisterForm />
    </div>
  );
}
