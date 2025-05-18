'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateSessionForm } from '@/components/meeting-analysis/create-session-form';
import { useAuth } from '@/context/AuthContext';

export default function MeetingAnalysisPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  // Handle new analysis creation
  const handleAnalysisStarted = async (sessionId: string) => {
    if (sessionId) {
      // Navigate to the analysis results page with the new sessionId
      router.push(`/meeting-analysis/${sessionId}`);
    }
  };

  // Show login prompt if not authenticated
  if (!isLoading && !isAuthenticated) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Meeting Analysis</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>
              Please log in to use the meeting analysis features
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <p className="mb-4 text-center">
              You need to be logged in to analyze meeting transcripts
            </p>
            <Button onClick={() => router.push('/auth/login')}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Meeting Analysis</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Create New Analysis</CardTitle>
          <CardDescription>
            Start a new meeting analysis by uploading a transcript
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateSessionForm onAnalysisStarted={handleAnalysisStarted} />
        </CardContent>
      </Card>
    </div>
  );

} 