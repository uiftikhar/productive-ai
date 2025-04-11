// src/agents/messaging/agent-message.ts

import { v4 as uuidv4 } from 'uuid';

/**
 * Message types for agent communication
 */
export enum AgentMessageType {
  REQUEST = 'request',
  RESPONSE = 'response',
  NOTIFICATION = 'notification',
  ERROR = 'error',
}

/**
 * Priority levels for agent messages
 */
export enum AgentMessagePriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Base agent message interface
 */
export interface AgentMessage {
  id: string;
  type: AgentMessageType;
  senderId: string;
  recipientId?: string;
  priority: AgentMessagePriority;
  content: any;
  metadata?: Record<string, any>;
  parentId?: string;
  timestamp: number;
}

/**
 * Create a new agent message
 */
export function createAgentMessage(options: {
  type: AgentMessageType;
  senderId: string;
  recipientId?: string;
  content: any;
  priority?: AgentMessagePriority;
  metadata?: Record<string, any>;
  parentId?: string;
}): AgentMessage {
  return {
    id: uuidv4(),
    type: options.type,
    senderId: options.senderId,
    recipientId: options.recipientId,
    priority: options.priority || AgentMessagePriority.NORMAL,
    content: options.content,
    metadata: options.metadata,
    parentId: options.parentId,
    timestamp: Date.now(),
  };
}
