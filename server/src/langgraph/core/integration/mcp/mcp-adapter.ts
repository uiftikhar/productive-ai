import { 
  IntegrationConnector,
  IntegrationType,
  IntegrationCapability,
  IntegrationInfo,
  IntegrationConnectorConfig,
  ConnectionStatus,
  IntegrationError,
  IntegrationErrorType
} from '../integration-framework';
import { MCPClient, MCPClientOptions, MCPCapability } from './mcp-client';
import { Logger } from '../../../../shared/logger/logger.interface';
import { BaseConnector } from '../connectors/base-connector';

/**
 * Configuration for MCP adapter
 */
export interface MCPAdapterConfig extends IntegrationConnectorConfig {
  /**
   * MCP client options
   */
  mcpClientOptions: MCPClientOptions;
  
  /**
   * Integration type this adapter represents
   */
  integrationType: IntegrationType;
  
  /**
   * Whether to auto-establish a session on connect
   */
  autoEstablishSession?: boolean;
  
  /**
   * Context data to use when establishing a session
   */
  sessionContextData?: Record<string, any>;
}

/**
 * Adapter that bridges the MCP client with the integration framework
 */
export class MCPAdapter extends BaseConnector<IntegrationType> {
  private readonly mcpClient: MCPClient;
  private readonly autoEstablishSession: boolean;
  private readonly sessionContextData?: Record<string, any>;
  private capabilities: IntegrationCapability[] = [];
  
  /**
   * Create a new MCP adapter
   */
  constructor(config: MCPAdapterConfig) {
    super(config.integrationType, config);
    
    // Ensure logger is passed to MCP client
    const mcpOptions: MCPClientOptions = {
      ...config.mcpClientOptions,
      logger: config.logger
    };
    
    this.mcpClient = new MCPClient(mcpOptions);
    this.autoEstablishSession = config.autoEstablishSession ?? true;
    this.sessionContextData = config.sessionContextData;
  }
  
  /**
   * Get the connector version
   */
  protected getVersion(): string {
    return '1.0.0';
  }
  
  /**
   * Establish connection to the MCP service
   */
  protected async performConnect(): Promise<void> {
    try {
      // First ping to check connectivity
      const pingResult = await this.mcpClient.ping();
      this.logger?.info(`Connected to MCP service: ${pingResult.status}, version ${pingResult.version}`);
      
      // Fetch available capabilities
      const mcpCapabilities = await this.mcpClient.getCapabilities();
      this.mapCapabilities(mcpCapabilities);
      
      // Establish session if configured
      if (this.autoEstablishSession) {
        await this.mcpClient.establishSession({
          contextData: this.sessionContextData
        });
      }
    } catch (error) {
      throw new IntegrationError(
        `Failed to connect to MCP service: ${error instanceof Error ? error.message : String(error)}`,
        IntegrationErrorType.CONNECTION_FAILED,
        {
          originalError: error instanceof Error ? error : undefined
        }
      );
    }
  }
  
  /**
   * Disconnect from the MCP service
   */
  protected async performDisconnect(): Promise<void> {
    try {
      await this.mcpClient.endSession();
    } catch (error) {
      this.logger?.warn(`Error ending MCP session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Perform health check
   */
  protected async performHealthCheck(): Promise<Record<string, any>> {
    const pingResult = await this.mcpClient.ping();
    const session = this.mcpClient.getCurrentSession();
    
    return {
      status: pingResult.status,
      version: pingResult.version,
      hasActiveSession: !!session,
      sessionId: session?.sessionId,
      capabilities: this.capabilities.length
    };
  }
  
  /**
   * Get capabilities provided by this integration
   */
  public getCapabilities(): IntegrationCapability[] {
    return this.capabilities;
  }
  
  /**
   * Map MCP capabilities to integration capabilities
   */
  private mapCapabilities(mcpCapabilities: MCPCapability[]): void {
    this.capabilities = mcpCapabilities.map(mcpCap => ({
      id: mcpCap.id,
      name: mcpCap.name,
      description: mcpCap.description,
      type: this.type,
      metadata: {
        mcpActions: mcpCap.actions,
        schema: mcpCap.schema
      }
    }));
    
    this.logger?.debug(`Mapped ${this.capabilities.length} MCP capabilities to integration framework`);
  }
  
  /**
   * Get additional metadata for this connector
   */
  protected getMetadata(): Record<string, any> {
    const session = this.mcpClient.getCurrentSession();
    
    return {
      mcpEndpoint: this.mcpClient['options'].baseUrl,
      hasActiveSession: !!session,
      sessionId: session?.sessionId,
      sessionExpiresAt: session?.expiresAt
    };
  }
  
  /**
   * Execute a capability via MCP
   */
  public async executeCapability<TParams = any, TResult = any>(
    capabilityId: string,
    params: TParams
  ): Promise<TResult> {
    this.ensureConnected();
    
    // Find the capability to get its actions
    const capability = this.capabilities.find(c => c.id === capabilityId);
    
    if (!capability) {
      throw new IntegrationError(
        `Capability not supported: ${capabilityId}`,
        IntegrationErrorType.INVALID_REQUEST,
        {
          context: {
            capabilityId,
            availableCapabilities: this.capabilities.map(c => c.id)
          }
        }
      );
    }
    
    // Extract MCP actions from capability metadata
    const mcpActions = capability.metadata?.mcpActions as string[];
    
    if (!mcpActions || mcpActions.length === 0) {
      throw new IntegrationError(
        `No MCP actions defined for capability: ${capabilityId}`,
        IntegrationErrorType.INVALID_REQUEST
      );
    }
    
    try {
      // Use the first action as the default execution action
      const action = mcpActions[0];
      
      // Execute via MCP client
      return await this.mcpClient.sendRequest<TResult>(action, params);
    } catch (error) {
      if (error instanceof IntegrationError) {
        throw error;
      }
      
      throw new IntegrationError(
        `Failed to execute capability ${capabilityId}: ${error instanceof Error ? error.message : String(error)}`,
        IntegrationErrorType.OPERATION_FAILED,
        {
          originalError: error instanceof Error ? error : undefined,
          context: {
            capabilityId,
            params
          }
        }
      );
    }
  }
  
  /**
   * Get the underlying MCP client
   */
  public getMCPClient(): MCPClient {
    return this.mcpClient;
  }
} 