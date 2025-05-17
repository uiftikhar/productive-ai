'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { transcriptApi } from '@/lib/api/transcript';
import { Transcript } from '@/types/transcript';

// Query keys
const TRANSCRIPTS_KEY = 'transcripts';
const TRANSCRIPT_DETAIL_KEY = 'transcript-detail';
const SEARCH_TRANSCRIPTS_KEY = 'search-transcripts';

/**
 * Hook to fetch all transcripts for the current user
 */
export function useTranscripts() {
  return useQuery({
    queryKey: [TRANSCRIPTS_KEY],
    queryFn: transcriptApi.getTranscripts,
  });
}

/**
 * Hook to fetch a single transcript by ID
 */
export function useTranscript(id: string) {
  return useQuery({
    queryKey: [TRANSCRIPT_DETAIL_KEY, id],
    queryFn: () => transcriptApi.getTranscript(id),
    enabled: !!id,
  });
}

/**
 * Hook to search transcripts
 */
export function useSearchTranscripts(query: string) {
  return useQuery({
    queryKey: [SEARCH_TRANSCRIPTS_KEY, query],
    queryFn: () => transcriptApi.searchTranscripts(query),
    enabled: !!query,
  });
}

/**
 * Hook to upload a transcript
 */
export function useUploadTranscript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, metadata }: { file: File; metadata?: Record<string, any> }) =>
      transcriptApi.uploadTranscript(file, metadata),
    onSuccess: () => {
      // Invalidate the transcripts query to refetch the list
      queryClient.invalidateQueries({ queryKey: [TRANSCRIPTS_KEY] });
    },
  });
}

/**
 * Hook to update a transcript
 */
export function useUpdateTranscript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Transcript> }) =>
      transcriptApi.updateTranscript(id, data),
    onSuccess: (updatedTranscript) => {
      // Update the cache for this specific transcript
      queryClient.setQueryData(
        [TRANSCRIPT_DETAIL_KEY, updatedTranscript.id],
        updatedTranscript
      );

      // Also invalidate the main list
      queryClient.invalidateQueries({ queryKey: [TRANSCRIPTS_KEY] });
    },
  });
}

/**
 * Hook to delete a transcript
 */
export function useDeleteTranscript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => transcriptApi.deleteTranscript(id),
    onSuccess: (_, id) => {
      // Remove the transcript from the transcripts cache
      queryClient.setQueryData([TRANSCRIPTS_KEY], (oldData: Transcript[] | undefined) => {
        if (!oldData) return [];
        return oldData.filter((transcript) => transcript.id !== id);
      });

      // Remove the specific transcript detail from cache
      queryClient.removeQueries({ queryKey: [TRANSCRIPT_DETAIL_KEY, id] });
    },
  });
}

/**
 * Hook to analyze a transcript
 */
export function useAnalyzeTranscript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => transcriptApi.analyzeTranscript(id),
    onSuccess: (updatedTranscript) => {
      // Update the cache for this specific transcript
      queryClient.setQueryData(
        [TRANSCRIPT_DETAIL_KEY, updatedTranscript.id],
        updatedTranscript
      );

      // Also invalidate the main list
      queryClient.invalidateQueries({ queryKey: [TRANSCRIPTS_KEY] });
    },
  });
} 