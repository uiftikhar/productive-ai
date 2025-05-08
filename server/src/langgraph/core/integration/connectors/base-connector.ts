import { v4 as uuidv4 } from 'uuid';
import { 
  IntegrationConnector, 
  IntegrationConnectorConfig,
  IntegrationType,
  IntegrationInfo,
  IntegrationCapability,
  ConnectionStatus,
  IntegrationError,
  IntegrationErrorType
} from '../integration-framework';
import { Logger } from '../../../../shared/logger/logger.interface';

/**
 * Abstract base class for all integration connectors
 */
export abstract class BaseConnector<T extends IntegrationType> implements IntegrationConnector<T> {
  protected readonly id: string;
  protected readonly name: string;
  protected readonly description: string;
  protected readonly type: T;
  protected readonly logger?: Logger;
  protected readonly version: string;
  protected status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  protected lastError?: Error;
  protected readonly config: IntegrationConnectorConfig;
  
  constructor(type: T, config: IntegrationConnectorConfig) {
    this.type = type;
    this.config = config;
    this.id = config.id || uuidv4();
    this.name = config.name || `${type}-connector-${this.id.substring(0, 8)}`;
    this.description = config.description || `${type} integration connector`;
    this.logger = config.logger;
    this.version = this.getVersion();
  }
  
  /**
   * Get the connector version
   */
  protected abstract getVersion(): string;
  
  /**
   * Get the connector's capabilities
   */
  public abstract getCapabilities(): IntegrationCapability[];
  
  /**
   * Execute a specific capability with the given parameters
   */
  public abstract executeCapability<TParams = any, TResult = any>(
    capabilityId: string,
    params: TParams
  ): Promise<TResult>;
  
  /**
   * Get the unique identifier for this connector
   */
  public getId(): string {
    return this.id;
  }
  
  /**
   * Get information about this connector
   */
  public getInfo(): IntegrationInfo {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      version: this.version,
      capabilities: this.getCapabilities(),
      status: this.status,
      metadata: this.getMetadata()
    };
  }
  
  /**
   * Get connector metadata
   */
  protected getMetadata(): Record<string, any> {
    return {};
  }
  
  /**
   * Connect to the integrated system
   */
  public async connect(): Promise<void> {
    try {
      this.status = ConnectionStatus.CONNECTING;
      this.logger?.debug(`Connecting to ${this.type} integration: ${this.name}`);
      
      await this.performConnect();
      
      this.status = ConnectionStatus.CONNECTED;
      this.logger?.info(`Connected to ${this.type} integration: ${this.name}`);
    } catch (error) {
      this.status = ConnectionStatus.ERROR;
      this.lastError = error instanceof Error ? error : new Error(String(error));
      
      this.logger?.error(`Failed to connect to ${this.type} integration: ${this.name}`, {
        error: this.lastError
      });
      
      throw this.wrapError(
        this.lastError,
        `Failed to connect to ${this.type} integration: ${this.name}`,
        IntegrationErrorType.CONNECTION_FAILED
      );
    }
  }
  
  /**
   * Implement the actual connection logic
   */
  protected abstract performConnect(): Promise<void>;
  
  /**
   * Disconnect from the integrated system
   */
  public async disconnect(): Promise<void> {
    try {
      this.logger?.debug(`Disconnecting from ${this.type} integration: ${this.name}`);
      
      await this.performDisconnect();
      
      this.status = ConnectionStatus.DISCONNECTED;
      this.logger?.info(`Disconnected from ${this.type} integration: ${this.name}`);
    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      
      this.logger?.error(`Failed to disconnect from ${this.type} integration: ${this.name}`, {
        error: this.lastError
      });
      
      throw this.wrapError(
        this.lastError,
        `Failed to disconnect from ${this.type} integration: ${this.name}`,
        IntegrationErrorType.OPERATION_FAILED
      );
    }
  }
  
  /**
   * Implement the actual disconnection logic
   */
  protected abstract performDisconnect(): Promise<void>;
  
  /**
   * Check if the connector is currently connected
   */
  public isConnected(): boolean {
    return this.status === ConnectionStatus.CONNECTED;
  }
  
  /**
   * Get the connection status
   */
  public getConnectionStatus(): ConnectionStatus {
    return this.status;
  }
  
  /**
   * Check health of the integration
   */
  public async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details?: Record<string, any>;
  }> {
    try {
      if (!this.isConnected()) {
        return {
          status: 'unhealthy',
          details: {
            connectionStatus: this.status,
            message: 'Not connected'
          }
        };
      }
      
      const details = await this.performHealthCheck();
      
      return {
        status: 'healthy',
        details
      };
    } catch (error) {
      this.logger?.error(`Health check failed for ${this.type} integration: ${this.name}`, {
        error
      });
      
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : String(error),
          connectionStatus: this.status
        }
      };
    }
  }
  
  /**
   * Implement the actual health check logic
   */
  protected abstract performHealthCheck(): Promise<Record<string, any>>;
  
  /**
   * Wrap an error in an IntegrationError
   */
  protected wrapError(
    error: Error,
    message: string,
    type: IntegrationErrorType = IntegrationErrorType.UNKNOWN,
    context?: Record<string, any>
  ): IntegrationError {
    return new IntegrationError(
      message,
      type,
      {
        originalError: error,
        context: {
          connectorId: this.id,
          connectorType: this.type,
          ...context
        }
      }
    );
  }
  
  /**
   * Ensure the connector is connected before executing an operation
   */
  protected ensureConnected(): void {
    if (!this.isConnected()) {
      throw new IntegrationError(
        `Cannot perform operation: ${this.type} integration is not connected`,
        IntegrationErrorType.OPERATION_FAILED,
        {
          context: {
            connectorId: this.id,
            connectorType: this.type,
            connectionStatus: this.status
          }
        }
      );
    }
  }
} 