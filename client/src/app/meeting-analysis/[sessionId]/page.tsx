import { Suspense } from 'react';
import { getMeetingAnalysisResults } from '@/lib/server/meeting-analysis';
import { isAuthenticated } from '@/lib/server/auth';
import { ResultVisualizationWrapper } from '@/components/meeting-analysis/result-visualization-wrapper';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ErrorBoundary } from '@/components/error-boundary';

interface PageProps {
  params: {
    sessionId: string;
  };
}

export default async function MeetingAnalysisPage({ params }: PageProps) {
  const { sessionId } = params;
  
  // Check authentication status (server-side)
  const authenticated = isAuthenticated();
  
  if (!authenticated) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Authentication Required</AlertTitle>
          <AlertDescription>
            You need to be logged in to view meeting analysis results.
          </AlertDescription>
        </Alert>
        <Button asChild>
          <Link href="/auth/login">Log In</Link>
        </Button>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Meeting Analysis Results</h1>
      
      <ErrorBoundary 
        fallback={
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading Analysis</AlertTitle>
            <AlertDescription>
              There was a problem loading the analysis results. This may be due to an authentication issue.
              <div className="mt-2">
                <Button asChild className="mr-2">
                  <Link href="/auth/login">Log In</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/meeting-analysis">Back to Analysis</Link>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        }
      >
        <Suspense fallback={<AnalysisLoadingSkeleton />}>
          <AnalysisResults sessionId={sessionId} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

async function AnalysisResults({ sessionId }: { sessionId: string }) {
  try {
    // Add a short delay to ensure cookies are properly processed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const results = await getMeetingAnalysisResults(sessionId);
    
    return (
      <ResultVisualizationWrapper 
        initialData={results} 
        sessionId={sessionId} 
      />
    );
  } catch (error) {
    // Handle authentication errors specially
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Authentication Required</AlertTitle>
          <AlertDescription>
            <p>You must be logged in to view these results.</p>
            <div className="mt-2">
              <Button asChild>
                <Link href="/auth/login">Log In</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      );
    }
    
    // Handle other errors
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'Failed to load analysis results'}
          <div className="mt-2">
            <Button asChild variant="outline">
              <Link href="/meeting-analysis">Back to Analysis</Link>
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }
}

function AnalysisLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-24" />
      </div>
      
      <Skeleton className="h-10 w-full mb-4" />
      
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
} 