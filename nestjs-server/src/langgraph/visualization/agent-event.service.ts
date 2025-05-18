import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { AgentEventPayload } from './event-types';
import { SessionHistoryService } from './session-history.service';

/**
 * Service for emitting agent events that will be visualized in the client
 */
@Injectable()
export class AgentEventService {
  private readonly logger = new Logger(AgentEventService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly sessionHistoryService: SessionHistoryService
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
  
  /**
   * Emit a workflow status event
   * 
   * @param eventType The type of workflow event ('created', 'started', 'completed', 'failed')
   * @param payload The event payload containing sessionId and other info
   */
  emitWorkflowEvent(
    eventType: 'created' | 'pending' | 'in_progress' | 'started' | 'completed' | 'failed',
    payload: { sessionId: string; [key: string]: any }
  ) {
    const event = {
      ...payload,
      timestamp: payload.timestamp || Date.now(),
      eventType
    };
    
    try {
      this.eventEmitter.emit(`workflow.${eventType}`, event);
      this.logger.debug(`Emitted workflow.${eventType} event for ${payload.sessionId}`);
      
      // Also emit as a generic workflow event for visualization gateway
      this.eventEmitter.emit('workflow.event', event);
    } catch (error) {
      this.logger.error(`Failed to emit workflow.${eventType} event: ${error.message}`);
    }
  }

  /**
   * Get the number of events for a specific session
   */
  async getEventCountForSession(sessionId: string): Promise<number> {
    try {
      const events = await this.sessionHistoryService.getEventsForSession(sessionId);
      return events.length;
    } catch (error) {
      this.logger.error(`Failed to get event count for session ${sessionId}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get the number of connections for a specific session
   * This requires access to the VisualizationGateway which manages the connections
   */
  async getConnectionCountForSession(sessionId: string): Promise<number> {
    try {
      // Use the event emitter to request connection count from the gateway
      // Since we don't have direct access to the gateway from this service
      const timeout = 2000; // 2 seconds timeout
      
      // Create a promise that will be resolved when we get the response
      const connectionCountPromise = new Promise<number>((resolve) => {
        const responseHandler = (count: number) => {
          resolve(count);
          // Clean up the listener
          this.eventEmitter.removeListener(`connection.count.${sessionId}.response`, responseHandler);
        };
        
        // Listen for the response
        this.eventEmitter.on(`connection.count.${sessionId}.response`, responseHandler);
        
        // Set a timeout to prevent hanging
        setTimeout(() => {
          this.eventEmitter.removeListener(`connection.count.${sessionId}.response`, responseHandler);
          resolve(0); // Default to 0 if no response
        }, timeout);
        
        // Request the count
        this.eventEmitter.emit('connection.count.request', sessionId);
      });
      
      return await connectionCountPromise;
    } catch (error) {
      this.logger.error(`Failed to get connection count for session ${sessionId}: ${error.message}`);
      return 0;
    }
  }
} 