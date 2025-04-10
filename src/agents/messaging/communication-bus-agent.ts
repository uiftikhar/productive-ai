import { EventEmitter } from 'events';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';
import { AgentMessage, AgentMessageType } from './messaging-agent.ts';

/**
 * Agent Communication Bus
 * Central communication system for agents to exchange messages
 */
export class AgentCommunicationBus {
  private static instance: AgentCommunicationBus;
  private eventEmitter: EventEmitter;
  private logger: Logger;
  private messageHistory: Map<string, AgentMessage[]> = new Map();
  
  private constructor(logger?: Logger) {
    this.eventEmitter = new EventEmitter();
    this.logger = logger || new ConsoleLogger();
    
    // Increase max listeners to support many agents
    this.eventEmitter.setMaxListeners(100);
  }
  
  /**
   * Get the singleton instance of the communication bus
   */
  public static getInstance(logger?: Logger): AgentCommunicationBus {
    if (!AgentCommunicationBus.instance) {
      AgentCommunicationBus.instance = new AgentCommunicationBus(logger);
    }
    return AgentCommunicationBus.instance;
  }
  
  /**
   * Send a message to the bus
   */
  sendMessage(message: AgentMessage): void {
    // Log the message
    this.logger.debug(`Message sent: ${message.type}`, {
      from: message.senderId,
      to: message.recipientId || 'broadcast',
      messageId: message.id
    });
    
    // Store message in history
    this.storeMessage(message);
    
    // Emit the message to all listeners
    this.eventEmitter.emit('message', message);
    
    // Emit to specific recipient if specified
    if (message.recipientId) {
      this.eventEmitter.emit(`message:${message.recipientId}`, message);
    }
    
    // Emit by message type
    this.eventEmitter.emit(`message:type:${message.type}`, message);
  }
  
  /**
   * Subscribe to all messages
   */
  subscribeToAll(callback: (message: AgentMessage) => void): () => void {
    this.eventEmitter.on('message', callback);
    return () => this.eventEmitter.off('message', callback);
  }
  
  /**
   * Subscribe to messages sent to a specific recipient
   */
  subscribeToRecipient(
    recipientId: string,
    callback: (message: AgentMessage) => void
  ): () => void {
    const eventName = `message:${recipientId}`;
    this.eventEmitter.on(eventName, callback);
    return () => this.eventEmitter.off(eventName, callback);
  }
  
  /**
   * Subscribe to messages of a specific type
   */
  subscribeToType(
    messageType: AgentMessageType,
    callback: (message: AgentMessage) => void
  ): () => void {
    const eventName = `message:type:${messageType}`;
    this.eventEmitter.on(eventName, callback);
    return () => this.eventEmitter.off(eventName, callback);
  }
  
  /**
   * Store message in history
   */
  private storeMessage(message: AgentMessage): void {
    const conversationId = message.metadata?.conversationId || 'default';
    
    if (!this.messageHistory.has(conversationId)) {
      this.messageHistory.set(conversationId, []);
    }
    
    const history = this.messageHistory.get(conversationId)!;
    history.push(message);
    
    // Limit history size (keep last 1000 messages)
    if (history.length > 1000) {
      history.shift();
    }
  }
  
  /**
   * Get message history for a conversation
   */
  getMessageHistory(conversationId: string = 'default'): AgentMessage[] {
    return this.messageHistory.get(conversationId) || [];
  }
  
  /**
   * Clear message history
   */
  clearMessageHistory(conversationId?: string): void {
    if (conversationId) {
      this.messageHistory.delete(conversationId);
    } else {
      this.messageHistory.clear();
    }
  }
}