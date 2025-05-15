/**
 * Agent Graph Visualization Service
 * 
 * This service provides real-time visualization of the hierarchical agent system
 * for meeting analysis, showing the supervisor, manager, and worker agents,
 * along with their interactions and task delegations.
 */

import { v4 as uuidv4 } from 'uuid';
import { MeetingAnalysisServiceRegistry } from '../services/service-registry';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

// Define MessageType enum to match the expected values
enum MessageType {
  TASK = 'task',
  REQUEST = 'request',
  RESPONSE = 'response',
  INFO = 'info',
  ERROR = 'error',
  SYSTEM = 'system'
}

import { generateVisualization } from '../../core/utils/visualization-generator';
import { 
  VisualizationElement, 
  VisualizationConnection, 
  VisualizationElementType, 
  VisualizationConnectionType,
  VisualizationElementState
} from '../interfaces/visualization.interface';
import { broadcastStateUpdate } from '../../../api/controllers/visualization.controller';

/**
 * Configuration for the agent graph visualization service
 */
export interface AgentGraphVisualizationConfig {
  logger?: Logger;
  enableRealTimeUpdates?: boolean;
  visualizationsPath?: string;
  serviceRegistry?: MeetingAnalysisServiceRegistry;
}

/**
 * Service for visualizing the agent graph and its activities
 */
export class AgentGraphVisualizationService {
  private logger: Logger;
  private enableRealTimeUpdates: boolean;
  private visualizationsPath: string;
  private serviceRegistry: MeetingAnalysisServiceRegistry;
  private graphData: Map<string, {
    elements: Map<string, VisualizationElement>;
    connections: Map<string, VisualizationConnection>;
    lastUpdate: number;
  }> = new Map();
  
  /**
   * Create a new agent graph visualization service
   */
  constructor(config: AgentGraphVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.enableRealTimeUpdates = config.enableRealTimeUpdates !== false;
    this.visualizationsPath = config.visualizationsPath || 'visualizations';
    this.serviceRegistry = config.serviceRegistry || MeetingAnalysisServiceRegistry.getInstance();
    
    this.logger.info('Agent Graph Visualization Service initialized');
  }
  
  /**
   * Initialize a visualization for a new session
   * @param sessionId The analysis session ID
   * @param teamData Data about the agent team
   * @returns The visualization ID
   */
  public initializeVisualization(
    sessionId: string, 
    teamData: { 
      supervisor: any; 
      managers?: any[]; 
      workers?: any[];
    }
  ): string {
    const visualizationId = `vis-${sessionId}`;
    
    // Create a new graph data structure
    this.graphData.set(visualizationId, {
      elements: new Map(),
      connections: new Map(),
      lastUpdate: Date.now()
    });
    
    const graph = this.graphData.get(visualizationId);
    if (!graph) return visualizationId;
    
    // Add supervisor as the central node
    if (teamData.supervisor) {
      this.addAgentNode(
        visualizationId,
        teamData.supervisor.id,
        'Supervisor',
        'supervisor',
        {
          expertise: teamData.supervisor.expertise || ['coordination'],
          description: teamData.supervisor.description || 'Coordinates the analysis process',
        }
      );
    }
    
    // Add manager agents
    if (teamData.managers && teamData.managers.length > 0) {
      teamData.managers.forEach((manager, index) => {
        const nodeId = this.addAgentNode(
          visualizationId,
          manager.id,
          `Manager: ${manager.name || manager.id}`,
          'manager',
          {
            expertise: manager.expertise || ['management'],
            description: manager.description || 'Manages a team of specialist workers',
            domain: manager.domain || 'General'
          }
        );
        
        // Connect to supervisor
        if (teamData.supervisor) {
          this.addConnection(
            visualizationId,
            teamData.supervisor.id,
            manager.id,
            VisualizationConnectionType.COLLABORATION,
            'Delegates to',
            { strength: 0.8 }
          );
        }
      });
    }
    
    // Add worker agents
    if (teamData.workers && teamData.workers.length > 0) {
      teamData.workers.forEach((worker, index) => {
        const nodeId = this.addAgentNode(
          visualizationId,
          worker.id,
          `Worker: ${worker.name || worker.id}`,
          'worker',
          {
            expertise: worker.expertise || ['specialist'],
            description: worker.description || 'Specializes in specific analysis tasks'
          }
        );
        
        // Find the appropriate manager to connect to
        const managerId = this.findManagerForWorker(teamData.managers || [], worker);
        if (managerId) {
          this.addConnection(
            visualizationId,
            managerId,
            worker.id,
            VisualizationConnectionType.DEPENDENCY,
            'Manages',
            { strength: 0.6 }
          );
        } else if (teamData.supervisor) {
          // Connect to supervisor if no manager found
          this.addConnection(
            visualizationId,
            teamData.supervisor.id,
            worker.id,
            VisualizationConnectionType.DEPENDENCY,
            'Directly manages',
            { strength: 0.4 }
          );
        }
      });
    }
    
    // Add user node as the source of the request
    this.addNode(
      visualizationId,
      'user',
      'User',
      VisualizationElementType.PARTICIPANT,
      VisualizationElementState.INACTIVE,
      { description: 'Source of the analysis request' }
    );
    
    // Connect user to supervisor
    if (teamData.supervisor) {
      this.addConnection(
        visualizationId,
        'user',
        teamData.supervisor.id,
        VisualizationConnectionType.COMMUNICATION,
        'Sends request to',
        { strength: 1.0, animated: true }
      );
    }
    
    // Broadcast initial graph state
    this.publishGraphUpdate(visualizationId);
    
    this.logger.info(`Initialized agent graph visualization for ${sessionId}`);
    
    return visualizationId;
  }
  
  /**
   * Add a communication event to the visualization
   */
  public addCommunicationEvent(
    visualizationId: string,
    fromId: string,
    toId: string,
    messageType: MessageType,
    content: string
  ): string {
    const graph = this.graphData.get(visualizationId);
    if (!graph) return '';
    
    // Create or update the connection
    const connectionId = `comm-${fromId}-${toId}-${Date.now()}`;
    const connection: VisualizationConnection = {
      id: connectionId,
      type: VisualizationConnectionType.COMMUNICATION,
      sourceId: fromId,
      targetId: toId,
      label: this.getMessageTypeLabel(messageType),
      properties: {
        content: content.length > 100 ? `${content.substring(0, 100)}...` : content,
        fullContent: content,
        messageType,
        timestamp: Date.now()
      },
      animated: true,
      strength: 0.8,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        isTemporary: true,
        expiresAt: Date.now() + 10000 // 10 seconds temporary highlight
      }
    };
    
    graph.connections.set(connectionId, connection);
    
    // Update active state of the agents
    this.setNodeState(visualizationId, fromId, VisualizationElementState.ACTIVE);
    this.setNodeState(visualizationId, toId, VisualizationElementState.HIGHLIGHTED);
    
    // Add task node if the message is task-related
    if (messageType === MessageType.TASK || messageType === MessageType.RESPONSE) {
      const taskId = `task-${uuidv4().split('-')[0]}`;
      this.addNode(
        visualizationId,
        taskId,
        this.extractTaskName(content),
        VisualizationElementType.INSIGHT,
        VisualizationElementState.ACTIVE,
        {
          content: content.length > 100 ? `${content.substring(0, 100)}...` : content,
          fullContent: content,
          fromAgent: fromId,
          toAgent: toId,
          timestamp: Date.now()
        }
      );
      
      // Connect task to both agents
      this.addConnection(
        visualizationId,
        fromId,
        taskId,
        VisualizationConnectionType.ASSIGNMENT,
        'Assigns',
        { strength: 0.7 }
      );
      
      this.addConnection(
        visualizationId,
        taskId,
        toId,
        VisualizationConnectionType.ASSIGNMENT,
        'Assigned to',
        { strength: 0.7 }
      );
    }
    
    // Publish updates if real-time updates are enabled
    this.publishGraphUpdate(visualizationId);
    
    // Schedule cleanup of temporary communication
    setTimeout(() => this.cleanupTemporaryConnections(visualizationId), 10000);
    
    return connectionId;
  }
  
  /**
   * Add a task node to the visualization
   */
  public addTaskNode(
    visualizationId: string,
    taskDescription: string,
    assignerAgentId: string,
    assigneeAgentId: string
  ): string {
    const taskId = `task-${uuidv4().split('-')[0]}`;
    
    this.addNode(
      visualizationId,
      taskId,
      this.extractTaskName(taskDescription),
      VisualizationElementType.INSIGHT,
      VisualizationElementState.ACTIVE,
      {
        content: taskDescription.length > 100 ? `${taskDescription.substring(0, 100)}...` : taskDescription,
        fullContent: taskDescription,
        assignerAgentId,
        assigneeAgentId,
        timestamp: Date.now(),
        status: 'pending'
      }
    );
    
    // Connect task to both agents
    this.addConnection(
      visualizationId,
      assignerAgentId,
      taskId,
      VisualizationConnectionType.ASSIGNMENT,
      'Assigns',
      { strength: 0.7 }
    );
    
    this.addConnection(
      visualizationId,
      taskId,
      assigneeAgentId,
      VisualizationConnectionType.ASSIGNMENT,
      'Assigned to',
      { strength: 0.7 }
    );
    
    // Publish updates
    this.publishGraphUpdate(visualizationId);
    
    return taskId;
  }
  
  /**
   * Update task status
   */
  public updateTaskStatus(
    visualizationId: string,
    taskId: string,
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
  ): boolean {
    const graph = this.graphData.get(visualizationId);
    if (!graph) return false;
    
    const task = graph.elements.get(taskId);
    if (!task) return false;
    
    // Update task properties
    task.properties.status = status;
    task.updatedAt = new Date();
    
    // Update task state
    switch (status) {
      case 'in_progress':
        task.state = VisualizationElementState.ACTIVE;
        break;
      case 'completed':
        task.state = VisualizationElementState.SELECTED;
        break;
      case 'failed':
        task.state = VisualizationElementState.ERROR;
        break;
      default:
        task.state = VisualizationElementState.INACTIVE;
    }
    
    // Publish updates
    this.publishGraphUpdate(visualizationId);
    
    return true;
  }
  
  /**
   * Add a topic node to the visualization
   */
  public addTopicNode(
    visualizationId: string,
    topicName: string,
    relevance: number = 0.8
  ): string {
    const topicId = `topic-${uuidv4().split('-')[0]}`;
    
    this.addNode(
      visualizationId,
      topicId,
      topicName,
      VisualizationElementType.TOPIC,
      VisualizationElementState.INACTIVE,
      {
        relevance,
        timestamp: Date.now()
      }
    );
    
    // Publish updates
    this.publishGraphUpdate(visualizationId);
    
    return topicId;
  }
  
  /**
   * Add an action item to the visualization
   */
  public addActionItemNode(
    visualizationId: string,
    description: string,
    assignee?: string
  ): string {
    const actionItemId = `action-${uuidv4().split('-')[0]}`;
    
    this.addNode(
      visualizationId,
      actionItemId,
      description.length > 30 ? `${description.substring(0, 30)}...` : description,
      VisualizationElementType.ACTION_ITEM,
      VisualizationElementState.INACTIVE,
      {
        description,
        assignee,
        timestamp: Date.now(),
        status: 'pending'
      }
    );
    
    // Publish updates
    this.publishGraphUpdate(visualizationId);
    
    return actionItemId;
  }
  
  /**
   * Generate static HTML visualization for a session
   */
  public generateStaticVisualization(sessionId: string): string | null {
    const visualizationId = `vis-${sessionId}`;
    const graph = this.graphData.get(visualizationId);
    if (!graph) return null;
    
    // Prepare data for visualization
    const visualizationData = {
      nodes: Array.from(graph.elements.values()),
      edges: Array.from(graph.connections.values()),
      metadata: {
        sessionId,
        createdAt: new Date().toISOString(),
        nodeCount: graph.elements.size,
        edgeCount: graph.connections.size
      }
    };
    
    // Generate HTML visualization
    const htmlPath = generateVisualization(
      {
        runId: sessionId,
        graphData: visualizationData
      },
      {
        visualizationsPath: this.visualizationsPath,
        logger: this.logger,
        title: `Meeting Analysis Session: ${sessionId}`
      }
    );
    
    return htmlPath;
  }
  
  /**
   * Add a result node to the visualization
   */
  public addResultNode(
    visualizationId: string,
    resultType: 'summary' | 'topics' | 'action_items',
    content: any,
    generatedBy: string
  ): string {
    const resultId = `result-${resultType}-${uuidv4().split('-')[0]}`;
    
    let nodeLabel = '';
    let nodeProperties: Record<string, any> = {};
    
    switch (resultType) {
      case 'summary':
        nodeLabel = 'Meeting Summary';
        nodeProperties = {
          content: typeof content === 'string' ? content : 
            (content.short || 'Summary not available'),
          detailedContent: content.detailed || '',
        };
        break;
      case 'topics':
        nodeLabel = 'Topic Analysis';
        nodeProperties = {
          count: Array.isArray(content) ? content.length : 0,
          topics: Array.isArray(content) ? 
            content.map((t: any) => typeof t === 'string' ? t : t.name) : []
        };
        break;
      case 'action_items':
        nodeLabel = 'Action Items';
        nodeProperties = {
          count: Array.isArray(content) ? content.length : 0,
          items: Array.isArray(content) ? 
            content.map((a: any) => a.description) : []
        };
        break;
    }
    
    this.addNode(
      visualizationId,
      resultId,
      nodeLabel,
      VisualizationElementType.INSIGHT,
      VisualizationElementState.SELECTED,
      {
        ...nodeProperties,
        resultType,
        timestamp: Date.now(),
        generatedBy
      }
    );
    
    // Connect to the generating agent
    this.addConnection(
      visualizationId,
      generatedBy,
      resultId,
      VisualizationConnectionType.RELATION,
      'Generated',
      { strength: 0.9 }
    );
    
    // Publish updates
    this.publishGraphUpdate(visualizationId);
    
    return resultId;
  }
  
  /**
   * Get the current graph data for a session
   * @param sessionId The session ID
   * @returns The graph data with nodes and edges
   */
  public getGraphData(sessionId: string): { nodes: any[]; edges: any[] } | null {
    const visualizationId = `vis-${sessionId}`;
    const graph = this.graphData.get(visualizationId);
    
    if (!graph) return null;
    
    // Convert the maps to arrays
    return {
      nodes: Array.from(graph.elements.values()),
      edges: Array.from(graph.connections.values())
    };
  }
  
  // Private helper methods
  
  /**
   * Add an agent node to the visualization
   */
  private addAgentNode(
    visualizationId: string,
    agentId: string,
    label: string,
    agentType: 'supervisor' | 'manager' | 'worker',
    properties: Record<string, any> = {}
  ): string {
    let elementType: VisualizationElementType;
    let state: VisualizationElementState = VisualizationElementState.INACTIVE;
    
    switch (agentType) {
      case 'supervisor':
        elementType = VisualizationElementType.AGENT;
        break;
      case 'manager':
        elementType = VisualizationElementType.AGENT;
        break;
      case 'worker':
        elementType = VisualizationElementType.AGENT;
        break;
      default:
        elementType = VisualizationElementType.AGENT;
    }
    
    return this.addNode(
      visualizationId,
      agentId,
      label,
      elementType,
      state,
      {
        agentType,
        ...properties
      }
    );
  }
  
  /**
   * Add a node to the visualization
   */
  private addNode(
    visualizationId: string,
    id: string,
    label: string,
    type: VisualizationElementType,
    state: VisualizationElementState,
    properties: Record<string, any> = {}
  ): string {
    const graph = this.graphData.get(visualizationId);
    if (!graph) return id;
    
    const element: VisualizationElement = {
      id,
      type,
      label,
      properties,
      state,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    graph.elements.set(id, element);
    graph.lastUpdate = Date.now();
    
    return id;
  }
  
  /**
   * Add a connection between nodes
   */
  private addConnection(
    visualizationId: string,
    sourceId: string,
    targetId: string,
    type: VisualizationConnectionType,
    label: string = '',
    properties: Record<string, any> = {}
  ): string {
    const graph = this.graphData.get(visualizationId);
    if (!graph) return '';
    
    const connectionId = `conn-${sourceId}-${targetId}`;
    
    const connection: VisualizationConnection = {
      id: connectionId,
      sourceId,
      targetId,
      type,
      label,
      properties,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    graph.connections.set(connectionId, connection);
    graph.lastUpdate = Date.now();
    
    return connectionId;
  }
  
  /**
   * Set the state of a node
   */
  private setNodeState(
    visualizationId: string,
    nodeId: string,
    state: VisualizationElementState
  ): boolean {
    const graph = this.graphData.get(visualizationId);
    if (!graph) return false;
    
    const node = graph.elements.get(nodeId);
    if (!node) return false;
    
    node.state = state;
    node.updatedAt = new Date();
    graph.lastUpdate = Date.now();
    
    return true;
  }
  
  /**
   * Remove temporary connections
   */
  private cleanupTemporaryConnections(visualizationId: string): void {
    const graph = this.graphData.get(visualizationId);
    if (!graph) return;
    
    const now = Date.now();
    let hasRemovals = false;
    
    // Find and remove expired connections
    graph.connections.forEach((conn, id) => {
      if (conn.metadata?.isTemporary && conn.metadata?.expiresAt && conn.metadata.expiresAt < now) {
        graph.connections.delete(id);
        hasRemovals = true;
      }
    });
    
    if (hasRemovals) {
      graph.lastUpdate = now;
      this.publishGraphUpdate(visualizationId);
    }
  }
  
  /**
   * Find the appropriate manager for a worker
   */
  private findManagerForWorker(managers: any[], worker: any): string | null {
    if (!managers || managers.length === 0) return null;
    
    // If worker has a manager ID, use that
    if (worker.managerId) {
      return worker.managerId;
    }
    
    // If worker has domains, try to match with manager domains
    if (worker.domain) {
      const matchedManager = managers.find(manager => 
        manager.domain === worker.domain
      );
      
      if (matchedManager) {
        return matchedManager.id;
      }
    }
    
    // If worker has expertise, try to match with manager expertise
    if (worker.expertise && Array.isArray(worker.expertise)) {
      for (const manager of managers) {
        if (!manager.expertise || !Array.isArray(manager.expertise)) continue;
        
        const hasMatch = worker.expertise.some((exp: string) => 
          manager.expertise.includes(exp)
        );
        
        if (hasMatch) {
          return manager.id;
        }
      }
    }
    
    // If no match found, return the first manager
    return managers[0]?.id || null;
  }
  
  /**
   * Extract a task name from a description
   */
  private extractTaskName(description: string): string {
    // If description is too long, truncate it
    if (description.length > 40) {
      return `${description.substring(0, 37)}...`;
    }
    
    return description;
  }
  
  /**
   * Get a label for a message type
   */
  private getMessageTypeLabel(messageType: MessageType): string {
    switch (messageType) {
      case MessageType.TASK:
        return 'Task';
      case MessageType.REQUEST:
        return 'Request';
      case MessageType.RESPONSE:
        return 'Response';
      case MessageType.INFO:
        return 'Info';
      case MessageType.ERROR:
        return 'Error';
      case MessageType.SYSTEM:
        return 'System';
      default:
        return 'Message';
    }
  }
  
  /**
   * Publish a graph update via WebSocket
   */
  private publishGraphUpdate(visualizationId: string): void {
    if (!this.enableRealTimeUpdates) return;
    
    const graph = this.graphData.get(visualizationId);
    if (!graph) return;
    
    // Extract the session ID from the visualization ID
    const sessionId = visualizationId.replace('vis-', '');
    
    // Prepare the graph data for broadcast
    const graphData = {
      nodes: Array.from(graph.elements.values()),
      edges: Array.from(graph.connections.values()),
      timestamp: new Date().toISOString(),
      sessionId
    };
    
    // Broadcast the update
    broadcastStateUpdate(sessionId, graphData);
  }
} 