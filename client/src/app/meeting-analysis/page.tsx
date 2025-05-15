'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
// import { MeetingAnalysisDashboard } from '@/components/meeting-analysis/dashboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreateSessionForm } from '@/components/meeting-analysis/create-session-form';
import { SessionList } from '@/components/meeting-analysis/session-list';
import { MeetingAnalysisService } from '@/lib/api/meeting-analysis-service';

export default function MeetingAnalysisPage() {
  const [activeTab, setActiveTab] = useState('new');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const router = useRouter();

  // Handle session selection
  const handleSessionSelect = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    router.push(`/meeting-analysis/${sessionId}`);
  };

  // Handle new session creation
  const handleSessionCreated = async (sessionId: string) => {
    try {
      // Create a new session via the API
      const response = await MeetingAnalysisService.createSession();
      
      // Navigate to the session page with the new sessionId
      router.push(`/meeting-analysis/${response.sessionId}`);
    } catch (error) {
      console.error("Failed to create session:", error);
      alert("Failed to create session. Please try again.");
    }
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Meeting Analysis</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="new">New Analysis</TabsTrigger>
          <TabsTrigger value="sessions">My Sessions</TabsTrigger>
        </TabsList>
        
        <TabsContent value="new" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Create New Analysis Session</CardTitle>
              <CardDescription>
                Start a new meeting analysis by creating a session and uploading a transcript
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CreateSessionForm onSessionCreated={handleSessionCreated} />
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="sessions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>My Analysis Sessions</CardTitle>
              <CardDescription>
                View and manage your existing meeting analysis sessions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SessionList onSessionSelect={handleSessionSelect} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 