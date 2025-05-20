'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranscripts } from '@/components/TranscriptProvider';
import { TranscriptStatus } from '@/types/transcript';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';

interface LangGraphVisualizationProps {
  params: {
    id: string;
  };
}

export default function LangGraphVisualization({ params }: LangGraphVisualizationProps) {
  const router = useRouter();
  const { getTranscript, updateTranscript } = useTranscripts();
  const [transcript, setTranscript] = useState<ReturnType<typeof getTranscript>>(undefined);
  const [visualizationUrl, setVisualizationUrl] = useState<string | null>(null);
  const [langSmithUrl, setLangSmithUrl] = useState<string | null>(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('visualization');

  const startAnalysis = useCallback(
    async (id: string) => {
      setLoading(true);
      let retryCount = 0;
      const maxRetries = 2; // Limit retries to prevent infinite loops

      try {
        // Create form data to send to the API
        const formData = new FormData();

        const currentTranscript = getTranscript(id);
        if (!currentTranscript) {
          throw new Error('Transcript not found');
        }

        // Prepare transcript text in the same way as TranscriptProvider
        const transcriptText =
          currentTranscript.summary ||
          `Title: ${currentTranscript.title}\nDate: ${currentTranscript.uploadDate}\n` +
            (currentTranscript.tags ? `Tags: ${currentTranscript.tags.join(', ')}\n` : '') +
            `This is a structured representation of transcript ID: ${currentTranscript.id}`;

        const transcriptBlob = new Blob([transcriptText], { type: 'text/plain' });

        formData.append('transcript', transcriptBlob, 'transcript.txt');
        formData.append('meetingTitle', currentTranscript.title || 'Untitled Meeting');
        formData.append('visualization', 'true'); // Request visualization

        if (currentTranscript.tags && currentTranscript.tags.length) {
          formData.append('participantIds', JSON.stringify(currentTranscript.tags));
        }

        // Update status to PROCESSING
        updateTranscript(id, { status: TranscriptStatus.PROCESSING });

        // Call the API endpoint with retry logic
        const attemptRequest = async (attempt: number): Promise<any> => {
          try {
            console.log(`Analysis attempt ${attempt + 1} of ${maxRetries + 1}`);
            const response = await fetch('http://localhost:3000/api/generate-summary/summary', {
              method: 'POST',
              body: formData,
            });

            if (!response.ok) {
              throw new Error(`API error: ${response.status}`);
            }

            return await response.json();
          } catch (error) {
            if (attempt < maxRetries) {
              console.log(`Retry ${attempt + 1} after error:`, error);
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
              return attemptRequest(attempt + 1);
            }
            throw error; // Re-throw if max retries reached
          }
        };

        const result = await attemptRequest(0);
        setAnalysisResult(result);

        // Set visualization URLs if available
        if (result.visualizationUrl) {
          setVisualizationUrl(result.visualizationUrl);
        } else {
          // Handle case where visualization was requested but not returned
          console.log('No visualization URL returned from the server');
        }

        if (result.langSmithUrl) {
          setLangSmithUrl(result.langSmithUrl);
        }

        // Update transcript with the analysis results
        updateTranscript(id, {
          status: TranscriptStatus.ANALYZED,
          summary: result.analysis?.summary || '',
          keyPoints: Array.isArray(result.analysis?.decisions)
            ? result.analysis.decisions.map((d: any) => d.title)
            : [],
          speakerCount:
            typeof result.analysis?.speakerCount === 'number'
              ? result.analysis.speakerCount
              : currentTranscript.speakerCount,
          tags: Array.isArray(result.analysis?.tags)
            ? result.analysis.tags
            : currentTranscript.tags || ['Auto-tagged'],
        });

        setAnalysisComplete(true);
      } catch (err) {
        console.error('Error starting analysis:', err);
        const errorMessage =
          err instanceof Error ? err.message : 'An unknown error occurred during analysis';
        setError(errorMessage);

        // Even though the analysis failed, make the error state 'stable'
        // so we don't keep retrying and creating infinite requests
        updateTranscript(id, {
          status: TranscriptStatus.ERROR,
          summary: `Analysis failed: ${errorMessage}`,
        });
      } finally {
        setLoading(false);
      }
    },
    [
      getTranscript,
      updateTranscript,
      setLoading,
      setError,
      setAnalysisResult,
      setVisualizationUrl,
      setLangSmithUrl,
      setAnalysisComplete,
    ]
  );

  const pollAnalysisStatus = useCallback(
    async (id: string) => {
      // Poll every 3 seconds to check status, max 10 times (30 seconds total)
      let pollCount = 0;
      const maxPolls = 10;

      const interval = setInterval(async () => {
        pollCount++;
        const currentTranscript = getTranscript(id);

        // Immediately stop if we've reached max polls to prevent infinite polling
        if (pollCount >= maxPolls) {
          clearInterval(interval);
          setError('Analysis is taking longer than expected. Please check back later.');
          setLoading(false);
          return;
        }

        if (!currentTranscript) {
          clearInterval(interval);
          setError('Transcript not found');
          setLoading(false);
          return;
        }

        if (currentTranscript.status === TranscriptStatus.ANALYZED) {
          clearInterval(interval);

          // If we have analysis but no visualization, try to fetch it separately
          if (!visualizationUrl) {
            try {
              // Simple mock implementation to check for visualization
              console.log('Checking for visualization file...');
              // In a real implementation, you would poll an endpoint to check if the visualization is ready
            } catch (error) {
              console.error('Error fetching visualization:', error);
            }
          }

          setAnalysisComplete(true);
          setLoading(false);
        } else if (currentTranscript.status === TranscriptStatus.ERROR) {
          clearInterval(interval);
          setError('Analysis failed: ' + (currentTranscript.summary || 'Unknown error'));
          setLoading(false);
        }

        console.log(
          `Poll ${pollCount}/${maxPolls}: Transcript status: ${currentTranscript.status}`
        );
      }, 3000);

      // Clean up interval on unmount
      return () => clearInterval(interval);
    },
    [getTranscript, visualizationUrl, setAnalysisComplete, setLoading, setError]
  );

  useEffect(() => {
    // Get transcript from context
    const currentTranscript = getTranscript(params.id);
    setTranscript(currentTranscript);

    if (!currentTranscript) {
      setError('Transcript not found');
      setLoading(false);
      return;
    }

    // Start analysis if not already PROCESSING or ANALYZED
    if (
      currentTranscript.status !== TranscriptStatus.PROCESSING &&
      currentTranscript.status !== TranscriptStatus.ANALYZED
    ) {
      startAnalysis(currentTranscript.id);
    } else if (currentTranscript.status === TranscriptStatus.ANALYZED) {
      // If already analyzed, just show results
      setAnalysisComplete(true);
      setLoading(false);
    } else {
      // If processing, poll for updates
      pollAnalysisStatus(currentTranscript.id);
    }
  }, [
    params.id,
    getTranscript,
    startAnalysis,
    pollAnalysisStatus,
    setTranscript,
    setError,
    setLoading,
    setAnalysisComplete,
  ]);

  const handleBack = () => {
    router.push(`/transcripts/${params.id}`);
  };

  const renderVisualization = () => {
    if (visualizationUrl) {
      return (
        <div className='h-[600px] w-full overflow-hidden rounded-lg bg-white'>
          <iframe
            src={visualizationUrl}
            className='h-full w-full border-0'
            title='LangGraph Visualization'
          />
        </div>
      );
    }

    return (
      <div className='flex h-[400px] flex-col items-center justify-center rounded-lg border bg-muted/40 p-6'>
        <AlertCircle className='mb-4 h-12 w-12 text-muted-foreground' />
        <h3 className='text-lg font-medium'>No visualization available</h3>
        <p className='mt-2 text-center text-muted-foreground'>
          The server didn't return a visualization for this analysis.
        </p>
        {langSmithUrl && (
          <Button
            variant='outline'
            className='mt-4'
            onClick={() => window.open(langSmithUrl, '_blank')}
          >
            View in LangSmith
          </Button>
        )}
      </div>
    );
  };

  const renderAnalysisResults = () => {
    if (!analysisResult || !analysisResult.analysis) {
      return (
        <div className='flex h-[400px] flex-col items-center justify-center rounded-lg border bg-muted/40 p-6'>
          <AlertCircle className='mb-4 h-12 w-12 text-muted-foreground' />
          <h3 className='text-lg font-medium'>No analysis results available</h3>
          <p className='mt-2 text-center text-muted-foreground'>
            The analysis hasn't completed or didn't return results.
          </p>
        </div>
      );
    }

    const { analysis } = analysisResult;

    return (
      <div className='space-y-6'>
        <Card>
          <CardContent className='pt-6'>
            <h3 className='mb-2 text-lg font-semibold'>Summary</h3>
            <p className='text-muted-foreground'>{analysis.summary}</p>
          </CardContent>
        </Card>

        {analysis.decisions && analysis.decisions.length > 0 && (
          <Card>
            <CardContent className='pt-6'>
              <h3 className='mb-4 text-lg font-semibold'>Key Decisions</h3>
              <div className='space-y-4'>
                {analysis.decisions.map((decision: any, index: number) => (
                  <div key={index} className='border-b pb-4 last:border-b-0 last:pb-0'>
                    <h4 className='font-medium'>{decision.title}</h4>
                    <p className='mt-1 text-muted-foreground'>{decision.content}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  if (error) {
    return (
      <div className='container mx-auto px-4 py-8'>
        <Button variant='ghost' onClick={handleBack} className='mb-6'>
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back to Transcript
        </Button>

        <div className='rounded-lg border border-red-300 bg-red-50 p-6'>
          <h2 className='text-lg font-semibold text-red-700'>Error</h2>
          <p className='mt-2 text-red-600'>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='mb-6 flex items-center justify-between'>
        <Button variant='ghost' onClick={handleBack}>
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back to Transcript
        </Button>

        <div className='flex items-center'>
          {loading ? (
            <div className='flex items-center text-blue-600'>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              Processing...
            </div>
          ) : analysisComplete ? (
            <div className='flex items-center text-green-600'>
              <CheckCircle className='mr-2 h-4 w-4' />
              Analysis Complete
            </div>
          ) : null}
        </div>
      </div>

      <h1 className='mb-2 text-2xl font-bold'>{transcript?.title || 'Transcript Analysis'}</h1>

      <p className='mb-6 text-muted-foreground'>
        {analysisComplete
          ? 'Analysis completed. View the results below.'
          : 'Analyzing transcript and generating insights...'}
      </p>

      <Tabs
        defaultValue='visualization'
        value={activeTab}
        onValueChange={setActiveTab}
        className='space-y-4'
      >
        <TabsList className='grid w-full grid-cols-2'>
          <TabsTrigger value='visualization'>Flow Visualization</TabsTrigger>
          <TabsTrigger value='results'>Analysis Results</TabsTrigger>
        </TabsList>

        <TabsContent value='visualization' className='space-y-4'>
          {loading ? (
            <div className='flex h-[400px] flex-col items-center justify-center rounded-lg border'>
              <Loader2 className='mb-4 h-12 w-12 animate-spin text-blue-500' />
              <p className='text-muted-foreground'>Generating visualization...</p>
            </div>
          ) : (
            renderVisualization()
          )}
        </TabsContent>

        <TabsContent value='results' className='space-y-4'>
          {loading ? (
            <div className='flex h-[400px] flex-col items-center justify-center rounded-lg border'>
              <Loader2 className='mb-4 h-12 w-12 animate-spin text-blue-500' />
              <p className='text-muted-foreground'>Analyzing transcript...</p>
            </div>
          ) : (
            renderAnalysisResults()
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
