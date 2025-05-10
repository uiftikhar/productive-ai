'use client';

import { useEffect, useState } from 'react';
import { AnalysisSession, MeetingAnalysisService } from '@/lib/api/meeting-analysis-service';
import { AlertCircle, ArrowRight, CheckCircle, Clock, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SessionListProps {
  onSessionSelect: (sessionId: string) => void;
}

export function SessionList({ onSessionSelect }: SessionListProps) {
  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  
  // Load sessions on component mount
  useEffect(() => {
    loadSessions();
  }, []);
  
  // Load sessions from API
  const loadSessions = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const sessionsData = await MeetingAnalysisService.listSessions();
      setSessions(sessionsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Delete a session
  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent session selection
    setIsDeleting(sessionId);
    
    try {
      await MeetingAnalysisService.deleteSession(sessionId);
      setSessions(sessions.filter(session => session.sessionId !== sessionId));
    } catch (err: any) {
      setError(err.message || 'Failed to delete session');
    } finally {
      setIsDeleting(null);
    }
  };
  
  // Format timestamp to readable date
  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleString();
  };
  
  // Show loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <p className="mt-4 text-muted-foreground">Loading sessions...</p>
      </div>
    );
  }
  
  // Show error if loading failed
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  
  // Show empty state if no sessions
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">You don't have any analysis sessions yet.</p>
        <p className="text-muted-foreground">Create a new session to get started.</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <ScrollArea className="h-[400px] pr-4">
        {sessions.map((session) => (
          <Card 
            key={session.sessionId} 
            className="mb-4 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => onSessionSelect(session.sessionId)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  Analysis Session
                </CardTitle>
                <div className="flex items-center gap-2">
                  {session.status === 'created' && (
                    <Clock className="h-5 w-5 text-yellow-500" />
                  )}
                  {session.status === 'processing' && (
                    <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                  )}
                  {session.status === 'completed' && (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  )}
                  <span className="text-sm font-medium capitalize">{session.status}</span>
                </div>
              </div>
              <CardDescription>
                Created: {formatTimestamp(session.metadata.createdAt)}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="pb-3">
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                <div>
                  <span className="font-medium">Goal:</span>{' '}
                  <span className="capitalize">
                    {session.metadata.analysisGoal?.replace(/_/g, ' ') || 'Unknown'}
                  </span>
                </div>
                
                {session.metadata.transcriptSubmitted && (
                  <div>
                    <span className="font-medium">Transcript Length:</span>{' '}
                    <span>{session.metadata.transcriptLength?.toLocaleString() || 0} chars</span>
                  </div>
                )}
                
                {session.metadata.completedAt && (
                  <div>
                    <span className="font-medium">Completed:</span>{' '}
                    <span>{formatTimestamp(session.metadata.completedAt)}</span>
                  </div>
                )}
              </div>
              
              {session.status === 'processing' && session.metadata.progress !== undefined && (
                <div className="mt-3">
                  <Progress value={session.metadata.progress} className="h-2" />
                  <div className="mt-1 text-xs text-right text-muted-foreground">
                    {session.metadata.progress}% complete
                  </div>
                </div>
              )}
            </CardContent>
            
            <CardFooter className="flex justify-between pt-1">
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={(e) => handleDeleteSession(session.sessionId, e)}
                disabled={isDeleting === session.sessionId}
              >
                {isDeleting === session.sessionId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span className="sr-only">Delete</span>
              </Button>
              
              <Button variant="outline" size="sm">
                <span className="mr-1">View</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </ScrollArea>
      
      <Button onClick={loadSessions} variant="secondary" className="w-full">
        Refresh Sessions
      </Button>
    </div>
  );
} 