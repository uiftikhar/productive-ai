'use client';

import { useAgentVisualization } from '@/hooks/useAgentVisualization';
import { AgentGraph } from './AgentGraph';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface SessionVisualizationProps {
  sessionId: string;
}

export function SessionVisualization({ sessionId }: SessionVisualizationProps) {
  const { events, connected, isLoading, connectionError } = useAgentVisualization(sessionId);
  
  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }
  
  if (connectionError && events.length === 0) {
    return (
      <Alert variant="destructive" className="m-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Connection Error</AlertTitle>
        <AlertDescription>
          {connectionError}
          <p className="mt-2">Unable to connect to the visualization service.</p>
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="h-full relative">
      {!connected && events.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <div className="text-center p-4">
            <p className="text-lg font-medium">Waiting for analysis to begin...</p>
            <p className="text-sm text-muted-foreground">
              The visualization will appear when the analysis starts.
            </p>
          </div>
        </div>
      )}
      
      <AgentGraph 
        events={events} 
        sessionId={sessionId}
      />
    </div>
  );
} 