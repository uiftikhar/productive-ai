'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  AnalysisResults, 
  AnalysisResultsResponse, 
  AnalysisSession, 
  MeetingAnalysisService, 
  AnalysisParams 
} from '@/lib/api/meeting-analysis-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// import { ScrollArea } from '@/components/ui/scroll-area';
// import AgentVisualization from './agent-visualization';

export default function SessionPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const router = useRouter();
  
  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [results, setResults] = useState<any | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState('transcript');

  // Load session data
  useEffect(() => {
    const loadSession = async () => {
      try {
        // Ensure sessionId has the correct format
        const formattedSessionId = sessionId.startsWith('session-') ? sessionId : `session-${sessionId}`;
        
        const sessionData = await MeetingAnalysisService.getSessionStatus(formattedSessionId);
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
  
  // Store form values
  const [meetingTitle, setMeetingTitle] = useState('Meeting Transcript Analysis');
  const [analysisGoal, setAnalysisGoal] = useState('comprehensive_analysis');
  const [participants, setParticipants] = useState<string[]>([]);
  
  // Poll for results if needed
  useEffect(() => {
    if (!isPolling) return;
    
    const pollInterval = setInterval(async () => {
      try {
        // Ensure sessionId has the correct format
        const formattedSessionId = sessionId.startsWith('session-') ? sessionId : `session-${sessionId}`;
        
        // Check session status
        const sessionData = await MeetingAnalysisService.getSessionStatus(formattedSessionId);
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
      // Ensure sessionId has the correct format
      const formattedSessionId = sessionId.startsWith('session-') ? sessionId : `session-${sessionId}`;
      
      const resultsData = await MeetingAnalysisService.getResults(formattedSessionId);
      console.log('resultsData', resultsData);
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
      // Use the new API for transcript analysis
      const response = await MeetingAnalysisService.analyzeTranscript({
        transcript,
        options: {
          title: meetingTitle,
          analysisGoal: analysisGoal,
          participants: participants.map(p => ({ id: p, name: p }))
        }
      });
      
      // Update the local state with the response data
      setSession(response);
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
      // Ensure sessionId has the correct format
      const formattedSessionId = sessionId.startsWith('session-') ? sessionId : `session-${sessionId}`;
      
      await MeetingAnalysisService.cancelAnalysis(formattedSessionId);
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
  
  // Render transcript submission form with visualization
  const renderTranscriptForm = () => {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Submit Transcript</CardTitle>
            <CardDescription>
              Paste your meeting transcript below for analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Meeting Title</Label>
                <Input 
                  placeholder="Enter meeting title"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Analysis Goal</Label>
                <Select 
                  value={analysisGoal} 
                  onValueChange={setAnalysisGoal}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select analysis goal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comprehensive_analysis">Comprehensive Analysis</SelectItem>
                    <SelectItem value="action_items_only">Action Items Only</SelectItem>
                    <SelectItem value="summary_only">Summary Only</SelectItem>
                    <SelectItem value="topics_only">Topics Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Textarea
                placeholder="Paste your meeting transcript here..."
                className="min-h-[300px]"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                disabled={isSubmitting || session?.status === 'processing' || session?.status === 'completed'}
              />
            </div>
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
      </div>
    );
  };
  
  // Render analysis results
  const renderResults = () => {
    if (!results || !results.results || !results.results.results) {
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
    
    // Extract data from the nested results structure
    const resultData = results.results.results;
    
    // Handle error case
    if (resultData.error) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Analysis Failed</CardTitle>
            <CardDescription>There was an error during the analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{resultData.error}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      );
    }
    
    const topics = resultData.topics || [];
    const actionItems = resultData.actionItems || [];
    const summary = resultData.summary || {};
    
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
              {summary && typeof summary === 'object' ? (
                <>
                  <p className="text-gray-700 font-medium">{summary.short}</p>
                  {summary.detailed && (
                    <p className="text-gray-600 mt-2 text-sm">{summary.detailed}</p>
                  )}
                </>
              ) : (
                <p className="text-gray-700">{String(summary)}</p>
              )}
            </div>
            
            <Separator />
            
            <div>
              <h3 className="text-lg font-semibold mb-2">Topics Discussed</h3>
              {topics && topics.length > 0 ? (
                <ul className="list-disc pl-5 space-y-1">
                  {topics.map((topic: any, index: number) => (
                    <li key={index} className="text-gray-700">
                      {typeof topic === 'string' ? topic : topic.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500">No topics identified</p>
              )}
            </div>
            
            <Separator />
            
            <div>
              <h3 className="text-lg font-semibold mb-2">Action Items</h3>
              {actionItems && actionItems.length > 0 ? (
                <ul className="space-y-3">
                  {actionItems.map((item: any, index: number) => (
                    <li key={index} className="bg-gray-50 p-3 rounded-md">
                      <div className="font-medium">{item.description}</div>
                      {item.assignee && (
                        <div className="text-sm text-gray-500 mt-1">
                          Assignee: {item.assignee}
                        </div>
                      )}
                      {item.assignees && item.assignees.length > 0 && (
                        <div className="text-sm text-gray-500 mt-1">
                          Assignee: {item.assignees.join(', ')}
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
              ) : (
                <p className="text-gray-500">No action items identified</p>
              )}
            </div>
          </div>
          {/* <Card>
            <CardHeader>
              <CardTitle>Visualization</CardTitle>
              <CardDescription>
                Real-time visualization of the analysis process
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AgentVisualization sessionId={sessionId} />
            </CardContent>
          </Card> */}
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
          <TabsTrigger value="results" disabled={session?.status !== 'completed'}>Results</TabsTrigger>
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