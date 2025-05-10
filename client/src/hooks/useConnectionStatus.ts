import { useState, useEffect } from 'react';
import { HealthService, HealthStatus } from '../lib/api/health-service';

/**
 * Connection status for the server
 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'degraded' | 'loading';

/**
 * Options for the useConnectionStatus hook
 */
interface UseConnectionStatusOptions {
  /**
   * Polling interval in milliseconds
   */
  pollingInterval?: number;
  
  /**
   * Whether to poll immediately on mount
   */
  pollImmediately?: boolean;
}

/**
 * Hook for monitoring server connection status
 */
export function useConnectionStatus(options: UseConnectionStatusOptions = {}): {
  status: ConnectionStatus;
  lastChecked: Date | null;
  checkNow: () => Promise<void>;
  details: HealthStatus | null;
} {
  const [status, setStatus] = useState<ConnectionStatus>('loading');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [details, setDetails] = useState<HealthStatus | null>(null);
  
  const pollingInterval = options.pollingInterval || 30000; // Default: 30 seconds
  const pollImmediately = options.pollImmediately !== false; // Default: true
  
  // Function to check connection status
  const checkConnection = async (): Promise<void> => {
    try {
      const healthStatus = await HealthService.checkHealth();
      
      setLastChecked(new Date());
      setDetails(healthStatus);
      
      if (healthStatus.status === 'OK') {
        setStatus('connected');
      } else if (healthStatus.status === 'DEGRADED') {
        setStatus('degraded');
      } else {
        setStatus('disconnected');
      }
    } catch (error) {
      console.error('Failed to check connection status:', error);
      setStatus('disconnected');
      setLastChecked(new Date());
    }
  };
  
  // Set up polling
  useEffect(() => {
    if (pollImmediately) {
      checkConnection();
    }
    
    const intervalId = setInterval(checkConnection, pollingInterval);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [pollingInterval, pollImmediately]);
  
  return {
    status,
    lastChecked,
    checkNow: checkConnection,
    details
  };
} 