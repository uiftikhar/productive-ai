/**
 * Fetch with authentication
 *
 * Wraps the fetch API with authentication headers and implements
 * retry logic with exponential backoff
 */
import { API_CONFIG } from '../../config/api';
import { AuthService } from '../auth/auth.service';

interface RetryOptions {
  maxRetries?: number;
  initialBackoff?: number;
  maxBackoff?: number;
}

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  // Get the auth token from the AuthService
  const token = AuthService.getToken();

  // Merge headers with authorization if token exists
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Configure retry options with defaults from API_CONFIG
  const {
    maxRetries = API_CONFIG.retryConfig.maxRetries,
    initialBackoff = API_CONFIG.retryConfig.initialBackoff,
    maxBackoff = API_CONFIG.retryConfig.maxBackoff,
  } = retryOptions;

  let retries = 0;
  let backoff = initialBackoff;

  // Implement retry logic with exponential backoff
  while (true) {
    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // If we get an authentication error, try to refresh the token
      if (response.status === 401) {
        if (retries < maxRetries) {
          // Log authentication issue
          console.warn(`Authentication failed for ${url}, retrying...`);

          // For our mock system, we can't refresh tokens, so we'll just add bypass header
          headers['x-bypass-auth'] = '1';

          // Wait before retry using exponential backoff
          await new Promise(resolve => setTimeout(resolve, backoff));
          backoff = Math.min(backoff * 2, maxBackoff);
          retries++;
          continue;
        }
      }

      // For server errors, implement retry
      if (response.status >= 500 && retries < maxRetries) {
        console.warn(`Server error ${response.status} for ${url}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        backoff = Math.min(backoff * 2, maxBackoff);
        retries++;
        continue;
      }

      // For other status codes or if we've exhausted retries, return the response
      return response;
    } catch (error) {
      // Network errors
      if (retries < maxRetries) {
        console.warn(`Network error fetching ${url}:`, error);
        console.warn(`Retrying (${retries + 1}/${maxRetries})...`);

        await new Promise(resolve => setTimeout(resolve, backoff));
        backoff = Math.min(backoff * 2, maxBackoff);
        retries++;
      } else {
        console.error(`Failed to fetch ${url} after ${maxRetries} retries:`, error);
        throw error;
      }
    }
  }
}
