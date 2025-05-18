import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

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

export function useAgentVisualization(sessionId: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!sessionId) {
      setIsLoading(false);
      return;
    }
    
    // Use the same port as the API server (3001)
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    console.log(`Connecting to visualization socket at ${API_URL}/visualization`);
    
    // Create socket with more robust configuration
    const socketInstance = io(`${API_URL}/visualization`, {
      transports: ['websocket', 'polling'], // Fallback to polling if websocket fails
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
    
    socketInstance.on('sessionHistory', (historyEvents: AgentEvent[]) => {
      console.log('Received session history:', historyEvents.length, 'events');
      setEvents(historyEvents);
      setIsLoading(false);
    });
    
    socketInstance.on('agentEvent', (event: AgentEvent) => {
      console.log('Received agent event:', event.event, event);
      setEvents(prev => [...prev, event]);
    });
    
    setSocket(socketInstance);
    
    return () => {
      console.log('Cleaning up socket connection');
      socketInstance.disconnect();
    };
  }, [sessionId]);
  
  const clearEvents = useCallback(() => {
    setEvents([]);
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
    connected, 
    isLoading, 
    connectionError,
    clearEvents,
    getEventCount,
    getAgentCounts,
    getServiceCounts
  };
} 