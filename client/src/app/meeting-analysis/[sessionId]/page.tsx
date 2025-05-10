'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnalysisResults, AnalysisResultsResponse, AnalysisSession, MeetingAnalysisService, SubmitAnalysisParams } from '@/lib/api/meeting-analysis-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function SessionPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const router = useRouter();
  
  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [results, setResults] = useState<AnalysisResultsResponse | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState('transcript');

  // Load session data
  useEffect(() => {
    const loadSession = async () => {
      try {
        const sessionData = await MeetingAnalysisService.getSessionStatus(sessionId);
        setSession(sessionData);
        
        // Check if we need to start polling for results
        if (sessionData.status === 'processing') {
          setIsPolling(true);
        } else if (sessionData.status === 'completed') {
          loadResults();
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load session');
      }
    };
    
    loadSession();
  }, [sessionId]);
  
  // Poll for results if needed
  useEffect(() => {
    if (!isPolling) return;
    
    const pollInterval = setInterval(async () => {
      try {
        // Check session status
        const sessionData = await MeetingAnalysisService.getSessionStatus(sessionId);
        setSession(sessionData);
        
        // If completed, get results and stop polling
        if (sessionData.status === 'completed') {
          loadResults();
          setIsPolling(false);
          clearInterval(pollInterval);
        }
      } catch (err) {
        // Continue polling even if there's an error
        console.error('Error polling for status:', err);
      }
    }, 5000); // Poll every 5 seconds
    
    return () => clearInterval(pollInterval);
  }, [isPolling, sessionId]);
  
  // Load results if available
  const loadResults = async () => {
    try {
      const resultsData = await MeetingAnalysisService.getResults(sessionId);
      setResults(resultsData);
      
      // If completed but not processed yet, keep polling
      if (resultsData.status !== 'completed') {
        setIsPolling(true);
      } else {
        setIsPolling(false);
        setActiveTab('results');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load results');
    }
  };
  
  // Submit transcript for analysis
  const handleSubmitTranscript = async () => {
    if (!transcript.trim()) {
      setError('Please enter a transcript to analyze');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const params: SubmitAnalysisParams = {
        transcript,
        message: 'Please analyze this meeting transcript',
      };
      
      await MeetingAnalysisService.analyzeTranscript(sessionId, params);
      
      // Update session and start polling
      const updatedSession = await MeetingAnalysisService.getSessionStatus(sessionId);
      setSession(updatedSession);
      setIsPolling(true);
      setActiveTab('status');
    } catch (err: any) {
      setError(err.message || 'Failed to submit transcript');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Delete session and go back
  const handleDeleteSession = async () => {
    try {
      await MeetingAnalysisService.deleteSession(sessionId);
      router.push('/meeting-analysis');
    } catch (err: any) {
      setError(err.message || 'Failed to delete session');
    }
  };
  
  // Render status information
  const renderStatus = () => {
    if (!session) return null;
    
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analysis Status</CardTitle>
          <CardDescription>Current status of your meeting analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-20 text-sm font-medium">Status:</div>
              <div className="flex items-center gap-2">
                {session.status === 'created' && (
                  <>
                    <Clock className="h-5 w-5 text-yellow-500" />
                    <span>Ready for transcript</span>
                  </>
                )}
                {session.status === 'processing' && (
                  <>
                    <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                    <span>Processing</span>
                  </>
                )}
                {session.status === 'completed' && (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span>Completed</span>
                  </>
                )}
              </div>
            </div>
            
            {session.status === 'processing' && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Analysis Progress</span>
                  <span>{session.metadata.progress || 0}%</span>
                </div>
                <Progress value={session.metadata.progress || 0} className="h-2" />
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium">Analysis Goal</div>
                <div>{session.metadata.analysisGoal}</div>
              </div>
              
              <div>
                <div className="font-medium">Created</div>
                <div>{session.metadata.createdAt ? new Date(session.metadata.createdAt).toLocaleString() : 'Unknown'}</div>
              </div>
              
              {session.metadata.transcriptSubmitted && (
                <>
                  <div>
                    <div className="font-medium">Transcript Length</div>
                    <div>{session.metadata.transcriptLength?.toLocaleString() || 0} characters</div>
                  </div>
                  
                  <div>
                    <div className="font-medium">Processing Started</div>
                    <div>{session.metadata.processingStartedAt ? new Date(session.metadata.processingStartedAt).toLocaleString() : 'Unknown'}</div>
                  </div>
                </>
              )}
              
              {session.metadata.completedAt && (
                <div>
                  <div className="font-medium">Completed</div>
                  <div>{new Date(session.metadata.completedAt).toLocaleString()}</div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => router.push('/meeting-analysis')}>
            Back to List
          </Button>
          <Button variant="destructive" onClick={handleDeleteSession}>
            Delete Session
          </Button>
        </CardFooter>
      </Card>
    );
  };
  
  // Render transcript submission form
  const renderTranscriptForm = () => {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Submit Transcript</CardTitle>
          <CardDescription>
            Paste your meeting transcript below for analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Paste your meeting transcript here..."
            className="min-h-[300px]"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            disabled={isSubmitting || session?.status === 'processing' || session?.status === 'completed'}
          />
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => router.push('/meeting-analysis')}>
            Back
          </Button>
          <Button 
            onClick={handleSubmitTranscript} 
            disabled={isSubmitting || !transcript.trim() || session?.status === 'processing' || session?.status === 'completed'}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting
              </>
            ) : (
              'Submit for Analysis'
            )}
          </Button>
        </CardFooter>
      </Card>
    );
  };
  
  // Render analysis results
  const renderResults = () => {
    if (!results || !results.results) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>Analysis results will appear here when processing is complete</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-10 w-10 text-gray-300 animate-spin" />
              <p className="mt-4 text-gray-500">Waiting for results...</p>
            </div>
          </CardContent>
        </Card>
      );
    }
    
    const { topics, actionItems, summary } = results.results;
    
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analysis Results</CardTitle>
          <CardDescription>Insights extracted from your meeting transcript</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Summary</h3>
              <p className="text-gray-700">{summary}</p>
            </div>
            
            <Separator />
            
            <div>
              <h3 className="text-lg font-semibold mb-2">Topics Discussed</h3>
              <ul className="list-disc pl-5 space-y-1">
                {topics.map((topic, index) => (
                  <li key={index} className="text-gray-700">{topic}</li>
                ))}
              </ul>
            </div>
            
            <Separator />
            
            <div>
              <h3 className="text-lg font-semibold mb-2">Action Items</h3>
              {actionItems.length === 0 ? (
                <p className="text-gray-500">No action items identified</p>
              ) : (
                <ul className="space-y-3">
                  {actionItems.map((item, index) => (
                    <li key={index} className="bg-gray-50 p-3 rounded-md">
                      <div className="font-medium">{item.description}</div>
                      {item.assignee && (
                        <div className="text-sm text-gray-500 mt-1">
                          Assignee: {item.assignee}
                        </div>
                      )}
                      {item.dueDate && (
                        <div className="text-sm text-gray-500">
                          Due: {item.dueDate}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={() => router.push('/meeting-analysis')}>
            Back to List
          </Button>
        </CardFooter>
      </Card>
    );
  };
  
  // Show error if session loading failed
  if (error && !session) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => router.push('/meeting-analysis')}>
          Back to Meeting Analysis
        </Button>
      </div>
    );
  }
  
  // Show loading state
  if (!session) {
    return (
      <div className="container mx-auto py-8 flex justify-center">
        <Card className="w-full max-w-2xl">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-10 w-10 text-gray-300 animate-spin" />
              <p className="mt-4 text-gray-500">Loading session...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Meeting Analysis Session</h1>
      
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="results" disabled={session.status !== 'completed'}>Results</TabsTrigger>
        </TabsList>
        
        <TabsContent value="transcript" className="mt-6">
          {renderTranscriptForm()}
        </TabsContent>
        
        <TabsContent value="status" className="mt-6">
          {renderStatus()}
        </TabsContent>
        
        <TabsContent value="results" className="mt-6">
          {renderResults()}
        </TabsContent>
      </Tabs>
    </div>
  );
} 