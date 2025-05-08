import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { IntegrationError, IntegrationErrorType } from '../integration-framework';

/**
 * MCP session context
 */
export interface MCPSessionContext {
  /**
   * User identifier
   */
  userId?: string;
  
  /**
   * Session identifier
   */
  sessionId?: string;
  
  /**
   * Context data for the session
   */
  contextData?: Record<string, any>;
  
  /**
   * Metadata for the session
   */
  metadata?: Record<string, any>;
}

/**
 * MCP session
 */
export interface MCPSession {
  /**
   * Session identifier
   */
  sessionId: string;
  
  /**
   * Session token
   */
  token: string;
  
  /**
   * Expiration time in milliseconds since epoch
   */
  expiresAt: number;
  
  /**
   * Whether the session is active
   */
  isActive: boolean;
}

/**
 * MCP capability
 */
export interface MCPCapability {
  /**
   * Capability identifier
   */
  id: string;
  
  /**
   * Capability name
   */
  name: string;
  
  /**
   * Capability description
   */
  description: string;
  
  /**
   * Available actions for this capability
   */
  actions: string[];
  
  /**
   * Schema for the capability
   */
  schema?: Record<string, any>;
}

/**
 * MCP client options
 */
export interface MCPClientOptions {
  /**
   * Base URL for the MCP endpoint
   */
  baseUrl: string;
  
  /**
   * API key if required for authentication
   */
  apiKey?: string;
  
  /**
   * Client identifier
   */
  clientId?: string;
  
  /**
   * Timeout in milliseconds
   */
  timeoutMs?: number;
  
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Headers to include in all requests
   */
  headers?: Record<string, string>;
}

/**
 * Client for Model-Controller-Protocol
 * Handles communication with external systems using MCP
 */
export class MCPClient {
  private readonly client: AxiosInstance;
  private readonly clientId: string;
  private readonly logger?: Logger;
  private currentSession?: MCPSession;
  
  /**
   * Create a new MCP client
   */
  constructor(private options: MCPClientOptions) {
    this.clientId = options.clientId || uuidv4();
    this.logger = options.logger;
    
    // Create HTTP client
    this.client = axios.create({
      baseURL: options.baseUrl,
      timeout: options.timeoutMs || 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-MCP-Client-ID': this.clientId,
        ...(options.apiKey ? { 'Authorization': `Bearer ${options.apiKey}` } : {}),
        ...(options.headers || {})
      }
    });
    
    // Add logging interceptors
    this.client.interceptors.request.use(
      (config) => {
        this.logger?.debug('MCP client sending request', {
          method: config.method,
          url: config.url,
          data: this.sanitizeLogData(config.data)
        });
        return config;
      },
      (error) => {
        this.logger?.error('MCP client request error', { error });
        return Promise.reject(error);
      }
    );
    
    this.client.interceptors.response.use(
      (response) => {
        this.logger?.debug('MCP client received response', {
          status: response.status,
          data: this.sanitizeLogData(response.data)
        });
        return response;
      },
      (error) => {
        this.logger?.error('MCP client response error', {
          error: error.response ? {
            status: error.response.status,
            data: error.response.data
          } : error.message
        });
        return Promise.reject(this.processError(error));
      }
    );
  }
  
  /**
   * Send a request to the MCP endpoint
   */
  public async sendRequest<T>(action: string, params: any = {}): Promise<T> {
    try {
      const config: AxiosRequestConfig = {
        headers: {}
      };
      
      // Add session token if available
      if (this.currentSession?.token) {
        config.headers!['X-MCP-Session-Token'] = this.currentSession.token;
      }
      
      const response = await this.client.post<{ success: boolean, data: T }>('/api/mcp', {
        action,
        params,
        requestId: uuidv4(),
        timestamp: Date.now()
      }, config);
      
      if (!response.data.success) {
        throw new IntegrationError(
          `MCP action '${action}' failed`,
          IntegrationErrorType.OPERATION_FAILED,
          { context: { action, params } }
        );
      }
      
      return response.data.data;
    } catch (error) {
      if (error instanceof IntegrationError) {
        throw error;
      }
      
      throw new IntegrationError(
        `Error executing MCP action '${action}': ${error instanceof Error ? error.message : String(error)}`,
        IntegrationErrorType.OPERATION_FAILED,
        {
          originalError: error instanceof Error ? error : undefined,
          context: { action, params }
        }
      );
    }
  }
  
  /**
   * Register a capability with the MCP server
   */
  public async registerCapability(capability: MCPCapability): Promise<void> {
    await this.sendRequest('registerCapability', { capability });
    this.logger?.info(`Registered MCP capability: ${capability.id}`);
  }
  
  /**
   * Establish a new session with the MCP server
   */
  public async establishSession(context: MCPSessionContext = {}): Promise<MCPSession> {
    const sessionResponse = await this.sendRequest<MCPSession>('startSession', {
      clientId: this.clientId,
      userId: context.userId,
      sessionId: context.sessionId || uuidv4(),
      contextData: context.contextData || {},
      metadata: context.metadata || {}
    });
    
    this.currentSession = sessionResponse;
    this.logger?.info(`Established MCP session: ${this.currentSession.sessionId}`);
    
    // Schedule session refresh before expiration
    this.scheduleSessionRefresh();
    
    return this.currentSession;
  }
  
  /**
   * Get the current session
   */
  public getCurrentSession(): MCPSession | undefined {
    return this.currentSession;
  }
  
  /**
   * End the current session
   */
  public async endSession(): Promise<void> {
    if (!this.currentSession) {
      return;
    }
    
    try {
      await this.sendRequest('endSession', {
        sessionId: this.currentSession.sessionId
      });
      
      this.logger?.info(`Ended MCP session: ${this.currentSession.sessionId}`);
    } catch (error) {
      this.logger?.error(`Error ending MCP session: ${this.currentSession.sessionId}`, { error });
    } finally {
      this.currentSession = undefined;
    }
  }
  
  /**
   * Refresh the current session
   */
  private async refreshSession(): Promise<void> {
    if (!this.currentSession) {
      return;
    }
    
    try {
      const refreshedSession = await this.sendRequest<MCPSession>('refreshSession', {
        sessionId: this.currentSession.sessionId
      });
      
      this.currentSession = refreshedSession;
      this.logger?.debug(`Refreshed MCP session: ${this.currentSession.sessionId}`);
      
      // Schedule next refresh
      this.scheduleSessionRefresh();
    } catch (error) {
      this.logger?.error(`Failed to refresh MCP session: ${this.currentSession.sessionId}`, { error });
      this.currentSession = undefined;
    }
  }
  
  /**
   * Schedule a session refresh before the current session expires
   */
  private scheduleSessionRefresh(): void {
    if (!this.currentSession) {
      return;
    }
    
    const now = Date.now();
    const expiresAt = this.currentSession.expiresAt;
    const timeUntilExpiry = expiresAt - now;
    
    // Refresh at 80% of the session lifetime
    const refreshIn = Math.max(100, timeUntilExpiry * 0.8);
    
    setTimeout(() => this.refreshSession(), refreshIn);
  }
  
  /**
   * Ping the MCP server to check connectivity
   */
  public async ping(): Promise<{ status: string, version: string }> {
    return this.sendRequest('ping', {});
  }
  
  /**
   * Get available capabilities from the MCP server
   */
  public async getCapabilities(): Promise<MCPCapability[]> {
    return this.sendRequest('getCapabilities', {});
  }
  
  /**
   * Process an error from the API request
   */
  private processError(error: any): IntegrationError {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    
    let errorType = IntegrationErrorType.OPERATION_FAILED;
    let errorMessage = error.message || 'Unknown MCP error';
    
    if (statusCode === 401 || statusCode === 403) {
      errorType = IntegrationErrorType.AUTHENTICATION_FAILED;
      errorMessage = 'Authentication failed for MCP request';
    } else if (statusCode === 404) {
      errorType = IntegrationErrorType.RESOURCE_NOT_FOUND;
      errorMessage = 'MCP resource not found';
    } else if (statusCode === 429) {
      errorType = IntegrationErrorType.RATE_LIMITED;
      errorMessage = 'Rate limit exceeded for MCP requests';
    } else if (statusCode >= 400 && statusCode < 500) {
      errorType = IntegrationErrorType.INVALID_REQUEST;
      errorMessage = errorData?.message || 'Invalid MCP request';
    } else if (statusCode >= 500) {
      errorType = IntegrationErrorType.OPERATION_FAILED;
      errorMessage = 'MCP server error';
    }
    
    return new IntegrationError(
      errorMessage,
      errorType,
      {
        code: errorData?.code || String(statusCode || 'UNKNOWN'),
        originalError: error,
        context: {
          statusCode,
          errorData
        }
      }
    );
  }
  
  /**
   * Sanitize data for logging to avoid sensitive information in logs
   */
  private sanitizeLogData(data: any): any {
    if (!data) {
      return data;
    }
    
    if (typeof data !== 'object') {
      return data;
    }
    
    const sanitized = { ...data };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey', 'Authorization'];
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }
    
    return sanitized;
  }
} 