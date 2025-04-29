/**
 * Task Breakdown Service
 * 
 * Implements collaborative task breakdown functionality for multiple agents
 * Part of the Supervisor Transformation in Milestone 2
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { AgentRegistryService } from './agent-registry.service';
import { CollaborativeTaskBreakdown } from '../interfaces/collaboration.interface';
import { BaseAgentInterface } from '../interfaces/base-agent.interface';
import { Task } from '../specialized/facilitator-supervisor-agent';

export interface TaskBreakdownOptions {
  maxSubtasks?: number;
  minSubtasks?: number;
  maxCollaborators?: number;
  votingThreshold?: number;
  taskComplexity?: number;
  subtaskTemplate?: string;
  autoApprove?: boolean;
}

export interface SubtaskDefinition {
  id: string;
  description: string;
  requiredCapabilities: string[];
  estimatedComplexity: number;
  prerequisites?: string[];
  suggestedAgentId?: string;
}

/**
 * TaskBreakdownService - Enables collaborative task decomposition
 */
export class TaskBreakdownService {
  private static instance: TaskBreakdownService;
  private logger: Logger;
  private agentRegistry: AgentRegistryService;
  private breakdowns: Map<string, CollaborativeTaskBreakdown> = new Map();

  private constructor(
    options: {
      logger?: Logger;
      agentRegistry?: AgentRegistryService;
    } = {}
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.agentRegistry = options.agentRegistry || AgentRegistryService.getInstance();
    
    this.logger.info('TaskBreakdownService initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    options: {
      logger?: Logger;
      agentRegistry?: AgentRegistryService;
    } = {}
  ): TaskBreakdownService {
    if (!TaskBreakdownService.instance) {
      TaskBreakdownService.instance = new TaskBreakdownService(options);
    }
    return TaskBreakdownService.instance;
  }

  /**
   * Initiate a collaborative task breakdown
   */
  public async initiateTaskBreakdown(
    taskId: string,
    task: Task,
    proposingAgentId: string,
    collaboratorIds: string[] = [],
    options: TaskBreakdownOptions = {}
  ): Promise<CollaborativeTaskBreakdown> {
    this.logger.info(`Initiating collaborative breakdown for task ${taskId} by agent ${proposingAgentId}`);
    
    const breakdownId = `breakdown-${taskId}-${uuidv4().substring(0, 8)}`;
    
    // Create initial breakdown structure
    const breakdown: CollaborativeTaskBreakdown = {
      taskId,
      breakdownId,
      proposingAgentId,
      collaborators: [proposingAgentId, ...collaboratorIds],
      subtasks: [],
      votes: [],
      status: 'draft',
      createdAt: Date.now(),
      modifiedAt: Date.now()
    };
    
    // Store the breakdown
    this.breakdowns.set(breakdownId, breakdown);
    
    // If we have task requirements, create initial subtask suggestions
    if (task.requiredCapabilities && task.requiredCapabilities.length > 0) {
      // Simple baseline breakdown - in a real implementation this would
      // use more sophisticated analysis or LLM-based decomposition
      const initialSubtasks = this.createInitialSubtasks(task);
      breakdown.subtasks = initialSubtasks;
      breakdown.modifiedAt = Date.now();
      
      this.breakdowns.set(breakdownId, breakdown);
    }
    
    return breakdown;
  }
  
  /**
   * Create initial subtasks based on task requirements
   * This is a simple implementation - in practice, this would use an LLM
   */
  private createInitialSubtasks(task: Task): SubtaskDefinition[] {
    const subtasks: SubtaskDefinition[] = [];
    
    // Add a planning subtask
    subtasks.push({
      id: `subtask-${uuidv4().substring(0, 8)}`,
      description: `Plan approach for ${task.name}`,
      requiredCapabilities: ['task-planning'],
      estimatedComplexity: 3,
      prerequisites: []
    });
    
    // Create subtasks for each required capability
    if (task.requiredCapabilities) {
      task.requiredCapabilities.forEach(capability => {
        subtasks.push({
          id: `subtask-${uuidv4().substring(0, 8)}`,
          description: `Execute ${capability} for ${task.name}`,
          requiredCapabilities: [capability],
          estimatedComplexity: 5,
          prerequisites: [subtasks[0].id] // Depends on planning
        });
      });
    }
    
    // Add integration subtask if we have multiple capability-based subtasks
    if (subtasks.length > 2) {
      const integrationTask: SubtaskDefinition = {
        id: `subtask-${uuidv4().substring(0, 8)}`,
        description: `Integrate results for ${task.name}`,
        requiredCapabilities: ['task-planning', 'work-coordination'],
        estimatedComplexity: 4,
        prerequisites: subtasks.slice(1).map(s => s.id) // Depends on all capability subtasks
      };
      subtasks.push(integrationTask);
    }
    
    return subtasks;
  }
  
  /**
   * Add collaborator to a task breakdown
   */
  public addCollaborator(
    breakdownId: string,
    collaboratorId: string
  ): boolean {
    const breakdown = this.breakdowns.get(breakdownId);
    if (!breakdown) {
      this.logger.warn(`Breakdown ${breakdownId} not found`);
      return false;
    }
    
    if (breakdown.collaborators.includes(collaboratorId)) {
      this.logger.info(`Agent ${collaboratorId} is already a collaborator on breakdown ${breakdownId}`);
      return true;
    }
    
    breakdown.collaborators.push(collaboratorId);
    breakdown.modifiedAt = Date.now();
    this.breakdowns.set(breakdownId, breakdown);
    
    this.logger.info(`Added agent ${collaboratorId} as collaborator on breakdown ${breakdownId}`);
    return true;
  }
  
  /**
   * Submit a vote on a task breakdown
   */
  public submitBreakdownVote(
    breakdownId: string,
    agentId: string,
    vote: 'approve' | 'reject' | 'suggestion',
    suggestedChanges?: any,
    reason?: string
  ): boolean {
    const breakdown = this.breakdowns.get(breakdownId);
    if (!breakdown) {
      this.logger.warn(`Breakdown ${breakdownId} not found`);
      return false;
    }
    
    // Check if agent is a collaborator
    if (!breakdown.collaborators.includes(agentId)) {
      this.logger.warn(`Agent ${agentId} is not a collaborator on breakdown ${breakdownId}`);
      return false;
    }
    
    // Check if already voted
    const existingVoteIndex = breakdown.votes.findIndex(v => v.agentId === agentId);
    
    if (existingVoteIndex >= 0) {
      // Update existing vote
      breakdown.votes[existingVoteIndex] = {
        agentId,
        vote,
        suggestedChanges,
        reason
      };
    } else {
      // Add new vote
      breakdown.votes.push({
        agentId,
        vote,
        suggestedChanges,
        reason
      });
    }
    
    // Update last modified timestamp
    breakdown.modifiedAt = Date.now();
    
    // Check if we have enough votes to change status
    this.checkBreakdownVotingStatus(breakdown);
    
    // Save updated breakdown
    this.breakdowns.set(breakdownId, breakdown);
    
    return true;
  }
  
  /**
   * Check voting status and update breakdown status if needed
   */
  private checkBreakdownVotingStatus(breakdown: CollaborativeTaskBreakdown): void {
    // Only process if in voting status
    if (breakdown.status !== 'voting') return;
    
    const totalVotes = breakdown.votes.length;
    const totalCollaborators = breakdown.collaborators.length;
    
    // Need at least 50% of collaborators to have voted
    if (totalVotes < totalCollaborators / 2) return;
    
    const approveVotes = breakdown.votes.filter(v => v.vote === 'approve').length;
    const rejectVotes = breakdown.votes.filter(v => v.vote === 'reject').length;
    
    // Simple majority rule
    if (approveVotes > totalVotes / 2) {
      breakdown.status = 'approved';
      this.logger.info(`Breakdown ${breakdown.breakdownId} approved with ${approveVotes}/${totalVotes} votes`);
      
      // Calculate metrics for the approved breakdown
      this.calculateBreakdownMetrics(breakdown);
    } else if (rejectVotes >= totalVotes / 2) {
      breakdown.status = 'rejected';
      this.logger.info(`Breakdown ${breakdown.breakdownId} rejected with ${rejectVotes}/${totalVotes} votes`);
    }
  }
  
  /**
   * Calculate metrics for an approved breakdown
   */
  private calculateBreakdownMetrics(breakdown: CollaborativeTaskBreakdown): void {
    const subtasks = breakdown.subtasks;
    
    // Calculate average subtask complexity
    const avgComplexity = subtasks.reduce(
      (sum, task) => sum + task.estimatedComplexity, 0
    ) / subtasks.length;
    
    // Calculate parallelization score
    // Count how many subtasks can be executed in parallel
    let maxParallelChains = 0;
    const dependencyChains = new Map<string, string[]>();
    
    // Build dependency chains
    subtasks.forEach(task => {
      if (!task.prerequisites || task.prerequisites.length === 0) {
        dependencyChains.set(task.id, [task.id]);
      }
    });
    
    // Extend chains
    for (let i = 0; i < subtasks.length; i++) {
      subtasks.forEach(task => {
        if (task.prerequisites && task.prerequisites.length > 0) {
          task.prerequisites.forEach(prereq => {
            if (dependencyChains.has(prereq)) {
              const chain = [...dependencyChains.get(prereq)!, task.id];
              dependencyChains.set(task.id, chain);
            }
          });
        }
      });
    }
    
    // Count unique chains
    const uniqueChains = new Set<string>();
    dependencyChains.forEach(chain => {
      uniqueChains.add(chain.join('->'));
    });
    
    maxParallelChains = uniqueChains.size;
    
    // Calculate parallelization score (0-1)
    const parallelizationScore = Math.min(
      maxParallelChains / Math.max(subtasks.length, 1),
      1
    );
    
    // Calculate capability match score
    // Check if required capabilities are covered by suggested agents
    let capabilityMatchCount = 0;
    let totalCapabilityRequirements = 0;
    
    subtasks.forEach(task => {
      if (task.suggestedAgentId && task.requiredCapabilities) {
        totalCapabilityRequirements += task.requiredCapabilities.length;
        
        const agent = this.agentRegistry.getAgent(task.suggestedAgentId);
        if (agent) {
          const agentCapabilities = agent.getCapabilities().map(c => c.name);
          const matchedCapabilities = task.requiredCapabilities.filter(
            rc => agentCapabilities.includes(rc)
          );
          
          capabilityMatchCount += matchedCapabilities.length;
        }
      }
    });
    
    const capabilityMatchScore = totalCapabilityRequirements > 0
      ? capabilityMatchCount / totalCapabilityRequirements
      : 0.5;
    
    // Set metrics
    breakdown.metrics = {
      averageSubtaskComplexity: avgComplexity,
      parallelizationScore,
      capabilityMatchScore
    };
  }
  
  /**
   * Update subtasks in a breakdown
   */
  public updateSubtasks(
    breakdownId: string,
    agentId: string,
    subtasks: SubtaskDefinition[]
  ): boolean {
    const breakdown = this.breakdowns.get(breakdownId);
    if (!breakdown) {
      this.logger.warn(`Breakdown ${breakdownId} not found`);
      return false;
    }
    
    // Check if agent is a collaborator
    if (!breakdown.collaborators.includes(agentId)) {
      this.logger.warn(`Agent ${agentId} is not a collaborator on breakdown ${breakdownId}`);
      return false;
    }
    
    // Check if breakdown is in draft or rejected status (can be updated)
    if (breakdown.status !== 'draft' && breakdown.status !== 'rejected') {
      this.logger.warn(`Cannot update breakdown ${breakdownId} in ${breakdown.status} status`);
      return false;
    }
    
    // Update subtasks
    breakdown.subtasks = subtasks;
    breakdown.modifiedAt = Date.now();
    
    // If it was rejected, set back to draft
    if (breakdown.status === 'rejected') {
      breakdown.status = 'draft';
      // Clear previous votes
      breakdown.votes = [];
    }
    
    this.breakdowns.set(breakdownId, breakdown);
    
    this.logger.info(`Updated subtasks for breakdown ${breakdownId}`);
    return true;
  }
  
  /**
   * Start voting process for a breakdown
   */
  public startVoting(breakdownId: string, agentId: string): boolean {
    const breakdown = this.breakdowns.get(breakdownId);
    if (!breakdown) {
      this.logger.warn(`Breakdown ${breakdownId} not found`);
      return false;
    }
    
    // Check if agent is the proposing agent or a collaborator
    if (breakdown.proposingAgentId !== agentId && !breakdown.collaborators.includes(agentId)) {
      this.logger.warn(`Agent ${agentId} cannot start voting for breakdown ${breakdownId}`);
      return false;
    }
    
    // Check if breakdown is in draft status
    if (breakdown.status !== 'draft') {
      this.logger.warn(`Cannot start voting for breakdown ${breakdownId} in ${breakdown.status} status`);
      return false;
    }
    
    // Update status
    breakdown.status = 'voting';
    breakdown.modifiedAt = Date.now();
    
    this.breakdowns.set(breakdownId, breakdown);
    
    this.logger.info(`Started voting for breakdown ${breakdownId}`);
    return true;
  }
  
  /**
   * Get breakdown by ID
   */
  public getBreakdown(breakdownId: string): CollaborativeTaskBreakdown | undefined {
    return this.breakdowns.get(breakdownId);
  }
  
  /**
   * Get all breakdowns for a task
   */
  public getBreakdownsForTask(taskId: string): CollaborativeTaskBreakdown[] {
    return Array.from(this.breakdowns.values())
      .filter(breakdown => breakdown.taskId === taskId);
  }
} 