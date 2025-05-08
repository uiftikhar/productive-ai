import { Logger } from '../../../shared/logger/logger.interface';

/**
 * Types of integrations supported by the framework
 */
export enum IntegrationType {
  PROJECT_MANAGEMENT = 'project_management',
  KNOWLEDGE_BASE = 'knowledge_base',
  COMMUNICATION = 'communication',
  CALENDAR = 'calendar',
  CUSTOM = 'custom'
}

/**
 * Integration capability represents a specific function that an integration can perform
 */
export interface IntegrationCapability {
  /**
   * Unique identifier for the capability
   */
  id: string;
  
  /**
   * Human-readable name of the capability
   */
  name: string;
  
  /**
   * Description of what the capability does
   */
  description: string;
  
  /**
   * The integration type this capability belongs to
   */
  type: IntegrationType;
  
  /**
   * Optional metadata about the capability
   */
  metadata?: Record<string, any>;
}

/**
 * Connection status for integration connectors
 */
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

/**
 * Error types that can occur in integrations
 */
export enum IntegrationErrorType {
  CONNECTION_FAILED = 'connection_failed',
  AUTHENTICATION_FAILED = 'authentication_failed',
  OPERATION_FAILED = 'operation_failed',
  RATE_LIMITED = 'rate_limited',
  PERMISSION_DENIED = 'permission_denied',
  RESOURCE_NOT_FOUND = 'resource_not_found',
  INVALID_REQUEST = 'invalid_request',
  UNKNOWN = 'unknown'
}

/**
 * Structured integration error
 */
export class IntegrationError extends Error {
  /**
   * Type of integration error
   */
  public readonly type: IntegrationErrorType;
  
  /**
   * Optional error code from the integration
   */
  public readonly code?: string;
  
  /**
   * Original error if this is wrapping another error
   */
  public readonly originalError?: Error;
  
  /**
   * Additional context about the error
   */
  public readonly context?: Record<string, any>;
  
  constructor(
    message: string, 
    type: IntegrationErrorType = IntegrationErrorType.UNKNOWN,
    options?: {
      code?: string;
      originalError?: Error;
      context?: Record<string, any>;
    }
  ) {
    super(message);
    this.name = 'IntegrationError';
    this.type = type;
    this.code = options?.code;
    this.originalError = options?.originalError;
    this.context = options?.context;
  }
}

/**
 * Information about an integration connector
 */
export interface IntegrationInfo {
  /**
   * Unique identifier for the integration
   */
  id: string;
  
  /**
   * Human-readable name of the integration
   */
  name: string;
  
  /**
   * Description of the integration
   */
  description: string;
  
  /**
   * The type of integration
   */
  type: IntegrationType;
  
  /**
   * Version of the integration connector
   */
  version: string;
  
  /**
   * List of capabilities this integration provides
   */
  capabilities: IntegrationCapability[];
  
  /**
   * Current connection status
   */
  status: ConnectionStatus;
  
  /**
   * Optional metadata about the integration
   */
  metadata?: Record<string, any>;
}

/**
 * Base configuration for all integration connectors
 */
export interface IntegrationConnectorConfig {
  /**
   * Unique identifier for this connector instance
   */
  id?: string;
  
  /**
   * Human-readable name for this connector instance
   */
  name?: string;
  
  /**
   * Description of this connector instance
   */
  description?: string;
  
  /**
   * Logger instance for the connector
   */
  logger?: Logger;
  
  /**
   * Authentication configuration
   */
  auth?: {
    /**
     * Type of authentication (e.g., api_key, oauth, basic)
     */
    type: string;
    
    /**
     * Authentication credentials
     */
    credentials: Record<string, any>;
  };
  
  /**
   * Base URL for API connectors
   */
  baseUrl?: string;
  
  /**
   * Request timeout in milliseconds
   */
  timeoutMs?: number;
  
  /**
   * Retry configuration
   */
  retry?: {
    /**
     * Maximum number of retry attempts
     */
    maxAttempts: number;
    
    /**
     * Base delay between retries in milliseconds
     */
    baseDelayMs: number;
    
    /**
     * Maximum delay between retries in milliseconds
     */
    maxDelayMs: number;
  };
}

/**
 * Core interface for all integration connectors
 */
export interface IntegrationConnector<T extends IntegrationType> {
  /**
   * Get the unique identifier for this connector
   */
  getId(): string;
  
  /**
   * Get information about this connector
   */
  getInfo(): IntegrationInfo;
  
  /**
   * Connect to the integrated system
   */
  connect(): Promise<void>;
  
  /**
   * Disconnect from the integrated system
   */
  disconnect(): Promise<void>;
  
  /**
   * Check if the connector is currently connected
   */
  isConnected(): boolean;
  
  /**
   * Get the connection status
   */
  getConnectionStatus(): ConnectionStatus;
  
  /**
   * Get the capabilities this connector provides
   */
  getCapabilities(): IntegrationCapability[];
  
  /**
   * Execute a capability with the given parameters
   */
  executeCapability<TParams = any, TResult = any>(
    capabilityId: string,
    params: TParams
  ): Promise<TResult>;
  
  /**
   * Check health of the integration
   */
  checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details?: Record<string, any>;
  }>;
}

/**
 * Registry for integration connectors
 */
export class IntegrationRegistry {
  private readonly connectors = new Map<string, IntegrationConnector<any>>();
  private readonly logger?: Logger;
  
  constructor(options?: { logger?: Logger }) {
    this.logger = options?.logger;
  }
  
  /**
   * Register a connector with the registry
   */
  registerConnector<T extends IntegrationType>(
    type: T, 
    connector: IntegrationConnector<T>
  ): void {
    const connectorId = connector.getId();
    const key = `${type}:${connectorId}`;
    
    if (this.connectors.has(key)) {
      this.logger?.warn(`Connector already registered with ID ${key}, replacing with new instance`);
    }
    
    this.connectors.set(key, connector);
    this.logger?.debug(`Registered connector: ${key}`);
  }
  
  /**
   * Get a connector by type and ID
   */
  getConnector<T extends IntegrationType>(
    type: T, 
    connectorId: string
  ): IntegrationConnector<T> | undefined {
    const key = `${type}:${connectorId}`;
    return this.connectors.get(key) as IntegrationConnector<T> | undefined;
  }
  
  /**
   * Get all connectors of a specific type
   */
  getConnectorsByType<T extends IntegrationType>(
    type: T
  ): IntegrationConnector<T>[] {
    return Array.from(this.connectors.entries())
      .filter(([key]) => key.startsWith(`${type}:`))
      .map(([_, connector]) => connector as IntegrationConnector<T>);
  }
  
  /**
   * List all available connectors
   */
  listAvailableConnectors(): IntegrationInfo[] {
    return Array.from(this.connectors.values()).map(connector => connector.getInfo());
  }
  
  /**
   * Unregister a connector
   */
  unregisterConnector(type: IntegrationType, connectorId: string): boolean {
    const key = `${type}:${connectorId}`;
    const result = this.connectors.delete(key);
    
    if (result) {
      this.logger?.debug(`Unregistered connector: ${key}`);
    } else {
      this.logger?.warn(`Attempted to unregister non-existent connector: ${key}`);
    }
    
    return result;
  }
  
  /**
   * Connect all registered connectors
   */
  async connectAll(): Promise<void> {
    this.logger?.info(`Connecting all registered connectors (${this.connectors.size})`);
    
    const connectPromises = Array.from(this.connectors.values()).map(async connector => {
      try {
        await connector.connect();
        return { id: connector.getId(), success: true };
      } catch (error) {
        this.logger?.error(`Failed to connect ${connector.getId()}`, { error });
        return { id: connector.getId(), success: false, error };
      }
    });
    
    const results = await Promise.all(connectPromises);
    const successCount = results.filter(r => r.success).length;
    
    this.logger?.info(`Connected ${successCount}/${this.connectors.size} connectors`);
    
    if (successCount < this.connectors.size) {
      this.logger?.warn('Some connectors failed to connect, see logs for details');
    }
  }
  
  /**
   * Disconnect all registered connectors
   */
  async disconnectAll(): Promise<void> {
    this.logger?.info(`Disconnecting all registered connectors (${this.connectors.size})`);
    
    const disconnectPromises = Array.from(this.connectors.values()).map(async connector => {
      try {
        await connector.disconnect();
        return { id: connector.getId(), success: true };
      } catch (error) {
        this.logger?.error(`Failed to disconnect ${connector.getId()}`, { error });
        return { id: connector.getId(), success: false, error };
      }
    });
    
    const results = await Promise.all(disconnectPromises);
    const successCount = results.filter(r => r.success).length;
    
    this.logger?.info(`Disconnected ${successCount}/${this.connectors.size} connectors`);
  }
  
  /**
   * Find connectors that provide a specific capability
   */
  findConnectorsByCapability(capabilityId: string): IntegrationConnector<any>[] {
    return Array.from(this.connectors.values())
      .filter(connector => 
        connector.getCapabilities().some(cap => cap.id === capabilityId)
      );
  }
} 