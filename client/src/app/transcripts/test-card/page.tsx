'use client';

import { useState } from 'react';
import TranscriptCard from '@/components/TranscriptCard';
import { Transcript, TranscriptStatus } from '@/types/transcript';

export default function TestTranscriptCardPage() {
  const [message, setMessage] = useState<string>('');
  
  const testTranscripts: Transcript[] = [
    {
      id: '1',
      title: 'Regular Transcript',
      status: TranscriptStatus.ANALYZED,
      uploadDate: new Date().toISOString(),
      tags: ['meeting', 'important'],
      duration: 1800, // 30 minutes
      speakerCount: 3,
      fileSize: 5242880, // 5MB
      fileType: 'mp3',
      summary: 'This is a regular transcript content',
      isTemporary: false
    },
    {
      id: '2',
      title: 'Temporary Transcript with a very long title that should be truncated properly by our component',
      status: TranscriptStatus.PROCESSING,
      uploadDate: new Date().toISOString(),
      tags: ['draft', 'temporary'],
      duration: 900, // 15 minutes
      speakerCount: 2,
      fileSize: 3145728, // 3MB
      fileType: 'wav',
      summary: 'This is a temporary transcript content',
      isTemporary: true
    },
    {
      id: '3',
      title: 'Error Transcript',
      status: TranscriptStatus.ERROR,
      uploadDate: new Date().toISOString(),
      tags: ['error', 'needs-review'],
      duration: 600, // 10 minutes
      speakerCount: 1,
      fileSize: 2097152, // 2MB
      fileType: 'mp4',
      summary: 'This transcript encountered an error during processing',
      isTemporary: false
    },
    {
      id: '4',
      title: 'Uploaded Transcript',
      status: TranscriptStatus.UPLOADED,
      uploadDate: new Date().toISOString(),
      tags: ['new', 'unprocessed'],
      duration: 1200, // 20 minutes
      speakerCount: 4,
      fileSize: 4194304, // 4MB
      fileType: 'mp3',
      summary: 'This transcript was just uploaded',
      isTemporary: true
    }
  ];

  const handleView = (id: string) => {
    setMessage(`Viewed transcript with ID: ${id}`);
  };

  const handleDelete = (id: string) => {
    setMessage(`Deleted transcript with ID: ${id}`);
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">TranscriptCard Test Page</h1>
      
      {message && (
        <div className="bg-blue-100 text-blue-800 p-4 mb-6 rounded">
          {message}
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {testTranscripts.map((transcript) => (
          <div key={transcript.id} className="h-full">
            <TranscriptCard
              transcript={transcript}
              onView={() => handleView(transcript.id)}
              onDelete={() => handleDelete(transcript.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
} 