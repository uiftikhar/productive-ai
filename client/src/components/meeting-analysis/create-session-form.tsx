'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MeetingAnalysisService, AnalysisParams } from '@/lib/api/meeting-analysis-service';
import { Textarea } from '@/components/ui/textarea';

interface CreateSessionFormProps {
  onSessionCreated: (sessionId: string) => void;
}

export function CreateSessionForm({ onSessionCreated }: CreateSessionFormProps) {
  const router = useRouter();
  
  const [analysisGoal, setAnalysisGoal] = useState('full_analysis');
  const [transcript, setTranscript] = useState('');
  const [participants, setParticipants] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [enabledExpertise, setEnabledExpertise] = useState<string[]>([
    'topic_analysis', 
    'action_item_extraction', 
    'summary_generation'
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Available expertise options
  const expertiseOptions = [
    { id: 'topic_analysis', label: 'Topic Analysis' },
    { id: 'action_item_extraction', label: 'Action Item Extraction' },
    { id: 'summary_generation', label: 'Summary Generation' },
    { id: 'sentiment_analysis', label: 'Sentiment Analysis' },
    { id: 'key_point_extraction', label: 'Key Point Extraction' }
  ];
  
  // Toggle expertise selection
  const toggleExpertise = (expertise: string) => {
    if (enabledExpertise.includes(expertise)) {
      setEnabledExpertise(enabledExpertise.filter(e => e !== expertise));
    } else {
      setEnabledExpertise([...enabledExpertise, expertise]);
    }
  };
  
  // Create and analyze in one step
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!transcript.trim()) {
      setError('Please enter a transcript to analyze');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Just notify parent that user wants to create a session
      // The actual session creation will happen in the parent component
      onSessionCreated("");
    } catch (err: any) {
      setError(err.message || 'Failed to analyze transcript');
      setIsLoading(false);
    }
  };
  
  return (
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
      
      <div className="space-y-3">
        <Label>Enabled Expertise (Optional)</Label>
        <div className="grid grid-cols-2 gap-2">
          {expertiseOptions.map((option) => (
            <div key={option.id} className="flex items-center space-x-2">
              <Checkbox 
                id={option.id}
                checked={enabledExpertise.includes(option.id)}
                onCheckedChange={() => toggleExpertise(option.id)}
              />
              <Label htmlFor={option.id} className="cursor-pointer">{option.label}</Label>
            </div>
          ))}
        </div>
      </div>
      
      <Button type="submit" className="w-full" disabled={isLoading}>
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
  );
} 