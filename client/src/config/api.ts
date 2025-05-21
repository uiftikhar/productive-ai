/**
 * API Configuration
 *
 * Centralized configuration for API endpoints
 */

// Extend Window interface to include ENV property
declare global {
  interface Window {
    ENV?: {
      API_URL?: string;
      BROWSER_API_URL?: string;
    };
  }
}

// Determine if we're running on the server-side or client-side
const isServer = typeof window === 'undefined';

// For client-side (browser) API calls, always use the browser-specific URL
// This ensures hostname resolution works properly in the browser
const apiUrl = isServer
  ? process.env.NEXT_PUBLIC_API_URL
  : window.ENV?.BROWSER_API_URL ||
    process.env.NEXT_PUBLIC_BROWSER_API_URL ||
    'http://localhost:3000';

const wsUrl = isServer
  ? process.env.NEXT_PUBLIC_WS_URL
  : window.ENV?.BROWSER_API_URL || process.env.NEXT_PUBLIC_BROWSER_WS_URL || 'ws://localhost:3000';

export const API_CONFIG = {
  baseUrl: apiUrl,
  wsBaseUrl: wsUrl,
  endpoints: {
    health: {
      base: '/api/v1/health',
      detailed: '/api/v1/health/detailed',
      serviceStatus: '/api/v1/health/services',
    },
    meetingAnalysis: {
      sessions: '/api/v1/analysis/sessions',
      results: (sessionId: string) => `/api/v1/analysis/sessions/${sessionId}/results`,
      analyze: (sessionId: string) => `/api/v1/analysis/sessions/${sessionId}/analyze`,
      status: (sessionId: string) => `/api/v1/analysis/sessions/${sessionId}`,
      visualization: (sessionId: string) => `/api/v1/analysis/sessions/${sessionId}/visualization`,
    },
    agents: {
      team: '/api/v1/agents/team',
      capabilities: '/api/v1/agents/capabilities',
      status: '/api/v1/agents/status',
      progress: (sessionId: string) => `/api/v1/agents/sessions/${sessionId}/progress`,
    },
    visualizations: {
      list: '/api/v1/visualizations',
      graph: (sessionId: string) => `/api/v1/visualizations/graph/${sessionId}`,
      file: (filename: string) => `/api/v1/visualizations/${filename}`,
    },
  },
  retryConfig: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    retryDelayMs: 1000,
    maxBackoff: 10000,
    initialBackoff: 1000,
  },
};
