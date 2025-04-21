import { v4 as uuidv4 } from 'uuid';
import {
  AgentMessage,
  TaskMessage,
  ResponseMessage,
  NotificationMessage,
  StatusUpdateMessage,
  QueryMessage,
  ErrorMessage,
  BroadcastMessage,
  MessageType,
  MessagePriority,
} from './types';

/**
 * Message Factory for creating different types of messages
 * with consistent formatting and default values
 */
export class MessageFactory {
  /**
   * Create a basic agent message
   */
  static createMessage(
    senderId: string,
    content: any,
    options: {
      recipientId?: string;
      priority?: MessagePriority;
      correlationId?: string;
      metadata?: Record<string, any>;
      messageType?: MessageType;
    } = {},
  ): AgentMessage {
    return {
      id: uuidv4(),
      type: options.messageType || MessageType.NOTIFICATION,
      senderId,
      recipientId: options.recipientId,
      content,
      timestamp: Date.now(),
      priority: options.priority ?? MessagePriority.NORMAL,
      correlationId: options.correlationId,
      metadata: options.metadata,
    };
  }

  /**
   * Create a task message to request work from another agent
   */
  static createTaskMessage(
    senderId: string,
    recipientId: string,
    taskDescription: string,
    options: {
      priority?: MessagePriority;
      deadline?: number;
      requiredCapabilities?: string[];
      correlationId?: string;
      metadata?: Record<string, any>;
    } = {},
  ): TaskMessage {
    return {
      id: uuidv4(),
      type: MessageType.TASK,
      senderId,
      recipientId,
      content: {
        taskDescription,
        deadline: options.deadline,
        requiredCapabilities: options.requiredCapabilities,
      },
      timestamp: Date.now(),
      priority: options.priority ?? MessagePriority.NORMAL,
      correlationId: options.correlationId,
      metadata: options.metadata,
    };
  }

  /**
   * Create a response message to a previous task
   */
  static createResponseMessage(
    senderId: string,
    recipientId: string,
    result: any,
    correlationId: string,
    options: {
      success?: boolean;
      error?: string;
      priority?: MessagePriority;
      metadata?: Record<string, any>;
    } = {},
  ): ResponseMessage {
    return {
      id: uuidv4(),
      type: MessageType.RESPONSE,
      senderId,
      recipientId,
      correlationId,
      content: {
        result,
        success: options.success !== undefined ? options.success : true,
        error: options.error,
      },
      timestamp: Date.now(),
      priority: options.priority ?? MessagePriority.NORMAL,
      metadata: options.metadata,
    };
  }

  /**
   * Create a notification message
   */
  static createNotificationMessage(
    senderId: string,
    recipientId: string,
    title: string,
    body: string,
    options: {
      category?: string;
      priority?: MessagePriority;
      correlationId?: string;
      metadata?: Record<string, any>;
    } = {},
  ): NotificationMessage {
    return {
      id: uuidv4(),
      type: MessageType.NOTIFICATION,
      senderId,
      recipientId,
      content: {
        title,
        body,
        category: options.category,
      },
      timestamp: Date.now(),
      priority: options.priority ?? MessagePriority.NORMAL,
      correlationId: options.correlationId,
      metadata: options.metadata,
    };
  }

  /**
   * Create a status update message
   */
  static createStatusUpdateMessage(
    senderId: string,
    recipientId: string,
    status: string,
    options: {
      progress?: number;
      estimatedCompletionTime?: number;
      details?: string;
      priority?: MessagePriority;
      correlationId?: string;
      metadata?: Record<string, any>;
    } = {},
  ): StatusUpdateMessage {
    return {
      id: uuidv4(),
      type: MessageType.STATUS_UPDATE,
      senderId,
      recipientId,
      content: {
        status,
        progress: options.progress,
        estimatedCompletionTime: options.estimatedCompletionTime,
        details: options.details,
      },
      timestamp: Date.now(),
      priority: options.priority ?? MessagePriority.NORMAL,
      correlationId: options.correlationId,
      metadata: options.metadata,
    };
  }

  /**
   * Create a query message
   */
  static createQueryMessage(
    senderId: string,
    recipientId: string,
    query: string,
    options: {
      context?: any;
      priority?: MessagePriority;
      correlationId?: string;
      metadata?: Record<string, any>;
    } = {},
  ): QueryMessage {
    return {
      id: uuidv4(),
      type: MessageType.QUERY,
      senderId,
      recipientId,
      content: {
        query,
        context: options.context,
      },
      timestamp: Date.now(),
      priority: options.priority ?? MessagePriority.NORMAL,
      correlationId: options.correlationId,
      metadata: options.metadata,
    };
  }

  /**
   * Create an error message
   */
  static createErrorMessage(
    senderId: string,
    recipientId: string,
    error: string | Error,
    options: {
      stackTrace?: string;
      context?: any;
      priority?: MessagePriority;
      correlationId?: string;
      metadata?: Record<string, any>;
    } = {},
  ): ErrorMessage {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const stackTrace = options.stackTrace || (error instanceof Error ? error.stack : undefined);

    return {
      id: uuidv4(),
      type: MessageType.ERROR,
      senderId,
      recipientId,
      content: {
        error: errorMessage,
        stackTrace,
        context: options.context,
      },
      timestamp: Date.now(),
      priority: options.priority ?? MessagePriority.HIGH,
      correlationId: options.correlationId,
      metadata: options.metadata,
    };
  }

  /**
   * Create a broadcast message to all agents
   */
  static createBroadcastMessage(
    senderId: string,
    announcement: string,
    options: {
      category?: string;
      importance?: MessagePriority;
      correlationId?: string;
      metadata?: Record<string, any>;
    } = {},
  ): BroadcastMessage {
    return {
      id: uuidv4(),
      type: MessageType.BROADCAST,
      senderId,
      recipientId: undefined,
      content: {
        announcement,
        category: options.category,
        importance: options.importance ?? MessagePriority.NORMAL,
      },
      timestamp: Date.now(),
      priority: options.importance ?? MessagePriority.NORMAL,
      correlationId: options.correlationId,
      metadata: options.metadata,
    };
  }
} 