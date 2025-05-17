import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Dashboard | Productive AI',
  description: 'Transcript Analysis Dashboard',
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Welcome to the Productive AI Transcript Analysis Dashboard
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Transcripts Card */}
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-2">Transcripts</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Upload and manage your meeting transcripts
          </p>
          <Link 
            href="/dashboard/transcripts"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            View Transcripts
          </Link>
        </div>
        
        {/* Analysis Card */}
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-2">Analysis</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            View analysis results and insights from your transcripts
          </p>
          <Link 
            href="/dashboard/analysis"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            View Analysis
          </Link>
        </div>
        
        {/* Knowledge Map Card */}
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-2">Knowledge Map</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Visualize relationships and gaps in knowledge
          </p>
          <Link 
            href="/dashboard/knowledge-map"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            View Knowledge Map
          </Link>
        </div>
      </div>
      
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
        <div className="space-y-4">
          <p className="text-gray-500 dark:text-gray-400 italic">
            No recent activity to display.
          </p>
        </div>
      </div>
    </div>
  );
} 