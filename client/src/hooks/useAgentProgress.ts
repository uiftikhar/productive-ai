import { useState, useEffect } from 'react';
import { API_CONFIG } from '../config/api';
import { fetchWithAuth } from '../lib/utils/auth-fetch';

/**
 * Agent progress response
 */
interface AgentProgressResponse {
  sessionId: string;
  progress: number;
  status: string;
  details?: Record<string, any>;
}

/**
 * Options for useAgentProgress hook
 */
interface UseAgentProgressOptions {
  /**
   * Polling interval in milliseconds
   */
  pollingInterval?: number;
  
  /**
   * Whether to poll immediately on mount
   */
  pollImmediately?: boolean;
  
  /**
   * Whether to automatically stop polling when progress reaches 100%
   */
  stopAtCompletion?: boolean;
}

/**
 * Hook for tracking agent progress
 */
export function useAgentProgress(
  sessionId: string | null,
  options: UseAgentProgressOptions = {}
): {
  progress: number;
  status: string;
  isLoading: boolean;
  error: Error | null;
  details: Record<string, any> | null;
  checkNow: () => Promise<void>;
} {
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<string>('pending');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [details, setDetails] = useState<Record<string, any> | null>(null);
  
  const pollingInterval = options.pollingInterval || 3000; // Default: 3 seconds
  const pollImmediately = options.pollImmediately !== false; // Default: true
  const stopAtCompletion = options.stopAtCompletion !== false; // Default: true
  
  const checkProgress = async (): Promise<void> => {
    if (!sessionId) {
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth(
        `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.agents.progress(sessionId)}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch agent progress');
      }
      
      const data: AgentProgressResponse = await response.json();
      
      setProgress(data.progress);
      setStatus(data.status);
      setDetails(data.details || null);
      setIsLoading(false);
    } catch (error) {
      console.error('Error checking agent progress:', error);
      setError(error instanceof Error ? error : new Error('Unknown error'));
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    // Reset state when sessionId changes
    setProgress(0);
    setStatus('pending');
    setError(null);
    setDetails(null);
    
    if (!sessionId) {
      setIsLoading(false);
      return;
    }
    
    if (pollImmediately) {
      checkProgress();
    }
    
    // Set up polling if we have a sessionId
    let intervalId: NodeJS.Timeout | null = null;
    
    if (sessionId) {
      intervalId = setInterval(async () => {
        await checkProgress();
        
        // Stop polling if we're at 100% and stopAtCompletion is true
        if (stopAtCompletion && (progress === 100 || status === 'completed')) {
          if (intervalId) {
            clearInterval(intervalId);
          }
        }
      }, pollingInterval);
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [sessionId, pollingInterval, stopAtCompletion]);
  
  return {
    progress,
    status,
    isLoading,
    error,
    details,
    checkNow: checkProgress
  };
} 