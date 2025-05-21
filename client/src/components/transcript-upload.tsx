import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';

export interface TranscriptUploadProps {
  onUpload: (file: File) => void;
  isUploading?: boolean;
}

export function TranscriptUpload({ onUpload, isUploading = false }: TranscriptUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File upload handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files[0]);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className='w-full'>
      <div
        className={`
          rounded-lg border-2 border-dashed p-6 text-center
          ${dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/20'}
          ${isUploading ? 'pointer-events-none opacity-50' : ''}
        `}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type='file'
          ref={fileInputRef}
          className='hidden'
          accept='.txt,.json,.vtt,.srt'
          onChange={handleFileChange}
          disabled={isUploading}
        />

        <div className='space-y-4'>
          <div className='flex justify-center'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              fill='none'
              viewBox='0 0 24 24'
              strokeWidth={1.5}
              stroke='currentColor'
              className='h-12 w-12 text-muted-foreground'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5'
              />
            </svg>
          </div>

          <div>
            <p className='text-lg font-medium'>
              {dragActive ? 'Drop the file here' : 'Upload a transcript file'}
            </p>
            <p className='mt-1 text-sm text-muted-foreground'>
              Drag and drop or click to upload a transcript file
            </p>
            <p className='mt-1 text-xs text-muted-foreground'>
              Supported formats: .txt, .json, .vtt, .srt
            </p>
          </div>

          <Button type='button' onClick={handleButtonClick} disabled={isUploading}>
            {isUploading ? 'Uploading...' : 'Select File'}
          </Button>
        </div>
      </div>
    </div>
  );
}
