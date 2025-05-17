import React from 'react';
import { Transcript, TranscriptStatus } from '@/types/transcript';
import { Badge } from '@/components/ui/badge';
import { formatDateToLocal, formatBytes } from '@/lib/formatters';

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

export interface TranscriptListProps {
  transcripts: Transcript[];
  onSelectTranscript: (transcript: Transcript) => void;
}

export function TranscriptList({ transcripts, onSelectTranscript }: TranscriptListProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Your Transcripts</h2>
      
      {transcripts.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg text-muted-foreground">
          <p>No transcripts found. Upload a transcript to get started.</p>
        </div>
      ) : (
        <div className="overflow-hidden border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Title</th>
                <th className="px-4 py-3 text-left font-medium">Upload Date</th>
                <th className="px-4 py-3 text-left font-medium">Duration</th>
                <th className="px-4 py-3 text-left font-medium">Size</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {transcripts.map((transcript) => (
                <tr 
                  key={transcript.id}
                  className="border-t hover:bg-muted/50 cursor-pointer"
                  onClick={() => onSelectTranscript(transcript)}
                >
                  <td className="px-4 py-3 font-medium">{transcript.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDateToLocal(transcript.uploadDate)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {transcript.duration ? `${Math.floor(transcript.duration / 60)}:${(transcript.duration % 60).toString().padStart(2, '0')}` : '--'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {transcript.fileSize ? formatBytes(transcript.fileSize) : '--'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariants[transcript.status]}>
                      {statusLabel[transcript.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
} 