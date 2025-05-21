import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Dashboard | Productive AI',
  description: 'Transcript Analysis Dashboard',
};

export default function DashboardPage() {
  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-3xl font-bold tracking-tight'>Dashboard</h1>
        <p className='text-gray-500 dark:text-gray-400'>
          Welcome to the Productive AI Transcript Analysis Dashboard
        </p>
      </div>

      <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
        {/* Transcripts Card */}
        <div className='rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800'>
          <h2 className='mb-2 text-xl font-semibold'>Transcripts</h2>
          <p className='mb-4 text-gray-600 dark:text-gray-300'>
            Upload and manage your meeting transcripts
          </p>
          <Link
            href='/dashboard/transcripts'
            className='inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700'
          >
            View Transcripts
          </Link>
        </div>

        {/* Analysis Card */}
        <div className='rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800'>
          <h2 className='mb-2 text-xl font-semibold'>Analysis</h2>
          <p className='mb-4 text-gray-600 dark:text-gray-300'>
            View analysis results and insights from your transcripts
          </p>
          <Link
            href='/dashboard/analysis'
            className='inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700'
          >
            View Analysis
          </Link>
        </div>

        {/* Knowledge Map Card */}
        <div className='rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800'>
          <h2 className='mb-2 text-xl font-semibold'>Knowledge Map</h2>
          <p className='mb-4 text-gray-600 dark:text-gray-300'>
            Visualize relationships and gaps in knowledge
          </p>
          <Link
            href='/dashboard/knowledge-map'
            className='inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700'
          >
            View Knowledge Map
          </Link>
        </div>
      </div>

      <div className='rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800'>
        <h2 className='mb-4 text-xl font-semibold'>Recent Activity</h2>
        <div className='space-y-4'>
          <p className='italic text-gray-500 dark:text-gray-400'>No recent activity to display.</p>
        </div>
      </div>
    </div>
  );
}
