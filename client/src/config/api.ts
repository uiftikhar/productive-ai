/**
 * API Configuration
 * 
 * Centralized configuration for API endpoints
 */
export const API_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  endpoints: {
    health: {
      base: '/health',
      detailed: '/health/detailed',
      serviceStatus: '/health/service-status',
    },
    meetingAnalysis: {
      sessions: '/api/v1/analysis/sessions',
      results: (sessionId: string) => `/api/v1/analysis/sessions/${sessionId}/results`,
      analyze: (sessionId: string) => `/api/v1/analysis/sessions/${sessionId}/analyze`,
      status: (sessionId: string) => `/api/v1/analysis/sessions/${sessionId}`,
    },
    agents: {
      status: '/api/v1/debug/agent-status',
      progress: (sessionId: string) => `/api/v1/debug/agent-progress/${sessionId}`,
    }
  },
  retryConfig: {
    maxRetries: 3,
    initialBackoff: 1000, // 1 second
    maxBackoff: 10000, // 10 seconds
  }
}; 