'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MeetingAnalysisService, AnalyzeTranscriptRequest } from '@/lib/api/meeting-analysis-service';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';

interface CreateSessionFormProps {
  onAnalysisStarted: (sessionId: string) => void;
}

export function CreateSessionForm({ onAnalysisStarted }: CreateSessionFormProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  
  const [analysisGoal, setAnalysisGoal] = useState('full_analysis');
  const [transcript, setTranscript] = useState('');
  const [participants, setParticipants] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Submit transcript for analysis
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!transcript.trim()) {
      setError('Please enter a transcript to analyze');
      return;
    }

    if (!isAuthenticated) {
      setError('You must be logged in to analyze transcripts');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Create request payload
      const request: AnalyzeTranscriptRequest = {
        transcript: transcript,
        metadata: {
          title: meetingTitle || 'Untitled Meeting',
          participants: participants ? participants.split(',').map(p => p.trim()) : [],
          analysisType: analysisGoal as 'full_analysis' | 'action_items_only' | 'summary_only' | 'topics_only'
        }
      };
      
      // Send analysis request
      const response = await MeetingAnalysisService.analyzeTranscript(request);
      
      // Immediately redirect to session page
      router.push(`/meeting-analysis/${response.sessionId}`);
      
      // Notify parent with the session ID
      onAnalysisStarted(response.sessionId);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to analyze transcript');
      setIsLoading(false);
    }
  };
  
  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <div className="space-y-2">
          <Label htmlFor="meetingTitle">Meeting Title (Optional)</Label>
          <Input 
            id="meetingTitle" 
            value={meetingTitle} 
            onChange={(e) => setMeetingTitle(e.target.value)} 
            placeholder="Enter meeting title" 
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="participants">Participants (Optional, comma-separated)</Label>
          <Input 
            id="participants" 
            value={participants} 
            onChange={(e) => setParticipants(e.target.value)} 
            placeholder="John Doe, Jane Smith" 
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="analysisGoal">Analysis Goal</Label>
          <Select value={analysisGoal} onValueChange={setAnalysisGoal}>
            <SelectTrigger id="analysisGoal">
              <SelectValue placeholder="Select analysis goal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full_analysis">Full Analysis</SelectItem>
              <SelectItem value="action_items_only">Action Items Only</SelectItem>
              <SelectItem value="summary_only">Summary Only</SelectItem>
              <SelectItem value="topics_only">Topics Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="transcript">Meeting Transcript</Label>
          <Textarea 
            id="transcript" 
            value={transcript} 
            onChange={(e) => setTranscript(e.target.value)} 
            placeholder="Paste your meeting transcript here..." 
            className="min-h-[200px]"
            required 
          />
        </div>
        
        <Button type="submit" className="w-full" disabled={isLoading || !isAuthenticated}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing Transcript
            </>
          ) : (
            'Analyze Transcript'
          )}
        </Button>
      </form>
    </div>
  );
} 