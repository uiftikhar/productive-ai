/**
 * Mock Service Worker (MSW) API Mock
 * 
 * This module provides a mock implementation of external APIs using MSW,
 * allowing for realistic API mocking behavior during tests.
 */

import { setupServer, SetupServerApi } from 'msw/node';
import { http, HttpResponse, delay, HttpHandler } from 'msw';
import { jest } from '@jest/globals';

/**
 * Configuration for MSW-based API mocking
 */
export interface MSWMockConfig {
  /**
   * Default response delay in ms
   */
  defaultDelay?: number;
  
  /**
   * Base URL for the API
   */
  baseUrl?: string;
  
  /**
   * Default response status code
   */
  defaultStatus?: number;
  
  /**
   * Whether to enable request logging
   */
  debug?: boolean;
}

/**
 * Creates a MSW-based API mock
 */
export function createMSWMock(config: MSWMockConfig = {}) {
  const {
    defaultDelay = 0,
    baseUrl = 'http://api.example.com',
    defaultStatus = 200,
    debug = false
  } = config;
  
  // Track request history
  const requestHistory: Array<{
    method: string;
    url: string;
    params: any;
    headers: Record<string, string>;
    body?: any;
    response?: any;
    timestamp: number;
  }> = [];
  
  // Store predefined handlers
  const handlers = new Map<string, HttpHandler>();
  
  // Store predefined route-specific responses 
  const responseMap = new Map<string, any>();
  
  // Create MSW server without handlers initially
  // We'll add handlers dynamically
  const server = setupServer();
  
  // Start with a stopped server
  let isStarted = false;
  
  /**
   * Generate a handler key (used internally)
   */
  function getHandlerKey(method: string, path: string): string {
    return `${method.toUpperCase()}:${path}`;
  }
  
  /**
   * Log a request (used internally)
   */
  function logRequest(method: string, url: string, params: any, headers: Record<string, string>, body?: any, response?: any): void {
    if (debug) {
      console.log(`MSW Request: ${method} ${url}`, { params, body });
      if (response) {
        console.log(`MSW Response:`, response);
      }
    }
    
    requestHistory.push({
      method,
      url,
      params,
      headers,
      body,
      response,
      timestamp: Date.now()
    });
  }
  
  /**
   * Generate a handler for a route (used internally)
   */
  function createHandler(method: string, path: string): HttpHandler {
    const fullPath = path.startsWith('http') ? path : `${baseUrl}${path}`;
    
    return http[method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch'](fullPath, async ({ request, params }) => {
      // Get body if present
      let body: any = undefined;
      try {
        const contentType = request.headers.get('Content-Type');
        if (contentType?.includes('application/json')) {
          body = await request.json();
        } else if (contentType?.includes('text/plain')) {
          body = await request.text();
        } else if (contentType?.includes('application/x-www-form-urlencoded')) {
          body = Object.fromEntries(await request.formData());
        }
      } catch (e) {
        // Ignore body parsing errors
      }
      
      // Extract query params
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams);
      
      // Extract headers
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headers[key] = value;
      });
      
      // Get predefined response if available
      const key = getHandlerKey(method, path);
      let responseValue = responseMap.get(key);
      
      // Allow for dynamic responses based on functions
      if (typeof responseValue === 'function') {
        responseValue = responseValue({
          body,
          params: { ...params, ...queryParams }, 
          headers
        });
      }
      
      // Default response if none found
      if (responseValue === undefined) {
        responseValue = {
          success: true,
          message: `Default response for ${method} ${path}`,
          params: { ...params, ...queryParams }
        };
      }
      
      // Apply response delay
      await delay(defaultDelay);
      
      // Log the request and response
      logRequest(
        method.toUpperCase(),
        request.url,
        { ...params, ...queryParams },
        headers,
        body,
        responseValue
      );
      
      // Return the response
      return HttpResponse.json(responseValue, { status: defaultStatus });
    });
  }
  
  /**
   * Reset all handlers
   */
  function resetHandlers(): void {
    handlers.clear();
    responseMap.clear();
    server.resetHandlers();
  }
  
  /**
   * Define all current handlers in the server
   */
  function setupHandlers(): void {
    // Clear existing handlers
    server.resetHandlers();
    
    // Add all handlers
    server.use(...Array.from(handlers.values()));
  }
  
  /**
   * Add mock API route
   */
  function mockRoute(method: string, path: string, response?: any): void {
    const key = getHandlerKey(method, path);
    const handler = createHandler(method, path);
    
    handlers.set(key, handler);
    
    if (response !== undefined) {
      responseMap.set(key, response);
    }
    
    // Update server with new handlers if already started
    if (isStarted) {
      setupHandlers();
    }
  }
  
  // Return the mock API
  return {
    /**
     * Start the mock API server
     */
    start(): void {
      if (!isStarted) {
        setupHandlers();
        server.listen({ onUnhandledRequest: 'bypass' });
        isStarted = true;
      }
    },
    
    /**
     * Stop the mock API server
     */
    stop(): void {
      if (isStarted) {
        server.close();
        isStarted = false;
      }
    },
    
    /**
     * Reset all handlers and response maps
     */
    reset(): void {
      resetHandlers();
      requestHistory.length = 0;
    },
    
    /**
     * Get the MSW server instance for advanced usage
     */
    getServer(): SetupServerApi {
      return server;
    },
    
    /**
     * Mock a GET endpoint
     */
    get(path: string, response?: any): void {
      mockRoute('get', path, response);
    },
    
    /**
     * Mock a POST endpoint
     */
    post(path: string, response?: any): void {
      mockRoute('post', path, response);
    },
    
    /**
     * Mock a PUT endpoint
     */
    put(path: string, response?: any): void {
      mockRoute('put', path, response);
    },
    
    /**
     * Mock a DELETE endpoint
     */
    delete(path: string, response?: any): void {
      mockRoute('delete', path, response);
    },
    
    /**
     * Mock a PATCH endpoint
     */
    patch(path: string, response?: any): void {
      mockRoute('patch', path, response);
    },
    
    /**
     * Get request history
     */
    getRequestHistory(filter?: (req: typeof requestHistory[0]) => boolean): typeof requestHistory {
      return filter ? requestHistory.filter(filter) : [...requestHistory];
    },
    
    /**
     * Clear request history
     */
    clearRequestHistory(): void {
      requestHistory.length = 0;
    }
  };
} 