import React from 'react';
import { useRouter } from 'next/navigation';
import { Transcript, TranscriptStatus } from '@/types/transcript';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateToLocal, formatBytes } from '@/lib/formatters';
import { ActivitySquare, LineChart, BarChart4 } from 'lucide-react';

const statusVariants = {
  [TranscriptStatus.UPLOADED]: 'info',
  [TranscriptStatus.PROCESSING]: 'warning',
  [TranscriptStatus.ANALYZED]: 'success',
  [TranscriptStatus.ERROR]: 'error',
} as const;

const statusLabel = {
  [TranscriptStatus.UPLOADED]: 'Uploaded',
  [TranscriptStatus.PROCESSING]: 'Processing',
  [TranscriptStatus.ANALYZED]: 'Analyzed',
  [TranscriptStatus.ERROR]: 'Error',
} as const;

export interface TranscriptDetailProps {
  transcript: Transcript;
  onAnalyze?: (id: string) => void;
  onBack: () => void;
}

export function TranscriptDetail({ transcript, onAnalyze, onBack }: TranscriptDetailProps) {
  const router = useRouter();
  const isAnalyzeDisabled = transcript.status !== TranscriptStatus.UPLOADED;
  
  const handleVisualizeClick = () => {
    router.push(`/transcripts/${transcript.id}/analyze`);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back
        </Button>
        
        <div className="flex space-x-2">
          {transcript.status !== TranscriptStatus.ERROR && (
            <Button 
              variant="outline"
              onClick={handleVisualizeClick}
              className="flex items-center"
            >
              <LineChart className="mr-2 h-4 w-4" />
              {transcript.status === TranscriptStatus.ANALYZED ? 'View Analysis' : 'Visualize Analysis'}
            </Button>
          )}
          
          {onAnalyze && (
            <Button 
              onClick={() => onAnalyze(transcript.id)}
              disabled={isAnalyzeDisabled}
              className="flex items-center"
            >
              {transcript.status === TranscriptStatus.PROCESSING ? (
                <>
                  <ActivitySquare className="mr-2 h-4 w-4 animate-pulse" />
                  Processing...
                </>
              ) : (
                <>
                  <BarChart4 className="mr-2 h-4 w-4" />
                  Analyze Transcript
                </>
              )}
            </Button>
          )}
        </div>
      </div>
      
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{transcript.title}</h1>
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <span>{formatDateToLocal(transcript.uploadDate)}</span>
          <span>•</span>
          <Badge variant={statusVariants[transcript.status]}>
            {statusLabel[transcript.status]}
          </Badge>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border rounded-lg">
          <h3 className="text-sm font-medium text-muted-foreground mb-1">File Type</h3>
          <p>{transcript.fileType || 'Unknown'}</p>
        </div>
        <div className="p-4 border rounded-lg">
          <h3 className="text-sm font-medium text-muted-foreground mb-1">File Size</h3>
          <p>{transcript.fileSize ? formatBytes(transcript.fileSize) : 'Unknown'}</p>
        </div>
        <div className="p-4 border rounded-lg">
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Duration</h3>
          <p>
            {transcript.duration 
              ? `${Math.floor(transcript.duration / 60)}:${(transcript.duration % 60).toString().padStart(2, '0')}` 
              : 'Unknown'}
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h3 className="text-lg font-medium">Speaker Info</h3>
          <div className="p-4 border rounded-lg">
            <p className="text-muted-foreground">
              {transcript.speakerCount 
                ? `${transcript.speakerCount} speakers detected` 
                : 'No speaker information available'}
            </p>
          </div>
        </div>
        
        <div className="space-y-2">
          <h3 className="text-lg font-medium">Tags</h3>
          <div className="p-4 border rounded-lg">
            {transcript.tags && transcript.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {transcript.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary">{tag}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No tags available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 