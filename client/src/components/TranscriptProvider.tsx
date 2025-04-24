'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Transcript, TranscriptStatus } from '@/types/transcript';

// Mock data for demonstration (in real app, this would be fetched from API)
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

interface TranscriptContextType {
  transcripts: Transcript[];
  isLoading: boolean;
  error: Error | null;
  getTranscript: (id: string) => Transcript | undefined;
  addTranscript: (transcript: Transcript) => void;
  updateTranscript: (id: string, updates: Partial<Transcript>) => void;
  deleteTranscript: (id: string) => void;
  analyzeTranscript: (id: string) => Promise<void>;
  analyzeUploadedTranscript: (file: File) => Promise<Transcript>;
}

const TranscriptContext = createContext<TranscriptContextType | undefined>(undefined);

export function useTranscripts() {
  const context = useContext(TranscriptContext);
  if (context === undefined) {
    throw new Error('useTranscripts must be used within a TranscriptProvider');
  }
  return context;
}

interface TranscriptProviderProps {
  children: ReactNode;
}

export function TranscriptProvider({ children }: TranscriptProviderProps) {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // In a real app, fetch transcripts from an API
    const fetchTranscripts = async () => {
      setIsLoading(true);
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        setTranscripts(mockTranscripts);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch transcripts'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchTranscripts();
  }, []);

  const getTranscript = (id: string) => {
    console.log('Getting transcript:', id);
    return transcripts.find(t => t.id === id);
  };

  const addTranscript = (transcript: Transcript) => {
    setTranscripts(prev => [transcript, ...prev]);
  };

  const updateTranscript = (id: string, updates: Partial<Transcript>) => {
    setTranscripts(prev => 
      prev.map(t => 
        t.id === id ? { ...t, ...updates } : t
      )
    );
  };

  const deleteTranscript = (id: string) => {
    setTranscripts(prev => prev.filter(t => t.id !== id));
  };

  const analyzeTranscript = async (id: string) => {
    const transcript = getTranscript(id);
    console.log('Analyzing transcript:', transcript);
    if (!transcript) {
      throw new Error('Transcript not found');
    }

    // Update status to PROCESSING
    updateTranscript(id, { status: TranscriptStatus.PROCESSING });

    try {
      // Create form data to send to the API
      const formData = new FormData();
      
      // Server expects a plain text file with a transcript
      // Since we don't have the actual transcript text, we'll send a structured 
      // representation of the transcript data that the server can process
      const transcriptText = transcript.summary || 
        `Title: ${transcript.title}\nDate: ${transcript.uploadDate}\n` +
        (transcript.tags ? `Tags: ${transcript.tags.join(', ')}\n` : '') +
        `This is a structured representation of transcript ID: ${transcript.id}`;
      
      const transcriptBlob = new Blob([transcriptText], { type: 'text/plain' });
      
      // Append the transcript as a file with just the name "transcript"
      formData.append('transcript', transcriptBlob, 'transcript.txt');
      
      // Add optional metadata as form fields
      formData.append('meetingTitle', transcript.title || 'Untitled Meeting');
      if (transcript.tags && transcript.tags.length) {
        formData.append('participantIds', JSON.stringify(transcript.tags));
      }
      
      console.log('Form data:', formData.get('transcript'));
      // Call the API endpoint
      // Centralize API URL
      const response = await fetch('http://localhost:3000/api/generate-summary/summary', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const result = await response.json();
      
      console.log('Result:', result);
      // Update the transcript with the analysis results
      updateTranscript(id, {
        status: TranscriptStatus.ANALYZED,
        summary: result.analysis?.summary || '',
        keyPoints: Array.isArray(result.analysis?.decisions) ? 
          result.analysis.decisions.map((d: any) => d.title) : [],
        speakerCount: typeof result.analysis?.speakerCount === 'number' 
          ? result.analysis.speakerCount 
          : transcript.speakerCount,
        tags: Array.isArray(result.analysis?.tags) ? 
          result.analysis.tags : (transcript.tags || ['Auto-tagged'])
      });
    } catch (error) {
      console.error('Error analyzing transcript:', error);
      
      // Update status to ERROR if analysis failed
      updateTranscript(id, { status: TranscriptStatus.ERROR });
      throw error;
    }
  };

  const analyzeUploadedTranscript = async (file: File): Promise<Transcript> => {
    const tempId = `temp-${Date.now()}`;
    
    // Create a temporary transcript object
    const tempTranscript: Transcript = {
      id: tempId,
      title: file.name.replace(/\.[^/.]+$/, ""), // Remove file extension from name
      uploadDate: new Date(),
      status: TranscriptStatus.PROCESSING,
      fileSize: file.size,
      fileType: file.name.substring(file.name.lastIndexOf('.')),
      speakerCount: 0,
      duration: 0,
      isTemporary: true // Mark as temporary
    };
    
    // Add to state
    addTranscript(tempTranscript);
    
    try {
      // Create form data for API
      const formData = new FormData();
      formData.append('transcript', file);
      
      // Call the summary API endpoint
      const response = await fetch('http://localhost:3000/api/generate-summary/summary', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Update with analysis results
      const analyzedTranscript: Transcript = {
        ...tempTranscript,
        status: TranscriptStatus.ANALYZED,
        summary: result.summary || '',
        keyPoints: Array.isArray(result.keyPoints) ? result.keyPoints : [],
        speakerCount: typeof result.speakerCount === 'number' ? result.speakerCount : 0,
        tags: Array.isArray(result.tags) ? result.tags : ['Auto-tagged']
      };
      
      // Update in state
      updateTranscript(tempId, analyzedTranscript);
      
      return analyzedTranscript;
    } catch (error) {
      console.error('Error analyzing transcript:', error);
      
      // Update status to ERROR
      updateTranscript(tempId, { status: TranscriptStatus.ERROR });
      throw error;
    }
  };

  const value = {
    transcripts,
    isLoading,
    error,
    getTranscript,
    addTranscript,
    updateTranscript,
    deleteTranscript,
    analyzeTranscript,
    analyzeUploadedTranscript,
  };

  return (
    <TranscriptContext.Provider value={value}>
      {children}
    </TranscriptContext.Provider>
  );
} 