'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

// Sample transcript
const SAMPLE_TRANSCRIPT = `
Alice: Welcome everyone to our weekly project update meeting. Today, we'll discuss the current progress and next steps.
Bob: Great. I've finished implementing the user authentication system.
Charlie: That's good news. I'm still working on the database schema for the analytics module.
Alice: Let's set a deadline for that. Can you complete it by next Friday?
Charlie: Yes, I think that's doable. I'll need to coordinate with Dave from the backend team.
Bob: Speaking of deadlines, we should also discuss the timeline for the new feature rollout.
Alice: You're right. Let's schedule a separate meeting with the product team for Thursday.
Dave: That works for me. I can present the backend architecture then.
Alice: Perfect. Any other issues we need to address today?
Charlie: Yes, we might need to revisit our budget for the external APIs we're using.
Alice: Good point. Bob, can you prepare a report on our current API usage and costs?
Bob: Sure, I'll have that ready by Wednesday.
Alice: Great, I think that covers everything for today. Thank you all.
`;

export default function TestMeetingAnalysisPage() {
  const [transcript, setTranscript] = useState(SAMPLE_TRANSCRIPT);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [results, setResults] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  
  // Server runs on PORT 3000
  const apiBaseUrl = 'http://localhost:3000';
  
  // Add log message
  const addLog = (message: string) => {
    setLogs(prevLogs => [...prevLogs, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };
  
  // Start the test
  const startTest = async () => {
    setStatus('creating');
    setSessionId(null);
    setProgress(0);
    setResults(null);
    setError(null);
    setLogs([]);
    
    try {
      // Step 1: Create a session
      addLog('Creating analysis session...');
      const sessionResponse = await fetch(`${apiBaseUrl}/api/v1/analysis/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisGoal: 'full_analysis',
          enabledExpertise: ['topic_analysis', 'action_item_extraction', 'summary_generation']
        })
      });
      
      if (!sessionResponse.ok) {
        throw new Error(`Failed to create session: ${sessionResponse.status}`);
      }
      
      const sessionData = await sessionResponse.json();
      const newSessionId = sessionData.data.sessionId;
      setSessionId(newSessionId);
      addLog(`Session created with ID: ${newSessionId}`);
      
      // Step 2: Submit transcript for analysis
      setStatus('submitting');
      addLog('Submitting transcript for analysis...');
      const analyzeResponse = await fetch(`${apiBaseUrl}/api/analysis/sessions/${newSessionId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          message: 'Please analyze this meeting transcript'
        })
      });
      
      if (!analyzeResponse.ok) {
        throw new Error(`Failed to submit transcript: ${analyzeResponse.status}`);
      }
      
      addLog('Transcript submitted successfully');
      setStatus('processing');
      startPolling(newSessionId);
      
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setStatus('error');
      addLog(`Error: ${err.message || 'An error occurred'}`);
    }
  };
  
  // Poll for results
  const startPolling = (sid: string) => {
    addLog('Polling for results...');
    let pollCount = 0;
    
    const pollInterval = setInterval(async () => {
      pollCount++;
      
      try {
        const resultsResponse = await fetch(`${apiBaseUrl}/api/analysis/sessions/${sid}/results`);

        // const response = await fetch('http://localhost:3000/api/generate-summary/summary', {
        //   method: 'POST',
        //   body: formData,
        // });
        
        if (!resultsResponse.ok) {
          throw new Error(`Failed to get results: ${resultsResponse.status}`);
        }
        
        const resultsData = await resultsResponse.json();
        const currentStatus = resultsData.data.status;
        const currentProgress = resultsData.data.progress || 0;
        
        setProgress(currentProgress);
        addLog(`Poll ${pollCount}: Status = ${currentStatus}, Progress = ${currentProgress}%`);
        
        if (currentStatus === 'completed') {
          clearInterval(pollInterval);
          setStatus('completed');
          setResults(resultsData.data.results?.results || resultsData.data.results);
          addLog('Analysis completed!');
        }
      } catch (err: any) {
        addLog(`Polling error: ${err.message || 'Unknown error'}`);
        // Continue polling despite errors
      }
    }, 2000); // Poll every 2 seconds
    
    // Cleanup after 60 seconds to prevent infinite polling
    setTimeout(() => {
      clearInterval(pollInterval);
      if (status !== 'completed') {
        setStatus('timeout');
        addLog('Polling timed out after 60 seconds');
      }
    }, 60000);
  };
  
  // Delete the session
  const deleteSession = async () => {
    if (!sessionId) return;
    
    try {
      addLog('Deleting session...');
      const deleteResponse = await fetch(`${apiBaseUrl}/api/analysis/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      
      if (!deleteResponse.ok) {
        throw new Error(`Failed to delete session: ${deleteResponse.status}`);
      }
      
      addLog('Session deleted successfully');
      setSessionId(null);
      setStatus('idle');
    } catch (err: any) {
      addLog(`Error deleting session: ${err.message || 'Unknown error'}`);
    }
  };
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Meeting Analysis API Test</h1>
      
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Test Input</CardTitle>
            <CardDescription>Sample transcript to analyze</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={transcript} 
              onChange={(e) => setTranscript(e.target.value)}
              className="min-h-[300px]"
              disabled={status !== 'idle' && status !== 'error' && status !== 'completed'}
            />
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              onClick={startTest}
              disabled={status === 'creating' || status === 'submitting' || status === 'processing'}
            >
              {status === 'creating' || status === 'submitting' || status === 'processing' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {status === 'creating' && 'Creating Session...'}
                  {status === 'submitting' && 'Submitting...'}
                  {status === 'processing' && 'Processing...'}
                </>
              ) : (
                'Start Test'
              )}
            </Button>
            
            {sessionId && (
              <Button
                variant="outline"
                onClick={deleteSession}
                disabled={status === 'creating' || status === 'submitting'}
              >
                Delete Session
              </Button>
            )}
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>Analysis output</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === 'processing' && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Processing</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}
            
            {results && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-1">Summary:</h3>
                  <p className="text-sm">{results.summary}</p>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-1">Topics:</h3>
                  <ul className="list-disc list-inside text-sm">
                    {results.topics && results.topics.map((topic: string, index: number) => (
                      <li key={index}>{topic}</li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-1">Action Items:</h3>
                  <ul className="list-disc list-inside text-sm">
                    {results.actionItems && results.actionItems.map((item: any, index: number) => (
                      <li key={index}>
                        {item.description}
                        {item.assignee && ` (Assignee: ${item.assignee})`}
                        {item.dueDate && ` (Due: ${item.dueDate})`}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            
            {!results && status !== 'processing' && (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                {status === 'idle' ? (
                  <p>Start the test to see results</p>
                ) : status === 'creating' || status === 'submitting' ? (
                  <div className="flex flex-col items-center">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="mt-2">Setting up analysis...</p>
                  </div>
                ) : status === 'error' ? (
                  <div className="flex flex-col items-center">
                    <AlertCircle className="h-8 w-8" />
                    <p className="mt-2">Error occurred</p>
                  </div>
                ) : status === 'timeout' ? (
                  <p>Analysis timed out</p>
                ) : (
                  <p>No results available</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Test Log</CardTitle>
            <CardDescription>API interaction log</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-black text-green-400 font-mono text-sm p-4 rounded h-[300px] overflow-auto">
              {logs.length === 0 ? (
                <p className="text-gray-500">Logs will appear here when you start the test</p>
              ) : (
                logs.map((log, index) => (
                  <div key={index}>{log}</div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 