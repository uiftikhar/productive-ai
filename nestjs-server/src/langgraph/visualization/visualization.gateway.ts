import { 
  WebSocketGateway, 
  WebSocketServer, 
  SubscribeMessage, 
  OnGatewayInit, 
  OnGatewayConnection, 
  OnGatewayDisconnect 
} from '@nestjs/websockets';
import { Logger, Injectable, Inject } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SessionHistoryService } from './session-history.service';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:8080'], // Accept connections from Next.js and other client
    credentials: true
  },
  namespace: 'visualization',
})
@Injectable()
export class VisualizationGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(VisualizationGateway.name);
  
  // Maps to track client-session relationships
  private sessionsToClients = new Map<string, string[]>();
  private clientsToSessions = new Map<string, string>();
  
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly sessionHistoryService: SessionHistoryService
  ) {}
  
  /**
   * Called after the gateway is initialized
   */
  afterInit() {
    this.logger.log('Visualization Gateway initialized');
    
    // Verify server initialization
    if (!this.server) {
      this.logger.error('WebSocket server not initialized - events will not be broadcast');
      return;
    }
    
    this.logger.log('WebSocket server successfully initialized');
    
    // Subscribe to all agent, service, and workflow events
    this.eventEmitter.onAny((eventName, payload) => {
      if (typeof eventName === 'string') {
        if (eventName.startsWith('agent.') || eventName.startsWith('service.')) {
          this.broadcastEvent(eventName, payload);
        } else if (eventName === 'workflow.event' || eventName.startsWith('workflow.')) {
          this.broadcastWorkflowEvent(
            eventName.replace('workflow.', ''),
            payload,
          );
        }
      }
    });

    // Handle connection count requests
    this.eventEmitter.on('connection.count.request', (sessionId: string) => {
      try {
        // Get the number of clients connected to this session
        const clients = this.sessionsToClients.get(sessionId) || [];
        const count = clients.length;
        
        this.logger.debug(`Responding to connection count request for session ${sessionId}: ${count} connections`);
        
        // Emit the response
        this.eventEmitter.emit(`connection.count.${sessionId}.response`, count);
      } catch (error) {
        this.logger.error(`Error handling connection count request: ${error.message}`);
        this.eventEmitter.emit(`connection.count.${sessionId}.response`, 0);
      }
    });
  }
  
  /**
   * Called when a client connects
   */
  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    
    // Set ping interval for faster disconnection detection
    client.conn.on('heartbeat', () => {
      this.logger.debug(`Heartbeat from client ${client.id}`);
    });
  }
  
  /**
   * Called when a client disconnects
   */
  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    
    try {
      // Clean up client subscriptions
      const sessionId = this.clientsToSessions.get(client.id);
      if (sessionId) {
        this.logger.log(`Removing client ${client.id} from session ${sessionId}`);
        this.cleanupClientSubscriptions(client.id);
      }
    } catch (error) {
      this.logger.error(`Error cleaning up disconnected client ${client.id}: ${error.message}`);
    }
  }
  
  /**
   * Clean up client subscriptions when a client disconnects
   */
  private cleanupClientSubscriptions(clientId: string) {
    const sessionId = this.clientsToSessions.get(clientId);
    if (sessionId) {
      const clients = this.sessionsToClients.get(sessionId) || [];
      this.sessionsToClients.set(
        sessionId,
        clients.filter(id => id !== clientId)
      );
      this.clientsToSessions.delete(clientId);
      
      this.logger.debug(`Removed client ${clientId} from session ${sessionId}`);
    }
  }
  
  /**
   * Subscribe to receive events for a specific session
   */
  @SubscribeMessage('subscribeToSession')
  async handleSubscribeToSession(client: Socket, sessionId: string) {
    this.logger.log(`Client ${client.id} subscribing to session ${sessionId}`);
    
    if (!sessionId) {
      this.logger.warn(`Client ${client.id} tried to subscribe with invalid sessionId`);
      return { event: 'subscribeToSession', data: { success: false, error: 'Invalid session ID' } };
    }
    
    try {
      // Clean up any existing subscriptions
      this.cleanupClientSubscriptions(client.id);
      
      // Register client for this session's events
      this.clientsToSessions.set(client.id, sessionId);
      const sessionClients = this.sessionsToClients.get(sessionId) || [];
      sessionClients.push(client.id);
      this.sessionsToClients.set(sessionId, sessionClients);
      
      // Send session history if available
      await this.sendSessionHistory(client, sessionId);
      
      this.logger.log(`Client ${client.id} successfully subscribed to session ${sessionId}`);
      
      return { 
        event: 'subscribeToSession', 
        data: { success: true, sessionId } 
      };
    } catch (error) {
      this.logger.error(`Error subscribing client ${client.id} to session ${sessionId}: ${error.message}`);
      return { 
        event: 'subscribeToSession', 
        data: { success: false, error: error.message } 
      };
    }
  }
  
  /**
   * Send the session history to a client
   */
  private async sendSessionHistory(client: Socket, sessionId: string) {
    try {
      this.logger.debug(`Fetching history for session ${sessionId} for client ${client.id}`);
      const sessionHistory = await this.sessionHistoryService.getSessionEvents(sessionId);
      
      if (sessionHistory.length > 0) {
        this.logger.debug(`Sending history with ${sessionHistory.length} events to client ${client.id}`);
        client.emit('sessionHistory', sessionHistory);
      } else {
        this.logger.debug(`No history found for session ${sessionId}`);
        client.emit('sessionHistory', []);
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to send session history for ${sessionId}: ${error.message}`);
      // Still return empty array so client can proceed
      client.emit('sessionHistory', []);
      return false;
    }
  }
  
  /**
   * Broadcast a workflow event to clients subscribed to the session
   */
  private async broadcastWorkflowEvent(eventName: string, payload: any) {
    // Ensure the payload has a sessionId
    const { sessionId } = payload;
    if (!sessionId) {
      this.logger.warn(`Workflow event ${eventName} has no sessionId, cannot broadcast`);
      return;
    }
    
    // Create the event object
    const eventObject = { 
      event: eventName, 
      data: payload,
      type: 'workflow',
      timestamp: payload.timestamp || Date.now()
    };
    
    try {
      // Store in session history
      await this.sessionHistoryService.addEvent(sessionId, eventObject);
      
      // Send to all clients subscribed to this session
      const clients = this.sessionsToClients.get(sessionId) || [];
      if (clients.length === 0) {
        this.logger.debug(`No clients subscribed to session ${sessionId} for event ${eventName}`);
        return;
      }
      
      // Check if server is properly initialized before broadcasting
      if (!this.server || !this.server.sockets || !this.server.sockets.sockets) {
        this.logger.error(`Cannot broadcast workflow event: server not fully initialized`);
        return;
      }
      
      // Broadcast to all connected clients for this session
      this.broadcastToSessionClients(sessionId, 'workflowEvent', eventObject);
      
      this.logger.debug(`Broadcast workflow event ${eventName} for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Error broadcasting workflow event ${eventName}: ${error.message}`);
    }
  }
  
  /**
   * Broadcast an event to all clients subscribed to the session
   */
  private async broadcastEvent(eventName: string, payload: any) {
    // Ensure the payload has a sessionId
    const { sessionId } = payload;
    if (!sessionId) {
      this.logger.warn(`Event ${eventName} has no sessionId, cannot broadcast`);
      return;
    }
    
    // Create the event object
    const eventObject = { 
      event: eventName, 
      data: payload,
      timestamp: payload.timestamp || Date.now()
    };
    
    try {
      // Store in session history
      await this.sessionHistoryService.addEvent(sessionId, eventObject);
      
      // Send to all clients subscribed to this session
      this.broadcastToSessionClients(sessionId, 'agentEvent', eventObject);
    } catch (error) {
      this.logger.error(`Error broadcasting event ${eventName}: ${error.message}`);
    }
  }
  
  /**
   * Broadcast an event to all clients subscribed to a session
   */
  private broadcastToSessionClients(sessionId: string, eventType: string, eventData: any) {
    // Check if server and sockets are properly initialized
    if (!this.server || !this.server.sockets) {
      this.logger.error(`Cannot broadcast event: server or sockets not initialized`);
      return;
    }
    
    const clients = this.sessionsToClients.get(sessionId) || [];
    if (clients.length === 0) {
      this.logger.debug(`No clients subscribed to session ${sessionId}`);
      return;
    }
    
    let sentCount = 0;
    for (const clientId of clients) {
      // Safely check if sockets map exists before trying to access it
      if (!this.server.sockets.sockets) {
        this.logger.error(`Socket map not initialized, cannot broadcast to client ${clientId}`);
        continue;
      }
      
      const socket = this.server.sockets.sockets.get(clientId);
      if (socket && socket.connected) {
        socket.emit(eventType, eventData);
        sentCount++;
      } else if (!socket) {
        this.logger.debug(`Client ${clientId} socket not found, removing from session ${sessionId}`);
        // Clean up stale client references
        this.clientsToSessions.delete(clientId);
      } else if (!socket.connected) {
        this.logger.debug(`Client ${clientId} socket exists but not connected, skipping event`);
      }
    }
    
    // Only update active clients if sockets map exists
    if (this.server.sockets.sockets) {
      // Update the session clients list (filter out missing sockets)
      const activeClients = clients.filter(clientId => 
        this.server.sockets.sockets.has(clientId) && 
        this.server.sockets.sockets.get(clientId)?.connected
      );
      this.sessionsToClients.set(sessionId, activeClients);
    }
    
    this.logger.debug(
      `Broadcast ${eventType} to ${sentCount}/${clients.length} clients for session ${sessionId}`
    );
  }
  
  /**
   * Get active clients for a session
   */
  @SubscribeMessage('getActiveClients')
  handleGetActiveClients(client: Socket, sessionId: string) {
    const clients = this.sessionsToClients.get(sessionId) || [];
    return { 
      event: 'activeClients', 
      data: { 
        count: clients.length, 
        sessionId 
      } 
    };
  }
  
  /**
   * Clear session history
   */
  @SubscribeMessage('clearSessionHistory')
  async handleClearSessionHistory(client: Socket, sessionId: string) {
    await this.sessionHistoryService.clearSessionEvents(sessionId);
    return { 
      event: 'sessionHistoryCleared', 
      data: { success: true, sessionId } 
    };
  }
} 