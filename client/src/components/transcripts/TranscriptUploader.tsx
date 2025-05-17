'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useUploadTranscript } from '@/hooks/useTranscripts';

interface TranscriptUploaderProps {
  onSuccess?: (transcriptId: string) => void;
}

export default function TranscriptUploader({ onSuccess }: TranscriptUploaderProps) {
  const [metadata, setMetadata] = useState({
    source: 'manual-upload',
  });
  
  const { mutate: uploadTranscript, isPending, isError, error } = useUploadTranscript();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Only process the first file
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      
      // Extract a title from the filename (remove extension)
      const filenameParts = file.name.split('.');
      filenameParts.pop(); // Remove extension
      const title = filenameParts.join('.');
      
      const fileMetadata = {
        ...metadata,
        originalFilename: file.name,
        fileSize: file.size,
        fileType: file.type,
        title,
      };
      
      uploadTranscript(
        { file, metadata: fileMetadata },
        {
          onSuccess: (data) => {
            if (onSuccess) {
              onSuccess(data.id);
            }
          },
        }
      );
    }
  }, [metadata, uploadTranscript, onSuccess]);

  const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/json': ['.json'],
    },
    maxFiles: 1,
  });

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        {...getRootProps()}
        className={`p-8 border-2 border-dashed rounded-md text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center gap-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          {isDragActive ? (
            <p className="text-blue-500 font-medium">Drop the file here...</p>
          ) : (
            <div className="space-y-2">
              <p className="font-medium">Drag and drop a transcript file or click to browse</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Supported formats: TXT, PDF, DOCX, JSON
              </p>
            </div>
          )}
        </div>
      </div>

      {acceptedFiles.length > 0 && (
        <div className="mt-4 p-4 border border-gray-200 dark:border-gray-700 rounded-md">
          <p className="font-medium">Selected file:</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {acceptedFiles[0].name} ({(acceptedFiles[0].size / 1024).toFixed(2)} KB)
          </p>
        </div>
      )}

      {isPending && (
        <div className="mt-4 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-blue-500 border-r-transparent"></div>
          <p className="mt-2 text-blue-500">Uploading transcript...</p>
        </div>
      )}

      {isError && (
        <div className="mt-4 p-4 border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 rounded-md text-red-700 dark:text-red-400">
          <p className="font-medium">Error uploading transcript:</p>
          <p className="text-sm">{(error as any)?.message || 'An unknown error occurred'}</p>
        </div>
      )}
    </div>
  );
} 