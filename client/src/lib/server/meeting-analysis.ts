import { MeetingAnalysisResponse } from '@/types/meeting-analysis';
import { getAuthHeaders, isAuthenticated } from './auth';
import { API_CONFIG } from '@/config/api';

/**
 * Fetch meeting analysis results from the server
 * Will try to use authentication if available, but won't redirect
 *
 * @param sessionId The session ID to fetch results for
 * @returns The meeting analysis results
 */
export async function getMeetingAnalysisResults(
  sessionId: string
): Promise<MeetingAnalysisResponse> {
  // Check if we're authenticated to include the right headers
  const headers = getAuthHeaders();

  // Log the current authentication state for debugging
  console.log('Authentication state:', isAuthenticated() ? 'Authenticated' : 'Not authenticated');

  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/rag-meeting-analysis/${sessionId}`, {
      method: 'GET',
      headers,
      cache: 'no-store', // Don't cache these results as they can change
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication required to view these results');
      }
      throw new Error(`Failed to fetch analysis results: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching meeting analysis:', error);
    throw error;
  }
}
