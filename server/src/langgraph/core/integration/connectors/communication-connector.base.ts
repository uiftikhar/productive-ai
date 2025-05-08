import { 
  IntegrationType, 
  IntegrationConnectorConfig, 
  IntegrationCapability, 
  IntegrationError,
  IntegrationErrorType
} from '../integration-framework';
import { BaseConnector } from './base-connector';

/**
 * Message representation
 */
export interface CommunicationMessage {
  id: string;
  content: string;
  sender: {
    id: string;
    name: string;
    email?: string;
    avatar?: string;
  };
  channel: string;
  timestamp: Date;
  threadId?: string;
  replyTo?: string;
  attachments?: Array<{
    id: string;
    name: string;
    type: string;
    url?: string;
    size?: number;
  }>;
  reactions?: Array<{
    type: string;
    count: number;
    users: string[];
  }>;
  metadata?: Record<string, any>;
}

/**
 * Channel or conversation representation
 */
export interface CommunicationChannel {
  id: string;
  name: string;
  description?: string;
  type: 'direct' | 'group' | 'channel' | 'meeting';
  members: Array<{
    id: string;
    name: string;
    role?: 'member' | 'admin' | 'owner';
  }>;
  createdAt: Date;
  lastActivity?: Date;
  metadata?: Record<string, any>;
}

/**
 * Common capabilities for communication integrations
 */
export enum CommunicationCapability {
  SEND_MESSAGE = 'send_message',
  GET_MESSAGES = 'get_messages',
  LIST_CHANNELS = 'list_channels',
  GET_CHANNEL = 'get_channel',
  CREATE_CHANNEL = 'create_channel',
  ADD_MEMBER = 'add_member',
  REMOVE_MEMBER = 'remove_member',
  UPLOAD_FILE = 'upload_file',
  SEARCH_MESSAGES = 'search_messages'
}

/**
 * Configuration for communication connectors
 */
export interface CommunicationConnectorConfig extends IntegrationConnectorConfig {
  /**
   * Default channel to use
   */
  defaultChannelId?: string;
  
  /**
   * Bot or system user ID to use for sending messages
   */
  botUserId?: string;
  
  /**
   * Bot or system user name to use for sending messages
   */
  botUserName?: string;
}

/**
 * Abstract base class for communication integrations
 */
export abstract class CommunicationConnector extends BaseConnector<IntegrationType.COMMUNICATION> {
  protected readonly defaultChannelId?: string;
  protected readonly botUserId?: string;
  protected readonly botUserName?: string;
  
  constructor(config: CommunicationConnectorConfig) {
    super(IntegrationType.COMMUNICATION, config);
    this.defaultChannelId = config.defaultChannelId;
    this.botUserId = config.botUserId;
    this.botUserName = config.botUserName || 'AI Assistant';
  }
  
  /**
   * Get common communication capabilities
   */
  public getCapabilities(): IntegrationCapability[] {
    return [
      {
        id: CommunicationCapability.SEND_MESSAGE,
        name: 'Send Message',
        description: 'Send a message to a channel or conversation',
        type: IntegrationType.COMMUNICATION
      },
      {
        id: CommunicationCapability.GET_MESSAGES,
        name: 'Get Messages',
        description: 'Retrieve messages from a channel or conversation',
        type: IntegrationType.COMMUNICATION
      },
      {
        id: CommunicationCapability.LIST_CHANNELS,
        name: 'List Channels',
        description: 'List available channels or conversations',
        type: IntegrationType.COMMUNICATION
      },
      {
        id: CommunicationCapability.GET_CHANNEL,
        name: 'Get Channel',
        description: 'Get details about a specific channel or conversation',
        type: IntegrationType.COMMUNICATION
      }
    ];
  }
  
  /**
   * Execute a communication capability
   */
  public async executeCapability<TParams = any, TResult = any>(
    capabilityId: string,
    params: TParams
  ): Promise<TResult> {
    this.ensureConnected();
    
    switch (capabilityId) {
      case CommunicationCapability.SEND_MESSAGE:
        return this.sendMessage(params as unknown as { 
          content: string, 
          channelId?: string,
          threadId?: string,
          replyTo?: string,
          attachments?: Array<{
            name: string;
            type: string;
            content: Buffer | string;
          }>
        }) as unknown as TResult;
        
      case CommunicationCapability.GET_MESSAGES:
        return this.getMessages(params as unknown as { 
          channelId?: string,
          threadId?: string,
          limit?: number,
          before?: Date | string,
          after?: Date | string
        }) as unknown as TResult;
        
      case CommunicationCapability.LIST_CHANNELS:
        return this.listChannels(params as unknown as { 
          types?: ('direct' | 'group' | 'channel' | 'meeting')[],
          limit?: number,
          offset?: number
        }) as unknown as TResult;
        
      case CommunicationCapability.GET_CHANNEL:
        return this.getChannel(params as unknown as { 
          channelId: string 
        }) as unknown as TResult;
        
      case CommunicationCapability.CREATE_CHANNEL:
        return this.createChannel(params as unknown as { 
          name: string,
          description?: string,
          type: 'direct' | 'group' | 'channel' | 'meeting',
          members?: string[]
        }) as unknown as TResult;
        
      case CommunicationCapability.SEARCH_MESSAGES:
        return this.searchMessages(params as unknown as { 
          query: string,
          channelId?: string,
          limit?: number
        }) as unknown as TResult;
        
      default:
        throw new IntegrationError(
          `Capability not supported: ${capabilityId}`,
          IntegrationErrorType.INVALID_REQUEST,
          {
            context: {
              capabilityId,
              availableCapabilities: this.getCapabilities().map(c => c.id)
            }
          }
        );
    }
  }
  
  /**
   * Get channel ID, using default if not provided
   */
  protected getChannelId(channelId?: string): string {
    const resolvedChannelId = channelId || this.defaultChannelId;
    if (!resolvedChannelId) {
      throw new IntegrationError(
        'Channel ID is required but was not provided and no default is configured',
        IntegrationErrorType.INVALID_REQUEST
      );
    }
    return resolvedChannelId;
  }
  
  /**
   * Send a message to a channel or conversation
   */
  public abstract sendMessage(params: { 
    content: string, 
    channelId?: string,
    threadId?: string,
    replyTo?: string,
    attachments?: Array<{
      name: string;
      type: string;
      content: Buffer | string;
    }>
  }): Promise<CommunicationMessage>;
  
  /**
   * Get messages from a channel or conversation
   */
  public abstract getMessages(params: { 
    channelId?: string,
    threadId?: string,
    limit?: number,
    before?: Date | string,
    after?: Date | string
  }): Promise<CommunicationMessage[]>;
  
  /**
   * List available channels or conversations
   */
  public abstract listChannels(params?: { 
    types?: ('direct' | 'group' | 'channel' | 'meeting')[],
    limit?: number,
    offset?: number
  }): Promise<CommunicationChannel[]>;
  
  /**
   * Get details about a specific channel or conversation
   */
  public abstract getChannel(params: { 
    channelId: string 
  }): Promise<CommunicationChannel>;
  
  /**
   * Create a new channel or conversation
   */
  public abstract createChannel(params: { 
    name: string,
    description?: string,
    type: 'direct' | 'group' | 'channel' | 'meeting',
    members?: string[]
  }): Promise<CommunicationChannel>;
  
  /**
   * Search for messages
   */
  public abstract searchMessages(params: { 
    query: string,
    channelId?: string,
    limit?: number
  }): Promise<CommunicationMessage[]>;
} 