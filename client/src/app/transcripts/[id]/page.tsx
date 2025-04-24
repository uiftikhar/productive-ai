'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TranscriptStatus } from '@/types/transcript';
import { useTranscripts } from '@/components/TranscriptProvider';
import { TranscriptDetail } from '@/components/transcripts/TranscriptDetail';

interface TranscriptDetailPageProps {
  params: {
    id: string;
  }
}

export default function TranscriptDetailPage({ params }: TranscriptDetailPageProps) {
  const router = useRouter();
  const { 
    getTranscript, 
    isLoading, 
    error, 
    analyzeTranscript 
  } = useTranscripts();
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
      await analyzeTranscript(id);
      // Refresh the transcript after analysis
      setTranscript(getTranscript(id));
    } catch (error) {
      console.error('Error analyzing transcript:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="p-4 border border-red-300 bg-red-50 rounded-md">
          <h2 className="text-red-600 text-lg font-semibold">Error</h2>
          <p className="text-red-500">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-500">Transcript Not Found</h1>
          <p className="mt-4">The transcript you're looking for doesn't exist.</p>
          <button 
            className="mt-6 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={handleBack}
          >
            Back to Transcripts
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <TranscriptDetail
        transcript={transcript} 
        onBack={handleBack} 
        onAnalyze={handleAnalyze}
      />
    </div>
  );
} 