import React, { useState, useEffect } from 'react';
import { API_CONFIG } from '../../config/api';
import { fetchWithAuth } from '../../lib/utils/auth-fetch';

/**
 * Agent service status
 */
interface AgentServiceStatus {
  name: string;
  status: 'OK' | 'DEGRADED' | 'ERROR';
  initialized: boolean;
  details?: Record<string, any>;
}

/**
 * Agent status report
 */
interface AgentStatusReport {
  status: 'OK' | 'DEGRADED' | 'ERROR';
  services: AgentServiceStatus[];
  timestamp: string;
  system?: {
    memory: Record<string, number>;
    cpu: Record<string, number>;
    uptime: number;
    platform: string;
    nodeVersion: string;
  };
  version?: string;
}

/**
 * Agent System Monitor component props
 */
interface AgentSystemMonitorProps {
  /**
   * Automatic refresh interval in milliseconds
   */
  refreshInterval?: number;

  /**
   * Whether to show detailed system information
   */
  showSystemInfo?: boolean;

  /**
   * Custom class name
   */
  className?: string;
}

/**
 * Agent System Monitor component
 *
 * Displays the current status of the agent system and its services
 */
export default function AgentSystemMonitor({
  refreshInterval = 10000,
  showSystemInfo = true,
  className = '',
}: AgentSystemMonitorProps) {
  const [statusReport, setStatusReport] = useState<AgentStatusReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAgentStatus = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetchWithAuth(
        `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.agents.status}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch agent system status');
      }

      const data: AgentStatusReport = await response.json();
      setStatusReport(data);
    } catch (err) {
      console.error('Error fetching agent status:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgentStatus();

    const intervalId = setInterval(fetchAgentStatus, refreshInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshInterval]);

  // Status indicator colors
  const statusColors = {
    OK: 'bg-green-500',
    DEGRADED: 'bg-yellow-500',
    ERROR: 'bg-red-500',
  };

  if (loading && !statusReport) {
    return (
      <div className={`rounded border p-4 shadow ${className}`}>
        <div className='flex h-20 items-center justify-center'>
          <p className='text-gray-500'>Loading agent system status...</p>
        </div>
      </div>
    );
  }

  if (error && !statusReport) {
    return (
      <div className={`rounded border bg-red-50 p-4 shadow ${className}`}>
        <div className='flex h-20 flex-col items-center justify-center'>
          <p className='font-medium text-red-500'>Failed to load agent system status</p>
          <p className='text-sm text-red-400'>{error.message}</p>
          <button
            className='mt-2 rounded bg-red-100 px-3 py-1 text-red-700 hover:bg-red-200'
            onClick={fetchAgentStatus}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded border p-4 shadow ${className}`}>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-lg font-medium'>Agent System Status</h2>
        <div className='flex items-center'>
          {statusReport && (
            <div className='mr-3 flex items-center'>
              <span
                className={`mr-2 h-3 w-3 rounded-full ${statusColors[statusReport.status]}`}
              ></span>
              <span className='text-sm font-medium'>{statusReport.status}</span>
            </div>
          )}
          <button
            className='rounded p-1 hover:bg-gray-100'
            onClick={fetchAgentStatus}
            disabled={loading}
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-5 w-5 text-gray-500'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
              />
            </svg>
          </button>
        </div>
      </div>

      {statusReport && (
        <>
          <div className='mb-4'>
            <h3 className='mb-2 text-sm font-medium text-gray-500'>Services</h3>
            <div className='space-y-2'>
              {statusReport.services.map(service => (
                <div
                  key={service.name}
                  className='flex items-center justify-between rounded border p-2'
                >
                  <div>
                    <p className='font-medium'>{service.name}</p>
                    {service.details && Object.keys(service.details).length > 0 && (
                      <div className='mt-1 text-xs text-gray-500'>
                        {Object.entries(service.details).map(([key, value]) => (
                          <p key={key}>
                            {key}: {typeof value === 'object' ? JSON.stringify(value) : value}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className='flex items-center'>
                    <span
                      className={`mr-2 h-2 w-2 rounded-full ${statusColors[service.status]}`}
                    ></span>
                    <span className='text-xs'>{service.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {showSystemInfo && statusReport.system && (
            <div>
              <h3 className='mb-2 text-sm font-medium text-gray-500'>System Information</h3>
              <div className='grid grid-cols-2 gap-2 text-xs'>
                <div className='rounded border p-2'>
                  <p className='font-medium'>Memory</p>
                  <p>RSS: {Math.round(statusReport.system.memory.rss / 1024 / 1024)} MB</p>
                  <p>
                    Heap Total: {Math.round(statusReport.system.memory.heapTotal / 1024 / 1024)} MB
                  </p>
                  <p>
                    Heap Used: {Math.round(statusReport.system.memory.heapUsed / 1024 / 1024)} MB
                  </p>
                </div>
                <div className='rounded border p-2'>
                  <p className='font-medium'>System</p>
                  <p>Uptime: {Math.round(statusReport.system.uptime / 60)} minutes</p>
                  <p>Platform: {statusReport.system.platform}</p>
                  <p>Node: {statusReport.system.nodeVersion}</p>
                  {statusReport.version && <p>Version: {statusReport.version}</p>}
                </div>
              </div>
            </div>
          )}

          <div className='mt-4 text-xs text-gray-400'>
            Last updated: {new Date(statusReport.timestamp).toLocaleString()}
          </div>
        </>
      )}
    </div>
  );
}
