/**
 * Action Network Visualization Service
 * 
 * Implements visualization of action items, responsibilities, and dependencies
 * identified during meetings.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  ActionNetworkVisualization,
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';

/**
 * Configuration for the ActionNetworkVisualizationImpl
 */
export interface ActionNetworkVisualizationConfig {
  logger?: Logger;
}

/**
 * Action item record
 */
interface ActionItem {
  id: string;
  meetingId: string;
  title: string;
  description: string;
  createdAt: Date;
  deadline?: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignees: string[]; // Agent/participant IDs
  dependencies: string[]; // Other action item IDs
  relatedTopics: string[]; // Topic IDs
  completedAt?: Date;
  progress?: number; // 0-100 percent completion
}

/**
 * Implementation of the ActionNetworkVisualization interface
 */
export class ActionNetworkVisualizationImpl implements ActionNetworkVisualization {
  private logger: Logger;
  private actions: Map<string, ActionItem>;
  private meetingActions: Map<string, Set<string>>;
  private agentActions: Map<string, Set<string>>;
  private topicActions: Map<string, Set<string>>;

  /**
   * Create a new action network visualization service
   */
  constructor(config: ActionNetworkVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.actions = new Map();
    this.meetingActions = new Map();
    this.agentActions = new Map();
    this.topicActions = new Map();
    this.logger.info('ActionNetworkVisualizationImpl initialized');
  }

  /**
   * Record an action item
   */
  recordAction(action: {
    description: string;
    assignees: string[];
    deadline?: Date;
    status: 'pending' | 'in_progress' | 'completed' | 'blocked';
    priority: 'low' | 'medium' | 'high';
    dependsOn?: string[];
    topicId?: string;
    decisionId?: string;
  }): string {
    // Create action record
    const actionId = `action-${uuidv4()}`;
    const timestamp = new Date();
    
    // Determine meeting ID from context (using default if none provided)
    const meetingId = action.decisionId ? 
      `meeting-${action.decisionId.split('-')[1]}` : 'default-meeting';
    
    // Store the action
    const actionItem: ActionItem = {
      id: actionId,
      meetingId,
      title: action.description.length > 50 ? 
        action.description.substring(0, 47) + '...' : 
        action.description,
      description: action.description,
      createdAt: timestamp,
      deadline: action.deadline,
      status: action.status,
      priority: action.priority,
      assignees: action.assignees,
      dependencies: action.dependsOn || [],
      relatedTopics: action.topicId ? [action.topicId] : []
    };
    
    this.actions.set(actionId, actionItem);
    
    // Add to indices
    this.addToIndex(this.meetingActions, meetingId, actionId);
    
    for (const assignee of action.assignees) {
      this.addToIndex(this.agentActions, assignee, actionId);
    }
    
    if (action.topicId) {
      this.addToIndex(this.topicActions, action.topicId, actionId);
    }
    
    this.logger.info(`Recorded action item ${actionId}: ${action.description}`);
    
    return actionId;
  }

  /**
   * Get action by ID
   */
  getActionById(actionId: string): {
    id: string;
    description: string;
    assignees: string[];
    deadline?: Date;
    status: 'pending' | 'in_progress' | 'completed' | 'blocked';
    priority: 'low' | 'medium' | 'high';
    dependsOn?: string[];
    topicId?: string;
    decisionId?: string;
  } {
    // Check if action exists
    if (!this.actions.has(actionId)) {
      throw new Error(`Action ${actionId} not found`);
    }
    
    const action = this.actions.get(actionId)!;
    
    return {
      id: action.id,
      description: action.description,
      assignees: action.assignees,
      deadline: action.deadline,
      status: action.status === 'cancelled' ? 'blocked' : action.status, // Map to interface expected values
      priority: action.priority === 'critical' ? 'high' : action.priority, // Map to interface expected values
      dependsOn: action.dependencies,
      topicId: action.relatedTopics.length > 0 ? action.relatedTopics[0] : undefined,
      // For backwards compatibility, we'll use the first assignee for the decision ID if needed
      decisionId: action.assignees.length > 0 ? `decision-${action.assignees[0].split('-')[1]}` : undefined
    };
  }

  /**
   * Update action item status
   */
  updateActionStatus(actionId: string, status: 'pending' | 'in_progress' | 'completed' | 'blocked', progress?: number): boolean {
    // Check if action exists
    if (!this.actions.has(actionId)) {
      this.logger.error(`Action ${actionId} not found`);
      return false;
    }
    
    const action = this.actions.get(actionId)!;
    
    // Map 'blocked' status to our internal 'cancelled' if needed
    const internalStatus = status === 'blocked' ? 'cancelled' : status;
    
    // Update action status
    action.status = internalStatus;
    
    // Record completion time if completed
    if (status === 'completed') {
      action.completedAt = new Date();
    } else {
      delete action.completedAt;
    }
    
    // Update progress if provided
    if (progress !== undefined) {
      action.progress = progress;
    }
    
    this.logger.info(`Updated action ${actionId} status to ${status}`);
    return true;
  }

  /**
   * Analyze action assignment
   */
  analyzeActionAssignment(meetingId: string): {
    assignmentBalance: number; // 0-1 scale of assignment distribution quality
    overloadedAssignees: string[];
    actionsByPriority: Record<string, number>;
    dependencyComplexity: number; // 0-1 scale
    criticalPath: string[]; // sequence of action IDs
  } {
    const actionIds = this.meetingActions.get(meetingId) || new Set<string>();
    
    if (actionIds.size === 0) {
      return {
        assignmentBalance: 1, // Perfect balance when no actions
        overloadedAssignees: [],
        actionsByPriority: { low: 0, medium: 0, high: 0 },
        dependencyComplexity: 0,
        criticalPath: []
      };
    }
    
    // Get all actions
    const actions = Array.from(actionIds)
      .map(id => this.actions.get(id))
      .filter(Boolean) as ActionItem[];
    
    // Count actions by assignee
    const assigneeCounts: Record<string, number> = {};
    for (const action of actions) {
      for (const assignee of action.assignees) {
        assigneeCounts[assignee] = (assigneeCounts[assignee] || 0) + 1;
      }
    }
    
    // Calculate assignment balance
    const assigneesCount = Object.keys(assigneeCounts).length;
    const totalAssignments = actions.reduce((sum, action) => sum + action.assignees.length, 0);
    const idealAssignmentsPerAssignee = totalAssignments / assigneesCount;
    
    let assignmentVariance = 0;
    for (const count of Object.values(assigneeCounts)) {
      assignmentVariance += Math.pow(count - idealAssignmentsPerAssignee, 2);
    }
    
    const assignmentBalance = Math.max(0, 1 - (Math.sqrt(assignmentVariance / assigneesCount) / idealAssignmentsPerAssignee));
    
    // Identify overloaded assignees (>50% more than average)
    const overloadThreshold = idealAssignmentsPerAssignee * 1.5;
    const overloadedAssignees = Object.entries(assigneeCounts)
      .filter(([, count]) => count > overloadThreshold)
      .map(([assignee]) => assignee);
    
    // Count actions by priority
    const actionsByPriority: Record<string, number> = { low: 0, medium: 0, high: 0 };
    
    for (const action of actions) {
      const mappedPriority = action.priority === 'critical' ? 'high' : action.priority;
      actionsByPriority[mappedPriority] = (actionsByPriority[mappedPriority] || 0) + 1;
    }
    
    // Calculate dependency complexity
    const maxPossibleDependencies = actions.length * (actions.length - 1) / 2;
    const actualDependencies = actions.reduce((sum, action) => sum + action.dependencies.length, 0);
    
    const dependencyComplexity = maxPossibleDependencies > 0 ? 
      Math.min(1, actualDependencies / maxPossibleDependencies) : 0;
    
    // Identify critical path (simplified to high priority actions with dependencies)
    const highPriorityActions = actions.filter(a => 
      a.priority === 'high' || a.priority === 'critical'
    );
    
    const criticalPath = this.findLongestDependencyChain(highPriorityActions);
    
    return {
      assignmentBalance,
      overloadedAssignees,
      actionsByPriority,
      dependencyComplexity,
      criticalPath: criticalPath.map(a => a.id)
    };
  }

  /**
   * Visualize action network
   */
  visualizeActionNetwork(meetingId: string): VisualizationGraph {
    const actionIds = this.meetingActions.get(meetingId) || new Set<string>();
    
    if (actionIds.size === 0) {
      this.logger.info(`No actions found for meeting ${meetingId}`);
      return {
        id: `action-network-${meetingId}`,
        name: `Action Network for Meeting ${meetingId}`,
        elements: [],
        connections: [],
        layout: 'hierarchical',
        timestamp: new Date(),
        version: 1
      };
    }
    
    // Build visualization
    const elements: VisualizationElement[] = [];
    const connections: VisualizationConnection[] = [];
    
    // Get all actions
    const actions = Array.from(actionIds)
      .map(id => this.actions.get(id))
      .filter(Boolean) as ActionItem[];
    
    // Collect unique assignees and topics
    const assigneeIds = new Set<string>();
    const topicIds = new Set<string>();
    
    for (const action of actions) {
      for (const assignee of action.assignees) {
        assigneeIds.add(assignee);
      }
      
      for (const topic of action.relatedTopics) {
        topicIds.add(topic);
      }
    }
    
    // Create assignee elements
    for (const assigneeId of assigneeIds) {
      const elementId = `assignee-${assigneeId}`;
      elements.push({
        id: elementId,
        type: VisualizationElementType.PARTICIPANT,
        label: `Assignee ${assigneeId.split('-').pop()}`,
        description: `Assignee ${assigneeId}`,
        properties: { assigneeId },
        state: VisualizationElementState.ACTIVE,
        color: this.getColorForAssignee(assigneeId),
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    // Create topic elements
    for (const topicId of topicIds) {
      const elementId = `topic-${topicId}`;
      elements.push({
        id: elementId,
        type: VisualizationElementType.TOPIC,
        label: `Topic ${topicId.split('-').pop()}`,
        description: `Topic ${topicId}`,
        properties: { topicId },
        state: VisualizationElementState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    // Add action elements
    for (const action of actions) {
      const elementId = `action-${action.id}`;
      elements.push({
        id: elementId,
        type: VisualizationElementType.ACTION_ITEM,
        label: action.title,
        description: action.description,
        properties: {
          deadline: action.deadline,
          status: action.status,
          priority: action.priority,
          assignees: action.assignees,
          createdAt: action.createdAt
        },
        state: this.getActionState(action.status),
        size: {
          width: 150,
          height: 80
        },
        color: this.getColorForPriority(action.priority),
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Connect to assignees
      for (const assignee of action.assignees) {
        connections.push({
          id: `action-assignee-${action.id}-${assignee}`,
          type: VisualizationConnectionType.ASSIGNMENT,
          sourceId: elementId,
          targetId: `assignee-${assignee}`,
          label: 'Assigned to',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      
      // Connect to topics
      for (const topic of action.relatedTopics) {
        connections.push({
          id: `action-topic-${action.id}-${topic}`,
          type: VisualizationConnectionType.RELATION,
          sourceId: elementId,
          targetId: `topic-${topic}`,
          label: 'Related to',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      
      // Connect to dependencies
      for (const dependency of action.dependencies) {
        if (actionIds.has(dependency)) {
          connections.push({
            id: `action-dependency-${action.id}-${dependency}`,
            type: VisualizationConnectionType.DEPENDENCY,
            sourceId: elementId,
            targetId: `action-${dependency}`,
            label: 'Depends on',
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }
    
    return {
      id: `action-network-${meetingId}`,
      name: `Action Network for Meeting ${meetingId}`,
      description: `Visualization of action items and dependencies for meeting ${meetingId}`,
      elements,
      connections,
      layout: 'hierarchical',
      timestamp: new Date(),
      version: 1,
      metadata: {
        meetingId,
        actionCount: actions.length,
        assigneeCount: assigneeIds.size,
        topicCount: topicIds.size,
        statusBreakdown: {
          pending: actions.filter(a => a.status === 'pending').length,
          in_progress: actions.filter(a => a.status === 'in_progress').length,
          completed: actions.filter(a => a.status === 'completed').length,
          blocked: actions.filter(a => a.status === 'blocked' || a.status === 'cancelled').length
        }
      }
    };
  }

  /**
   * Get action summary for a participant
   */
  getParticipantActionSummary(meetingId: string, participantId: string): {
    totalActions: number;
    pendingActions: ActionItem[];
    completedActions: number;
  } {
    const actionIds = this.agentActions.get(participantId) || new Set<string>();
    
    if (actionIds.size === 0) {
      return {
        totalActions: 0,
        pendingActions: [],
        completedActions: 0
      };
    }
    
    // Get participant's actions for this meeting
    const allActions = Array.from(actionIds)
      .map(id => this.actions.get(id))
      .filter(Boolean) as ActionItem[];
    
    const actions = allActions.filter(a => a.meetingId === meetingId);
    
    // Count completed actions
    const completedActions = actions.filter(a => a.status === 'completed').length;
    
    // Get pending actions
    const pendingActions = actions
      .filter(a => a.status === 'pending' || a.status === 'in_progress');
    
    return {
      totalActions: actions.length,
      pendingActions,
      completedActions
    };
  }

  /**
   * Analyze action dependencies
   */
  analyzeActionDependencies(meetingId: string): {
    criticalPath: string[];
    blockers: ActionItem[];
  } {
    const actionIds = this.meetingActions.get(meetingId) || new Set<string>();
    
    if (actionIds.size === 0) {
      return {
        criticalPath: [],
        blockers: []
      };
    }
    
    // Get all actions
    const actions = Array.from(actionIds)
      .map(id => this.actions.get(id))
      .filter(Boolean) as ActionItem[];
    
    // Build dependency graph
    const reverseGraph: Record<string, string[]> = {};
    
    for (const action of actions) {
      reverseGraph[action.id] = [];
    }
    
    for (const action of actions) {
      for (const dependency of action.dependencies) {
        if (actionIds.has(dependency)) {
          reverseGraph[dependency].push(action.id);
        }
      }
    }
    
    // Find blockers (actions that block multiple others)
    const blockers = actions
      .filter(a => reverseGraph[a.id].length > 1 && 
             (a.status === 'pending' || a.status === 'in_progress'));
    
    // Find critical path
    const criticalPathActions = this.findLongestDependencyChain(actions);
    const criticalPath = criticalPathActions.map(a => a.id);
    
    return {
      criticalPath,
      blockers
    };
  }

  /**
   * Helper: Add to index
   */
  private addToIndex(index: Map<string, Set<string>>, key: string, value: string): void {
    if (!index.has(key)) {
      index.set(key, new Set());
    }
    
    index.get(key)?.add(value);
  }

  /**
   * Helper: Get color for assignee
   */
  private getColorForAssignee(assigneeId: string): string {
    // Simple hash function to get a consistent color
    let hash = 0;
    for (let i = 0; i < assigneeId.length; i++) {
      hash = assigneeId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Convert to color
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  }

  /**
   * Helper: Get color for priority
   */
  private getColorForPriority(priority: string): string {
    switch (priority) {
      case 'critical':
        return '#F44336'; // Red
      case 'high':
        return '#FF9800'; // Orange
      case 'medium':
        return '#FFC107'; // Amber
      case 'low':
      default:
        return '#8BC34A'; // Light Green
    }
  }

  /**
   * Helper: Get action state
   */
  private getActionState(status: string): VisualizationElementState {
    switch (status) {
      case 'pending':
        return VisualizationElementState.INACTIVE;
      case 'in_progress':
        return VisualizationElementState.ACTIVE;
      case 'completed':
        return VisualizationElementState.HIGHLIGHTED; // Use highlighted for completed items
      case 'cancelled':
      case 'blocked':
        return VisualizationElementState.ERROR; // Use error for blocked/cancelled items
      default:
        return VisualizationElementState.INACTIVE;
    }
  }

  /**
   * Helper: Find the longest dependency chain
   */
  private findLongestDependencyChain(actions: ActionItem[]): ActionItem[] {
    // Create map of actions by id
    const actionsMap = new Map<string, ActionItem>();
    for (const action of actions) {
      actionsMap.set(action.id, action);
    }
    
    // Build dependency graph
    const graph: Record<string, string[]> = {};
    
    for (const action of actions) {
      graph[action.id] = [];
      
      for (const depId of action.dependencies) {
        if (actionsMap.has(depId)) {
          graph[action.id].push(depId);
        }
      }
    }
    
    // Find longest path in the dependency graph
    const visited = new Set<string>();
    const memo = new Map<string, ActionItem[]>();
    
    let longestPath: ActionItem[] = [];
    
    for (const action of actions) {
      const path = this.getLongestPath(action.id, graph, actionsMap, visited, memo);
      if (path.length > longestPath.length) {
        longestPath = path;
      }
    }
    
    return longestPath;
  }
  
  /**
   * Helper: Get the longest path from a starting action
   */
  private getLongestPath(
    actionId: string,
    graph: Record<string, string[]>,
    actionsMap: Map<string, ActionItem>,
    visited: Set<string>,
    memo: Map<string, ActionItem[]>
  ): ActionItem[] {
    // Return memoized result
    if (memo.has(actionId)) {
      return memo.get(actionId)!;
    }
    
    // Mark as visited to avoid cycles
    visited.add(actionId);
    
    let longestPath: ActionItem[] = [actionsMap.get(actionId)!];
    
    // Try all dependencies
    for (const depId of graph[actionId]) {
      if (!visited.has(depId)) {
        const path = this.getLongestPath(depId, graph, actionsMap, visited, memo);
        if (path.length + 1 > longestPath.length) {
          longestPath = [actionsMap.get(actionId)!, ...path];
        }
      }
    }
    
    // Remove from visited to allow other paths to use this node
    visited.delete(actionId);
    
    // Memoize result
    memo.set(actionId, longestPath);
    
    return longestPath;
  }
} 