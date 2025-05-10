import React from 'react';
import { useAgentProgress } from '../../hooks/useAgentProgress';

/**
 * Progress indicator props
 */
interface ProgressIndicatorProps {
  /**
   * Session ID to track
   */
  sessionId: string | null;
  
  /**
   * Polling interval in milliseconds
   */
  pollingInterval?: number;
  
  /**
   * Custom class name
   */
  className?: string;
  
  /**
   * Whether to show detailed status
   */
  showDetails?: boolean;
  
  /**
   * Optional callback when progress changes
   */
  onProgressChange?: (progress: number, status: string) => void;
  
  /**
   * Optional callback when status changes
   */
  onStatusChange?: (status: string) => void;
}

/**
 * Progress Indicator component
 * 
 * Displays the progress of an agent task
 */
export default function ProgressIndicator({
  sessionId,
  pollingInterval = 3000,
  className = '',
  showDetails = false,
  onProgressChange,
  onStatusChange
}: ProgressIndicatorProps) {
  const {
    progress,
    status,
    isLoading,
    error,
    details
  } = useAgentProgress(sessionId, {
    pollingInterval,
    stopAtCompletion: true
  });
  
  // Call callbacks if provided
  React.useEffect(() => {
    if (onProgressChange) {
      onProgressChange(progress, status);
    }
  }, [progress, status, onProgressChange]);
  
  React.useEffect(() => {
    if (onStatusChange) {
      onStatusChange(status);
    }
  }, [status, onStatusChange]);
  
  // Status display helper
  const getStatusDisplay = () => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'processing':
        return 'Processing';
      case 'error':
        return 'Error';
      case 'not_found':
        return 'Not Found';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };
  
  // Status color helper
  const getStatusColor = () => {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'processing':
        return 'text-blue-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };
  
  if (!sessionId) {
    return null;
  }
  
  if (error) {
    return (
      <div className={`p-3 bg-red-50 border border-red-200 rounded ${className}`}>
        <div className="flex items-center text-red-600">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>Error tracking progress</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`p-3 border rounded ${className}`}>
      <div className="mb-2 flex justify-between items-center">
        <div className="flex items-center">
          {isLoading ? (
            <svg className="animate-spin h-4 w-4 text-blue-500 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-2 ${getStatusColor()}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusDisplay()}
          </span>
        </div>
        <span className="text-sm text-gray-500 font-medium">{progress}%</span>
      </div>
      
      {/* Progress bar */}
      <div className="h-2 bg-gray-200 rounded overflow-hidden">
        <div
          className={`h-full ${status === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}
          style={{ width: `${progress}%`, transition: 'width 0.3s ease' }}
        ></div>
      </div>
      
      {/* Details section */}
      {showDetails && details && (
        <div className="mt-2 text-xs text-gray-500">
          {details.createdAt && (
            <p>Created: {new Date(details.createdAt).toLocaleString()}</p>
          )}
          {details.updatedAt && (
            <p>Updated: {new Date(details.updatedAt).toLocaleString()}</p>
          )}
          {details.completedAt && (
            <p>Completed: {new Date(details.completedAt).toLocaleString()}</p>
          )}
          {status === 'error' && details.error && (
            <p className="text-red-500 mt-1">Error: {details.error}</p>
          )}
        </div>
      )}
    </div>
  );
} 