'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MeetingAnalysisService, AnalysisResult } from '@/lib/api/meeting-analysis-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/context/AuthContext';

export default function ResultsPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState('summary');

  // Load results on component mount
  useEffect(() => {
    if (!isAuthenticated) {
      setError('You must be logged in to view analysis results');
      setIsLoading(false);
      return;
    }
    
    loadResults();
    
    // Set up polling if needed
    if (isPolling) {
      const pollInterval = setInterval(() => {
        loadResults();
      }, 5000); // Poll every 5 seconds
      
      return () => clearInterval(pollInterval);
    }
  }, [sessionId, isAuthenticated, isPolling]);
  
  // Load analysis results
  const loadResults = async () => {
    try {
      setIsLoading(true);
      const resultData = await MeetingAnalysisService.getAnalysisResults(sessionId);
      setResults(resultData);
      
      // Check if we should continue polling
      if (resultData.status === 'pending' || resultData.status === 'in_progress') {
        setIsPolling(true);
      } else {
        setIsPolling(false);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load analysis results');
      setIsPolling(false);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Show auth error
  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Authentication Required</AlertTitle>
          <AlertDescription>Please log in to view analysis results</AlertDescription>
        </Alert>
        <Button onClick={() => router.push('/auth/login')}>
          Go to Login
        </Button>
      </div>
    );
  }
  
  // Show loading state
  if (isLoading && !results) {
    return (
      <div className="container mx-auto py-8 flex justify-center">
        <Card className="w-full max-w-2xl">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-10 w-10 text-gray-300 animate-spin" />
              <p className="mt-4 text-gray-500">Loading analysis results...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Show error
  if (error && !results) {
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
  
  // Show pending state
  if (!results || results.status === 'pending' || results.status === 'in_progress') {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Analysis in Progress</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>Processing Your Transcript</CardTitle>
            <CardDescription>
              We're analyzing your meeting transcript. This may take a few minutes.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center py-8">
            <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
            <p className="text-center text-gray-600">
              Please wait while our AI analyzes your transcript. This page will automatically update when complete.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Handle error in results
  if (results.status === 'failed' || results.errors?.length) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Analysis Failed</h1>
        
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Analysis Error</AlertTitle>
          <AlertDescription>
            {results.message || results.errors?.[0]?.error || 'An error occurred during analysis'}
          </AlertDescription>
        </Alert>
        
        <Button onClick={() => router.push('/meeting-analysis')}>
          Back to Meeting Analysis
        </Button>
      </div>
    );
  }
  
  // Extract data from results
  const topics = results.topics || [];
  const actionItems = results.actionItems || [];
  const summary = results.summary || {};
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Analysis Results</h1>
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              {/* <CardTitle>{summary.title || 'Meeting Analysis'}</CardTitle> */}
              <CardDescription>Completed analysis of your meeting transcript</CardDescription>
            </div>
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
              <span className="text-sm font-medium">Completed</span>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3 mb-6">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="topics">Topics</TabsTrigger>
              <TabsTrigger value="actions">Action Items</TabsTrigger>
            </TabsList>
            
            {/* <TabsContent value="summary">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Executive Summary</h3>
                  <p className="text-gray-700">{summary.executive_summary || 'No summary available'}</p>
                </div>
                
                {summary.key_points && summary.key_points.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Key Points</h3>
                    <ul className="list-disc pl-5 space-y-1">
                      {summary.key_points.map((point: string, index: number) => (
                        <li key={index} className="text-gray-700">{point}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {summary.decisions && summary.decisions.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Decisions Made</h3>
                    <ul className="list-disc pl-5 space-y-1">
                      {summary.decisions.map((decision: any, index: number) => (
                        <li key={index} className="text-gray-700">
                          {decision.description}
                          {decision.stakeholders && decision.stakeholders.length > 0 && (
                            <span className="text-gray-500 text-sm ml-2">
                              (Stakeholders: {decision.stakeholders.join(', ')})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {summary.next_steps && summary.next_steps.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Next Steps</h3>
                    <ul className="list-disc pl-5 space-y-1">
                      {summary.next_steps.map((step: string, index: number) => (
                        <li key={index} className="text-gray-700">{step}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </TabsContent> */}
            
            <TabsContent value="topics">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold mb-2">Topics Discussed</h3>
                
                {topics.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {topics.map((topic, index) => (
                      <Card key={index} className="overflow-hidden">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">{topic.name}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-600 mb-2">{topic.description}</p>
                          
                          {topic.keywords && topic.keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {topic.keywords.map((keyword, kidx) => (
                                <span 
                                  key={kidx} 
                                  className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                                >
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No topics identified</p>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="actions">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold mb-2">Action Items</h3>
                
                {actionItems.length > 0 ? (
                  <div className="space-y-3">
                    {actionItems.map((item, index) => (
                      <Card key={index} className="overflow-hidden">
                        <CardContent className="pt-4">
                          <div className="font-medium">{item.description}</div>
                          
                          <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                            {item.assignee && (
                              <div>Assignee: {item.assignee}</div>
                            )}
                            
                            {item.dueDate && (
                              <div>Due: {item.dueDate}</div>
                            )}
                            
                            {item.priority && (
                              <div>Priority: {item.priority}</div>
                            )}
                            
                            {item.status && (
                              <div>Status: {item.status}</div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No action items identified</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
        
        <CardFooter>
          <Button variant="outline" onClick={() => router.push('/meeting-analysis')}>
            Back to Meeting Analysis
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
} 