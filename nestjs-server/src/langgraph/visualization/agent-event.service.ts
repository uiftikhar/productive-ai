import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { AgentEventPayload } from './event-types';

/**
 * Service for emitting agent events that will be visualized in the client
 */
@Injectable()
export class AgentEventService {
  private readonly logger = new Logger(AgentEventService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2
  ) {
    this.logger.log('Agent Event Service initialized');
  }

  /**
   * Emit an agent event with the appropriate payload
   * 
   * @param eventType The type of event (e.g., 'started', 'completed', 'error')
   * @param payload The event payload
   */
  emitAgentEvent(eventType: string, payload: AgentEventPayload) {
    const event = {
      ...payload,
      timestamp: payload.timestamp || Date.now(),
      eventType
    };
    
    try {
      this.eventEmitter.emit(`agent.${eventType}`, event);
      this.logger.debug(`Emitted agent.${eventType} event for ${payload.agentType}`);
    } catch (error) {
      this.logger.error(`Failed to emit agent.${eventType} event: ${error.message}`);
    }
  }

  /**
   * Generate a unique event ID based on agent type
   */
  generateEventId(agentType?: string): string {
    return `${agentType || 'agent'}-${uuidv4()}`;
  }
  
  /**
   * Emit a service event (e.g., RAG, Pinecone, LLM)
   * 
   * @param serviceType Type of service (rag, pinecone, llm)
   * @param operation Operation performed by the service
   * @param payload Basic event information
   * @param query Optional query used in the service operation
   * @param options Optional configuration or parameters used in the service operation
   */
  emitServiceEvent(
    serviceType: 'rag' | 'pinecone' | 'llm',
    operation: string, 
    payload: Omit<AgentEventPayload, 'serviceType' | 'operation'> & { agentId: string, sessionId: string },
    query?: { [key: string]: any },
    options?: { [key: string]: any }
  ) {
    const event = {
      ...payload,
      serviceType,
      operation,
      timestamp: payload.timestamp || Date.now(),
      query: query || null,
      options: options || null
    };
    
    try {
      this.eventEmitter.emit(`service.${serviceType}.${operation}`, event);
      this.logger.debug(`Emitted service.${serviceType}.${operation} event`);
    } catch (error) {
      this.logger.error(`Failed to emit service event: ${error.message}`);
    }
  }
} 