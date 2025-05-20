'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TranscriptStatus } from '@/types/transcript';
import { useTranscripts } from '@/components/TranscriptProvider';
import { TranscriptDetail } from '@/components/transcripts/TranscriptDetail';

interface TranscriptDetailPageProps {
  params: {
    id: string;
  };
}

export default function TranscriptDetailPage({ params }: TranscriptDetailPageProps) {
  const router = useRouter();
  const { getTranscript, isLoading, error, analyzeTranscript } = useTranscripts();
  const [transcript, setTranscript] = useState<ReturnType<typeof getTranscript>>(undefined);

  useEffect(() => {
    // Get the transcript from the context
    setTranscript(getTranscript(params.id));
  }, [params.id, getTranscript]);

  const handleBack = () => {
    router.push('/transcripts');
  };

  const handleAnalyze = async (id: string) => {
    try {
      console.log('Analyzing transcript:', id);
      // Start the analysis process but don't wait for it to complete
      analyzeTranscript(id);

      // Redirect to the visualization page
      router.push(`/transcripts/${id}/analyze`);
    } catch (error) {
      console.error('Error analyzing transcript:', error);
    }
  };

  if (isLoading) {
    return (
      <div className='container mx-auto px-4 py-8'>
        <div className='animate-pulse space-y-4'>
          <div className='h-8 w-1/4 rounded bg-gray-200'></div>
          <div className='h-4 w-1/2 rounded bg-gray-200'></div>
          <div className='h-64 rounded bg-gray-200'></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='container mx-auto px-4 py-8'>
        <div className='rounded-md border border-red-300 bg-red-50 p-4'>
          <h2 className='text-lg font-semibold text-red-600'>Error</h2>
          <p className='text-red-500'>{error.message}</p>
        </div>
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className='container mx-auto px-4 py-8'>
        <div className='text-center'>
          <h1 className='text-2xl font-bold text-red-500'>Transcript Not Found</h1>
          <p className='mt-4'>The transcript you're looking for doesn't exist.</p>
          <button
            className='mt-6 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600'
            onClick={handleBack}
          >
            Back to Transcripts
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className='container mx-auto px-4 py-8'>
      <TranscriptDetail transcript={transcript} onBack={handleBack} onAnalyze={handleAnalyze} />
    </div>
  );
}
