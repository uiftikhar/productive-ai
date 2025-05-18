import { Suspense } from 'react';
import { isAuthenticated } from '@/lib/server/auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ErrorBoundary } from '@/components/error-boundary';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SessionVisualization } from '@/components/meeting-analysis/visualization/SessionVisualization';
import { ResultsSection } from '@/components/meeting-analysis/ResultsSection';

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
      <h1 className="text-2xl font-bold mb-6">Meeting Analysis</h1>
      
      {/* Visualization Section */}
      <div className="mb-8">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Agent Workflow Visualization</CardTitle>
            <CardDescription>Real-time view of the analysis process</CardDescription>
          </CardHeader>
          <CardContent className="p-0 h-[600px]">
            <SessionVisualization sessionId={sessionId} />
          </CardContent>
        </Card>
      </div>
      
      {/* Results Section */}
      <div>
        <ResultsSection sessionId={sessionId} />
      </div>
    </div>
  );
} 