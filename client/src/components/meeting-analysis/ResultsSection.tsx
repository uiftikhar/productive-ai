'use client';

import { useState, useEffect } from 'react';
import { MeetingAnalysisService, MeetingAnalysisResponse } from '@/lib/api/meeting-analysis-service';
import { ResultVisualization } from './result-visualization';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ResultsSectionProps {
  sessionId: string;
}

export function ResultsSection({ sessionId }: ResultsSectionProps) {
  const [results, setResults] = useState<MeetingAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchResults = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await MeetingAnalysisService.getAnalysisResults(sessionId);
      setResults(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load results');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchResults();
    
    // Auto-refresh if analysis is not complete
    const interval = setInterval(() => {
      if (results && (results.status === 'completed' || results.status === 'failed')) {
        clearInterval(interval);
      } else {
        fetchResults();
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [sessionId, results?.status]);
  
  if (loading && !results) {
    return <Skeleton className="h-96 w-full" />;
  }
  
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error loading results</AlertTitle>
        <AlertDescription>
          {error}
          <Button variant="outline" className="mt-2" onClick={fetchResults}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Analysis Results</h2>
        {results && results.status !== 'completed' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Analysis in progress... auto-refreshing
          </div>
        )}
      </div>
      
      {results && <ResultVisualization data={results} />}
    </div>
  );
} 