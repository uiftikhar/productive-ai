'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TranscriptList } from '@/components/transcript-list';
import { TranscriptUpload } from '@/components/transcript-upload';
import { Transcript, TranscriptStatus } from '@/types/transcript';
import { useTranscripts } from '@/components/TranscriptProvider';

// Mock data for demonstration
const mockTranscripts: Transcript[] = [
  {
    id: '1',
    title: 'Team Meeting - Product Strategy',
    uploadDate: new Date('2023-10-15'),
    status: TranscriptStatus.ANALYZED,
    tags: ['Product', 'Strategy', 'Q4'],
    duration: 45 * 60, // 45 minutes
    speakerCount: 5,
    fileSize: 2400000, // ~2.4MB
    fileType: '.txt'
  },
  {
    id: '2',
    title: 'Client Interview - Feedback Session',
    uploadDate: new Date('2023-10-10'),
    status: TranscriptStatus.PROCESSING,
    tags: ['Client', 'Feedback'],
    duration: 32 * 60, // 32 minutes
    speakerCount: 3,
    fileSize: 1800000, // ~1.8MB
    fileType: '.vtt'
  },
  {
    id: '3',
    title: 'Engineering Stand-up',
    uploadDate: new Date('2023-10-05'),
    status: TranscriptStatus.UPLOADED,
    duration: 15 * 60, // 15 minutes
    speakerCount: 8,
    fileSize: 950000, // ~950KB
    fileType: '.srt'
  }
];

export default function TranscriptsPage() {
  const router = useRouter();
  const { 
    transcripts, 
    isLoading, 
    error, 
    addTranscript 
  } = useTranscripts();
  const [isUploading, setIsUploading] = useState(false);
  
  const handleSelectTranscript = (transcript: Transcript) => {
    router.push(`/transcripts/${transcript.id}`);
  };
  
  const handleUpload = async (file: File) => {
    try {
      setIsUploading(true);
      
      // In a real app, this would be an API call to upload the file
      // For demo purposes, we'll simulate a delay and add a new transcript
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const newTranscript: Transcript = {
        id: `${Date.now()}`,
        title: file.name.replace(/\.[^/.]+$/, ""), // Remove file extension from name
        uploadDate: new Date(),
        status: TranscriptStatus.UPLOADED,
        fileSize: file.size,
        fileType: file.name.substring(file.name.lastIndexOf('.')),
        speakerCount: 0, // To be determined after processing
        duration: 0, // To be determined after processing
      };
      
      addTranscript(newTranscript);
    } catch (error) {
      console.error('Error uploading file:', error);
      // In a real app, you would handle this error and show a notification
    } finally {
      setIsUploading(false);
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
          <h2 className="text-red-600 text-lg font-semibold">Error Loading Transcripts</h2>
          <p className="text-red-500">{error.message}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="space-y-8">
        <h1 className="text-3xl font-bold">Transcripts</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="sticky top-8 space-y-6">
              <h2 className="text-xl font-semibold">Upload New</h2>
              <TranscriptUpload onUpload={handleUpload} isUploading={isUploading} />
            </div>
          </div>
          
          <div className="lg:col-span-2">
            <TranscriptList 
              transcripts={transcripts} 
              onSelectTranscript={handleSelectTranscript} 
            />
          </div>
        </div>
      </div>
    </div>
  );
} 