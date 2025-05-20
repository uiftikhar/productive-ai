'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MeetingAnalysisService,
  MeetingAnalysisResponse,
} from '@/lib/api/meeting-analysis-service';
import { ResultVisualization } from './result-visualization';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface ResultVisualizationWrapperProps {
  initialData: MeetingAnalysisResponse;
  sessionId: string;
}

export function ResultVisualizationWrapper({
  initialData,
  sessionId,
}: ResultVisualizationWrapperProps) {
  const [analysisData, setAnalysisData] = useState<MeetingAnalysisResponse>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  // Check if we need to refresh data (if status is not completed or failed)
  const needsRefresh = initialData.status === 'pending' || initialData.status === 'in_progress';

  // Handle manual refresh
  const handleRefresh = useCallback(async () => {
    if (!isAuthenticated) {
      setError('You must be logged in to refresh the data');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await MeetingAnalysisService.getAnalysisResults(sessionId);
      setAnalysisData(data);
    } catch (error: any) {
      console.error('Failed to refresh data:', error);
      setError(error?.response?.data?.message || error?.message || 'Failed to refresh data');

      // Handle auth errors
      if (error?.response?.status === 401) {
        setError('Your session has expired. Please log in again.');
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, sessionId]);

  // Single effect to refresh if needed when component mounts
  useEffect(() => {
    let autoRefreshTimer: NodeJS.Timeout | null = null;

    if (needsRefresh && isAuthenticated) {
      autoRefreshTimer = setTimeout(handleRefresh, 5000);
    }

    return () => {
      if (autoRefreshTimer) {
        clearTimeout(autoRefreshTimer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsRefresh, sessionId, isAuthenticated, handleRefresh]);

  return (
    <div>
      <div className='mb-6 flex items-center justify-between'>
        <h1 className='text-3xl font-bold'>Meeting Analysis Results</h1>
        <div className='flex gap-2'>
          <Button variant='outline' onClick={handleRefresh} disabled={loading || !isAuthenticated}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button variant='outline' onClick={() => router.push('/meeting-analysis')}>
            New Analysis
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant='destructive' className='mb-4'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ResultVisualization data={analysisData} isLoading={loading} onRefresh={handleRefresh} />
    </div>
  );
}
