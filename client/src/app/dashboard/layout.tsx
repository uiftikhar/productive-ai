import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import DashboardLayout from '@/components/layout/DashboardLayout';

// Auth options for getServerSession
import { authOptions } from '@/lib/auth';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default async function Layout({ children }: DashboardLayoutProps) {
  // Check if user is authenticated
  const session = await getServerSession(authOptions);

  // If not authenticated, redirect to login
  if (!session) {
    redirect('/auth/login');
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
