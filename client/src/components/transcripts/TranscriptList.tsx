'use client';

import React from 'react';
import Link from 'next/link';
import { useTranscripts, useDeleteTranscript } from '@/hooks/useTranscripts';
import { Transcript, TranscriptStatus } from '@/types/transcript';

export default function TranscriptList() {
  const { data: transcripts, isLoading, isError, error } = useTranscripts();
  const { mutate: deleteTranscript, isPending: isDeleting } = useDeleteTranscript();

  if (isLoading) {
    return (
      <div className='flex justify-center p-8'>
        <div className='inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-blue-500 border-r-transparent'></div>
        <p className='ml-2'>Loading transcripts...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className='p-8 text-center'>
        <p className='text-red-500'>Error loading transcripts:</p>
        <p>{(error as any)?.message || 'An unknown error occurred'}</p>
      </div>
    );
  }

  if (!transcripts || transcripts.length === 0) {
    return (
      <div className='p-8 text-center'>
        <p className='text-gray-500'>No transcripts found. Upload a transcript to get started.</p>
      </div>
    );
  }

  // Helper function to format date
  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Helper function to get status badge color
  const getStatusBadgeColor = (status: TranscriptStatus) => {
    switch (status) {
      case TranscriptStatus.UPLOADED:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case TranscriptStatus.PROCESSING:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case TranscriptStatus.ANALYZED:
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case TranscriptStatus.ERROR:
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className='overflow-x-auto'>
      <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
        <thead className='bg-gray-50 dark:bg-gray-800'>
          <tr>
            <th className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400'>
              Title
            </th>
            <th className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400'>
              Upload Date
            </th>
            <th className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400'>
              Status
            </th>
            <th className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400'>
              Tags
            </th>
            <th className='px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400'>
              Actions
            </th>
          </tr>
        </thead>
        <tbody className='divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-gray-900'>
          {transcripts.map((transcript: Transcript) => (
            <tr key={transcript.id} className='hover:bg-gray-50 dark:hover:bg-gray-800/50'>
              <td className='whitespace-nowrap px-6 py-4'>
                <Link
                  href={`/dashboard/transcripts/${transcript.id}`}
                  className='font-medium text-blue-600 hover:underline dark:text-blue-400'
                >
                  {transcript.title}
                </Link>
              </td>
              <td className='whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400'>
                {formatDate(transcript.uploadDate)}
              </td>
              <td className='whitespace-nowrap px-6 py-4'>
                <span
                  className={`rounded-full px-2 py-1 text-xs ${getStatusBadgeColor(
                    transcript.status
                  )}`}
                >
                  {transcript.status}
                </span>
              </td>
              <td className='px-6 py-4'>
                <div className='flex flex-wrap gap-1'>
                  {transcript.tags && transcript.tags.length > 0 ? (
                    transcript.tags.map((tag, index) => (
                      <span
                        key={index}
                        className='rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className='text-sm text-gray-400 dark:text-gray-500'>No tags</span>
                  )}
                </div>
              </td>
              <td className='whitespace-nowrap px-6 py-4 text-right text-sm font-medium'>
                <div className='flex justify-end space-x-2'>
                  <Link
                    href={`/dashboard/transcripts/${transcript.id}`}
                    className='text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300'
                  >
                    View
                  </Link>
                  <button
                    onClick={() => deleteTranscript(transcript.id)}
                    disabled={isDeleting}
                    className='text-red-600 hover:text-red-900 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300'
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
