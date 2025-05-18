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
    
    // Subscribe to all agent and service events
    this.eventEmitter.onAny((eventName, payload) => {
      if (typeof eventName === 'string' && 
         (eventName.startsWith('agent.') || eventName.startsWith('service.'))) {
        this.broadcastEvent(eventName, payload);
      }
    });
  }
  
  /**
   * Called when a client connects
   */
  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }
  
  /**
   * Called when a client disconnects
   */
  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    
    // Clean up session mappings
    const sessionId = this.clientsToSessions.get(client.id);
    if (sessionId) {
      const clients = this.sessionsToClients.get(sessionId) || [];
      this.sessionsToClients.set(
        sessionId,
        clients.filter(id => id !== client.id)
      );
      this.clientsToSessions.delete(client.id);
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
      timestamp: Date.now()
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
      
      let sentCount = 0;
      for (const clientId of clients) {
        const socket = this.server.sockets.sockets.get(clientId);
        if (socket && socket.connected) {
          socket.emit('agentEvent', eventObject);
          sentCount++;
        } else if (!socket) {
          this.logger.debug(`Client ${clientId} socket not found, removing from session ${sessionId}`);
          // Clean up stale client references
          this.clientsToSessions.delete(clientId);
        } else if (!socket.connected) {
          this.logger.debug(`Client ${clientId} socket exists but not connected, skipping event`);
        }
      }
      
      // Update the session clients list (filter out missing sockets)
      const activeClients = clients.filter(clientId => 
        this.server.sockets.sockets.has(clientId) && 
        this.server.sockets.sockets.get(clientId)?.connected
      );
      this.sessionsToClients.set(sessionId, activeClients);
      
      this.logger.debug(
        `Broadcast ${eventName} to ${sentCount}/${clients.length} clients for session ${sessionId}`
      );
    } catch (error) {
      this.logger.error(`Error broadcasting event ${eventName}: ${error.message}`);
    }
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