import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { MeetingAnalysisService } from '@/lib/api/meeting-analysis-service';

export interface AgentEvent {
  event: string;
  data: {
    agentId: string;
    agentType: string;
    sessionId: string;
    timestamp: number;
    parentAgentId?: string;
    duration?: number;
    input?: any;
    output?: any;
    error?: string;
    serviceType?: 'rag' | 'pinecone' | 'llm';
    operation?: string;
    query?: { [key: string]: any };
    options?: { [key: string]: any };
  };
  timestamp: number;
}

export interface WorkflowEvent {
  event: string;
  data: {
    sessionId: string;
    status?: 'created' | 'pending' | 'in_progress' | 'started' | 'completed' | 'failed';
    timestamp: number;
    duration?: number;
    metadata?: any;
    error?: string;
  };
  type: 'workflow';
  timestamp: number;
}

export function useAgentVisualization(sessionId: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [workflowEvents, setWorkflowEvents] = useState<WorkflowEvent[]>([]);
  const [workflowStatus, setWorkflowStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!sessionId) {
      setIsLoading(false);
      return;
    }
    
    // Get the WebSocket URL from the service
    const WS_URL = MeetingAnalysisService.getWebSocketUrl();
    console.log(`Connecting to visualization socket at ${WS_URL}`);
    
    // Create socket with more robust configuration
    const socketInstance = io(WS_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000
    });
    
    socketInstance.on('connect', () => {
      console.log('Connected to visualization websocket');
      setConnected(true);
      setConnectionError(null);
      
      // Subscribe to the session events
      console.log(`Subscribing to session: ${sessionId}`);
      socketInstance.emit('subscribeToSession', sessionId);
    });
    
    socketInstance.on('disconnect', () => {
      console.log('Disconnected from visualization websocket');
      setConnected(false);
    });
    
    socketInstance.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setConnected(false);
      setConnectionError(`Failed to connect: ${error.message}`);
    });
    
    socketInstance.on('sessionHistory', (historyEvents: (AgentEvent | WorkflowEvent)[]) => {
      console.log('Received session history:', historyEvents.length, 'events');
      
      // Split events by type
      const agentEvents = historyEvents.filter(e => !('type' in e)) as AgentEvent[];
      const wfEvents = historyEvents.filter(e => 'type' in e && e.type === 'workflow') as WorkflowEvent[];
      
      setEvents(agentEvents);
      setWorkflowEvents(wfEvents);
      
      // Update workflow status from events
      updateWorkflowStatusFromEvents(wfEvents);
      
      setIsLoading(false);
    });
    
    socketInstance.on('agentEvent', (event: AgentEvent) => {
      console.log('Received agent event:', event.event, event);
      setEvents(prev => [...prev, event]);
    });
    
    socketInstance.on('workflowEvent', (event: WorkflowEvent) => {
      console.log('Received workflow event:', event.event, event);
      setWorkflowEvents(prev => [...prev, event]);
      
      // Update status when we get a workflow event
      if (event.data.status) {
        setWorkflowStatus(event.data.status);
      }
    });
    
    // Handle reconnection success
    socketInstance.io.on('reconnect', (attempt) => {
      console.log(`Reconnected after ${attempt} attempts`);
      // Re-subscribe to session after reconnection
      socketInstance.emit('subscribeToSession', sessionId);
    });
    
    // Handle reconnection errors
    socketInstance.io.on('reconnect_error', (error) => {
      console.error('Reconnection error:', error);
      setConnectionError(`Reconnection failed: ${error.message}`);
    });
    
    // Handle reconnection failures
    socketInstance.io.on('reconnect_failed', () => {
      console.error('Failed to reconnect after all attempts');
      setConnectionError('Failed to reconnect after multiple attempts');
    });
    
    setSocket(socketInstance);
    
    return () => {
      console.log('Cleaning up socket connection');
      socketInstance.disconnect();
    };
  }, [sessionId]);
  
  // Helper to update workflow status from events
  const updateWorkflowStatusFromEvents = useCallback((events: WorkflowEvent[]) => {
    if (!events.length) return;
    
    // Find the most recent status event
    const statusEvents = events
      .filter(e => e.data.status)
      .sort((a, b) => b.timestamp - a.timestamp);
    
    if (statusEvents.length > 0) {
      setWorkflowStatus(statusEvents[0].data.status || null);
    }
  }, []);
  
  const clearEvents = useCallback(() => {
    setEvents([]);
    setWorkflowEvents([]);
  }, []);
  
  const getEventCount = useCallback((type?: string) => {
    if (!type) return events.length;
    return events.filter(e => e.event.includes(type)).length;
  }, [events]);
  
  const getAgentCounts = useCallback(() => {
    const agents = new Map<string, number>();
    
    events.forEach(event => {
      const agentType = event.data?.agentType;
      if (agentType) {
        agents.set(agentType, (agents.get(agentType) || 0) + 1);
      }
    });
    
    return Object.fromEntries(agents);
  }, [events]);
  
  const getServiceCounts = useCallback(() => {
    const services = new Map<string, number>();
    
    events.forEach(event => {
      if (event.data?.serviceType && event.data?.operation) {
        const serviceKey = `${event.data.serviceType}.${event.data.operation}`;
        services.set(serviceKey, (services.get(serviceKey) || 0) + 1);
      }
    });
    
    return Object.fromEntries(services);
  }, [events]);
  
  return { 
    events, 
    workflowEvents,
    workflowStatus,
    connected, 
    isLoading, 
    connectionError,
    clearEvents,
    getEventCount,
    getAgentCounts,
    getServiceCounts
  };
} 