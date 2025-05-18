import { Node, Edge } from '@xyflow/react';
import { AgentEvent } from '@/hooks/useAgentVisualization';
import { type AgentNodeData } from '../nodes/AgentNode';
import { type ServiceNodeData } from '../nodes/ServiceNode';

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Transforms agent events into a graph representation for visualization
 */
export function prepareGraphData(events: AgentEvent[]): GraphData {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const agentIds = new Set<string>();
  const serviceIds = new Set<string>();
  const agentData = new Map<string, any>();
  const serviceData = new Map<string, any>();
  
  // First pass: collect all unique agents and services
  events.forEach(event => {
    const { data } = event;
    
    if (data.agentId && !agentIds.has(data.agentId)) {
      agentIds.add(data.agentId);
      agentData.set(data.agentId, {
        id: data.agentId,
        type: data.agentType,
        calls: 0,
        startTime: data.timestamp,
        status: 'pending',
      });
    }
    
    // For external service events
    if (data.serviceType && data.operation) {
      const serviceId = `${data.serviceType}-${data.operation}-${data.timestamp}`;
      if (!serviceIds.has(serviceId)) {
        serviceIds.add(serviceId);
        serviceData.set(serviceId, {
          id: serviceId,
          serviceType: data.serviceType,
          operation: data.operation,
          status: 'pending',
          timestamp: data.timestamp,
          agentId: data.agentId, // Keep track of which agent called this service
          query: data.query,     // Store query information
          options: data.options  // Store options information
        });
      }
    }
    
    // Update agent data based on event
    if (data.agentId && agentData.has(data.agentId)) {
      const agent = agentData.get(data.agentId);
      
      if (event.event.includes('started')) {
        agent.status = 'in_progress';
        agent.calls += 1;
      } else if (event.event.includes('completed')) {
        agent.status = 'completed';
        agent.duration = data.duration || 0;
      } else if (event.event.includes('error')) {
        agent.status = 'error';
        agent.error = data.error;
      }
      
      agentData.set(data.agentId, agent);
    }
    
    // Update service data based on event
    if (data.serviceType && data.operation) {
      const relevantServices = Array.from(serviceData.values()).filter(
        s => s.serviceType === data.serviceType && 
             s.operation === data.operation && 
             s.agentId === data.agentId
      );
      
      for (const service of relevantServices) {
        if (event.event.includes('Completed')) {
          service.status = 'completed'; 
          service.duration = data.duration || 0;
        } else if (event.event.includes('Error')) {
          service.status = 'error';
          service.error = data.error;
        } else {
          service.status = 'in_progress';
        }
        
        // Update query and options if they're available
        if (data.query) service.query = data.query;
        if (data.options) service.options = data.options;
      }
    }
  });
  
  // Second pass: create parent-child relationships for agents
  const levelMap = new Map<string, number>();
  
  events.forEach(event => {
    const { data } = event;
    if (data.parentAgentId && data.agentId && agentIds.has(data.parentAgentId) && agentIds.has(data.agentId)) {
      if (!levelMap.has(data.parentAgentId)) {
        levelMap.set(data.parentAgentId, 0);
      }
      
      const parentLevel = levelMap.get(data.parentAgentId)!;
      levelMap.set(data.agentId, parentLevel + 1);
      
      // Create edge from parent to child if it doesn't exist yet
      const edgeId = `${data.parentAgentId}-${data.agentId}`;
      if (!edges.some(e => e.id === edgeId)) {
        edges.push({
          id: edgeId,
          source: data.parentAgentId,
          target: data.agentId,
          animated: true,
          style: { stroke: '#888' },
        });
      }
    }
  });
  
  // Determine agent type based on name and level
  function determineAgentType(agentTypeName: string, level: number): 'supervisor' | 'manager' | 'worker' {
    const lowerName = agentTypeName.toLowerCase();
    
    if (lowerName.includes('supervisor')) return 'supervisor';
    if (lowerName.includes('coordinator') || lowerName.includes('manager')) return 'manager';
    
    // Use level as a fallback
    if (level === 0) return 'supervisor';
    if (level === 1) return 'manager';
    
    return 'worker';
  }
  
  // Position nodes based on hierarchy level
  const levelCounts = new Map<number, number>();
  const maxNodesPerLevel = 4; // Controls horizontal spread
  const horizontalSpacing = 250;
  const verticalSpacing = 150;
  
  // Create agent nodes
  agentIds.forEach(agentId => {
    const agent = agentData.get(agentId);
    const level = levelMap.get(agentId) || 0;
    
    if (!levelCounts.has(level)) {
      levelCounts.set(level, 0);
    }
    
    const levelCount = levelCounts.get(level)!;
    levelCounts.set(level, levelCount + 1);
    
    // Calculate position with zigzag pattern for better visualization
    const rowIndex = Math.floor(levelCount / maxNodesPerLevel);
    const colIndex = levelCount % maxNodesPerLevel;
    
    const yPos = level * verticalSpacing + (rowIndex * 80); // Additional vertical offset for multiple rows
    const xPos = colIndex * horizontalSpacing + (level % 2 === 1 ? horizontalSpacing/2 : 0); // Zigzag effect
    
    nodes.push({
      id: agentId,
      position: { x: xPos, y: yPos },
      data: {
        label: agent.type,
        type: determineAgentType(agent.type, level),
        status: agent.status,
        metrics: {
          calls: agent.calls,
          duration: agent.duration || 0,
        },
        details: agent,
      },
      type: 'agentNode',
    } as Node);
  });
  
  // Create service nodes
  const servicePositions = new Map<string, number>();
  let serviceIndex = 0;
  
  Array.from(serviceData.values()).forEach(service => {
    // Only add the service node if its parent agent exists
    if (service.agentId && agentIds.has(service.agentId)) {
      const level = (levelMap.get(service.agentId) || 0) + 0.5;
      
      if (!servicePositions.has(`${level}`)) {
        servicePositions.set(`${level}`, 0);
      }
      
      const posIndex = servicePositions.get(`${level}`)!;
      servicePositions.set(`${level}`, posIndex + 1);
      
      const parentNode = nodes.find(node => node.id === service.agentId);
      if (!parentNode) return;
      
      // Position to the right of parent agent
      const xPos = parentNode.position.x + 180;
      const yPos = parentNode.position.y - 20 + (posIndex * 80);
      
      const serviceId = `service-${serviceIndex++}`;
      
      nodes.push({
        id: serviceId,
        position: { x: xPos, y: yPos },
        data: {
          label: `${service.operation}`,
          serviceType: service.serviceType,
          operation: service.operation,
          status: service.status,
          metrics: {
            duration: service.duration || 0,
          },
          details: service,
          query: service.query,
          options: service.options
        },
        type: 'serviceNode',
      } as Node);
      
      // Add edge from agent to service
      edges.push({
        id: `${service.agentId}-${serviceId}`,
        source: service.agentId,
        target: serviceId,
        animated: true,
        style: { stroke: '#999', strokeDasharray: '5 5' },
      });
    }
  });
  
  return { nodes, edges };
} 