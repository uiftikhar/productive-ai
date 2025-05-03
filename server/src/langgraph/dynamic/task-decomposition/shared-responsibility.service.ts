import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
// Note: Future implementation will likely use LLM-based analysis for optimal responsibility allocation
// with imports such as ChatOpenAI, BaseMessage, SystemMessage, JsonOutputParser.

import {
  ResponsibilityAssignment,
  ResponsibilityType,
  TaskConsensusManager,
  createResponsibilityAssignment,
} from './interfaces/peer-task.interface';
import {
  HierarchicalTask,
  TaskStatus,
} from './interfaces/hierarchical-task.interface';
import { CollaborativeTaskDefinitionService } from './collaborative-task-definition.service';
import { HierarchicalTaskService } from './hierarchical-task.service';

/**
 * Configuration for shared responsibility service
 */
export interface SharedResponsibilityConfig {
  defaultPrimaryPercentage?: number;
  defaultSecondaryPercentage?: number;
  defaultReviewerPercentage?: number;
  defaultConsultantPercentage?: number;
  defaultCoordinatorPercentage?: number;
  defaultObserverPercentage?: number;
  requireBalancedAllocation?: boolean;
  maxConcurrentPrimaryResponsibilities?: number;
  maxResponsibilitiesPerAgent?: number;
  defaultDistributionStrategy?: 'balanced' | 'weighted' | 'expertise-based';
}

/**
 * Result of a responsibility validation
 */
export interface ResponsibilityValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Contribution record tracking agent task contributions
 */
export interface ContributionRecord {
  id: string;
  taskId: string;
  agentId: string;
  responsibilityId: string;
  timestamp: number;
  contributionType:
    | 'code'
    | 'review'
    | 'documentation'
    | 'testing'
    | 'coordination'
    | 'other';
  description: string;
  metrics: {
    timeSpent?: number; // milliseconds
    linesOfCode?: number;
    issuesResolved?: number;
    qualityScore?: number; // 0-1 score
  };
  reviewStatus?: 'pending' | 'approved' | 'needs_improvements' | 'rejected';
  reviewedBy?: string; // Agent ID
  reviewedAt?: number;
  metadata: Record<string, any>;
}

/**
 * Agent contribution summary
 */
export interface AgentContributionSummary {
  agentId: string;
  taskId: string;
  totalContributions: number;
  contributionsByType: Record<string, number>;
  totalTimeSpent: number;
  effectivenessScore: number; // 0-1 score
  completedResponsibilities: number;
  pendingResponsibilities: number;
  metadata: Record<string, any>;
}

/**
 * Service that manages shared responsibilities for peer tasks
 */
export class SharedResponsibilityService {
  private readonly logger: Logger;
  private readonly collaborativeTaskService: CollaborativeTaskDefinitionService;
  private readonly hierarchicalTaskService: HierarchicalTaskService;
  private readonly config: SharedResponsibilityConfig;

  // In-memory store of responsibility assignments (in a real system, this would be persisted)
  private readonly responsibilityAssignments: Map<
    string,
    ResponsibilityAssignment
  > = new Map();
  private readonly contributionRecords: Map<string, ContributionRecord[]> =
    new Map();

  /**
   * Create a new shared responsibility service
   */
  constructor(
    collaborativeTaskService: CollaborativeTaskDefinitionService,
    hierarchicalTaskService: HierarchicalTaskService,
    options: {
      config?: SharedResponsibilityConfig;
      logger?: Logger;
    } = {},
  ) {
    this.collaborativeTaskService = collaborativeTaskService;
    this.hierarchicalTaskService = hierarchicalTaskService;
    this.logger = options.logger || new ConsoleLogger();

    // Set default configuration
    this.config = {
      defaultPrimaryPercentage: 60,
      defaultSecondaryPercentage: 30,
      defaultReviewerPercentage: 20,
      defaultConsultantPercentage: 15,
      defaultCoordinatorPercentage: 25,
      defaultObserverPercentage: 5,
      requireBalancedAllocation: true,
      maxConcurrentPrimaryResponsibilities: 3,
      maxResponsibilitiesPerAgent: 10,
      defaultDistributionStrategy: 'balanced',
      ...options.config,
    };
  }

  /**
   * Assign a responsibility to an agent
   */
  public async assignResponsibility(
    taskId: string,
    agentId: string,
    type: ResponsibilityType,
    description: string,
    percentage: number = this.getDefaultPercentageForType(type),
  ): Promise<ResponsibilityAssignment> {
    // Get the task to check if it exists
    const task = await this.hierarchicalTaskService.getTask(taskId);
    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    // Validate the assignment
    const validationResult = await this.validateAssignment(
      taskId,
      agentId,
      type,
      percentage,
    );
    if (!validationResult.valid) {
      throw new Error(
        `Invalid responsibility assignment: ${validationResult.errors.join(', ')}`,
      );
    }

    // Create the assignment
    const assignment = createResponsibilityAssignment(
      taskId,
      agentId,
      type,
      description,
      percentage,
    );

    // Store the assignment
    this.responsibilityAssignments.set(assignment.id, assignment);

    this.logger.info('Responsibility assigned', {
      responsibilityId: assignment.id,
      taskId,
      agentId,
      type,
      percentage,
    });

    // Initialize contribution records for this task/agent
    if (!this.contributionRecords.has(taskId)) {
      this.contributionRecords.set(taskId, []);
    }

    return assignment;
  }

  /**
   * Update an existing responsibility assignment
   */
  public async updateResponsibility(
    responsibilityId: string,
    updates: Partial<
      Omit<ResponsibilityAssignment, 'id' | 'taskId' | 'agentId' | 'assignedAt'>
    >,
  ): Promise<ResponsibilityAssignment> {
    const responsibility = this.responsibilityAssignments.get(responsibilityId);
    if (!responsibility) {
      throw new Error(`Responsibility with ID ${responsibilityId} not found`);
    }

    // Check if percentage is being updated
    if (updates.percentage !== undefined) {
      const validationResult = await this.validateAssignment(
        responsibility.taskId,
        responsibility.agentId,
        updates.type || responsibility.type,
        updates.percentage,
        responsibilityId,
      );

      if (!validationResult.valid) {
        throw new Error(
          `Invalid responsibility update: ${validationResult.errors.join(', ')}`,
        );
      }
    }

    // Apply updates
    const updatedAssignment = {
      ...responsibility,
      ...updates,
    };

    // Store updated assignment
    this.responsibilityAssignments.set(responsibilityId, updatedAssignment);

    this.logger.info('Responsibility updated', {
      responsibilityId,
      updates: Object.keys(updates).join(', '),
    });

    return updatedAssignment;
  }

  /**
   * Accept a responsibility assignment
   */
  public async acceptResponsibility(
    responsibilityId: string,
  ): Promise<ResponsibilityAssignment> {
    const responsibility = this.responsibilityAssignments.get(responsibilityId);
    if (!responsibility) {
      throw new Error(`Responsibility with ID ${responsibilityId} not found`);
    }

    const updatedAssignment = {
      ...responsibility,
      acceptedAt: Date.now(),
    };

    this.responsibilityAssignments.set(responsibilityId, updatedAssignment);

    this.logger.info('Responsibility accepted', {
      responsibilityId,
      agentId: responsibility.agentId,
    });

    return updatedAssignment;
  }

  /**
   * Complete a responsibility assignment
   */
  public async completeResponsibility(
    responsibilityId: string,
  ): Promise<ResponsibilityAssignment> {
    const responsibility = this.responsibilityAssignments.get(responsibilityId);
    if (!responsibility) {
      throw new Error(`Responsibility with ID ${responsibilityId} not found`);
    }

    // Check if the responsibility was accepted first
    if (!responsibility.acceptedAt) {
      throw new Error(
        `Responsibility with ID ${responsibilityId} must be accepted before completion`,
      );
    }

    const updatedAssignment = {
      ...responsibility,
      completedAt: Date.now(),
    };

    this.responsibilityAssignments.set(responsibilityId, updatedAssignment);

    this.logger.info('Responsibility completed', {
      responsibilityId,
      agentId: responsibility.agentId,
    });

    // Check if all responsibilities are completed for this task
    const taskResponsibilities = await this.getResponsibilities(
      responsibility.taskId,
    );
    const allCompleted = taskResponsibilities.every((r) => !!r.completedAt);

    if (allCompleted) {
      // Update task status if all responsibilities are completed
      await this.hierarchicalTaskService.updateTask(responsibility.taskId, {
        status: TaskStatus.COMPLETED,
      });

      this.logger.info(
        'All responsibilities completed, task marked as completed',
        {
          taskId: responsibility.taskId,
        },
      );
    }

    return updatedAssignment;
  }

  /**
   * Get all responsibilities for a task
   */
  public async getResponsibilities(
    taskId: string,
  ): Promise<ResponsibilityAssignment[]> {
    return Array.from(this.responsibilityAssignments.values()).filter(
      (r) => r.taskId === taskId,
    );
  }

  /**
   * Get all responsibilities for an agent
   */
  public async getAgentResponsibilities(
    agentId: string,
  ): Promise<ResponsibilityAssignment[]> {
    return Array.from(this.responsibilityAssignments.values()).filter(
      (r) => r.agentId === agentId,
    );
  }

  /**
   * Get a specific responsibility assignment
   */
  public async getResponsibility(
    responsibilityId: string,
  ): Promise<ResponsibilityAssignment | null> {
    return this.responsibilityAssignments.get(responsibilityId) || null;
  }

  /**
   * Validate a responsibility assignment
   */
  private async validateAssignment(
    taskId: string,
    agentId: string,
    type: ResponsibilityType,
    percentage: number,
    currentResponsibilityId?: string, // For updates
  ): Promise<ResponsibilityValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check percentage is in valid range
    if (percentage < 0 || percentage > 100) {
      errors.push(`Percentage must be between 0 and 100, got ${percentage}`);
    }

    // Check if task has collaborative flag
    const task = await this.hierarchicalTaskService.getTask(taskId);
    if (!task) {
      errors.push(`Task with ID ${taskId} not found`);
      return { valid: false, errors, warnings };
    }

    // Get existing responsibilities for this task
    const taskResponsibilities = await this.getResponsibilities(taskId);

    // Filter out the current responsibility if this is an update
    const otherResponsibilities = currentResponsibilityId
      ? taskResponsibilities.filter((r) => r.id !== currentResponsibilityId)
      : taskResponsibilities;

    // Check if agent already has this type of responsibility for this task
    const existingTypeAssignment = otherResponsibilities.find(
      (r) => r.agentId === agentId && r.type === type,
    );

    if (existingTypeAssignment) {
      errors.push(
        `Agent ${agentId} already has a ${type} responsibility for task ${taskId}`,
      );
    }

    // Check for balanced allocation if required
    if (this.config.requireBalancedAllocation) {
      let totalPercentage = percentage;

      // Sum percentages of other responsibilities for this task
      for (const r of otherResponsibilities) {
        if (r.agentId === agentId) {
          totalPercentage += r.percentage;
        }
      }

      if (totalPercentage > 100) {
        errors.push(
          `Total responsibility percentage for agent ${agentId} would exceed 100%`,
        );
      } else if (totalPercentage > 80) {
        warnings.push(
          `Agent ${agentId} would have ${totalPercentage}% responsibility allocation`,
        );
      }
    }

    // Check maximum number of primary responsibilities
    if (type === ResponsibilityType.PRIMARY) {
      const primaryCount = (
        await this.getAgentResponsibilities(agentId)
      ).filter(
        (r) => r.type === ResponsibilityType.PRIMARY && !r.completedAt,
      ).length;

      if (
        primaryCount >= (this.config.maxConcurrentPrimaryResponsibilities || 3)
      ) {
        errors.push(
          `Agent ${agentId} already has maximum number of primary responsibilities`,
        );
      }
    }

    // Check total number of responsibilities
    const totalResponsibilities = (
      await this.getAgentResponsibilities(agentId)
    ).filter((r) => !r.completedAt).length;

    if (
      totalResponsibilities >= (this.config.maxResponsibilitiesPerAgent || 10)
    ) {
      warnings.push(
        `Agent ${agentId} already has ${totalResponsibilities} active responsibilities`,
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get default percentage for a responsibility type
   */
  private getDefaultPercentageForType(type: ResponsibilityType): number {
    switch (type) {
      case ResponsibilityType.PRIMARY:
        return this.config.defaultPrimaryPercentage || 60;
      case ResponsibilityType.SECONDARY:
        return this.config.defaultSecondaryPercentage || 30;
      case ResponsibilityType.REVIEWER:
        return this.config.defaultReviewerPercentage || 20;
      case ResponsibilityType.CONSULTANT:
        return this.config.defaultConsultantPercentage || 15;
      case ResponsibilityType.COORDINATOR:
        return this.config.defaultCoordinatorPercentage || 25;
      case ResponsibilityType.OBSERVER:
        return this.config.defaultObserverPercentage || 5;
      default:
        return 10;
    }
  }

  /**
   * Recommend responsibility distribution for a task
   */
  public async recommendResponsibilityDistribution(
    taskId: string,
    agents: string[],
    strategy: 'balanced' | 'weighted' | 'expertise-based' = this.config
      .defaultDistributionStrategy || 'balanced',
  ): Promise<Map<string, ResponsibilityType[]>> {
    const task = await this.hierarchicalTaskService.getTask(taskId);
    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    const recommendations = new Map<string, ResponsibilityType[]>();

    // Simple implementation for now - in future, this would use LLM for sophisticated assignments
    switch (strategy) {
      case 'balanced':
        // Distribute responsibilities evenly
        for (let i = 0; i < agents.length; i++) {
          if (i === 0) {
            // First agent as primary
            recommendations.set(agents[i], [ResponsibilityType.PRIMARY]);
          } else if (i === 1 && agents.length > 2) {
            // Second agent as coordinator
            recommendations.set(agents[i], [ResponsibilityType.COORDINATOR]);
          } else if (i === agents.length - 1) {
            // Last agent as reviewer
            recommendations.set(agents[i], [ResponsibilityType.REVIEWER]);
          } else {
            // Others as secondary
            recommendations.set(agents[i], [ResponsibilityType.SECONDARY]);
          }
        }
        break;

      case 'weighted':
        // To be implemented - based on agent capabilities and history
        break;

      case 'expertise-based':
        // To be implemented - based on agent expertise matching task needs
        break;
    }

    this.logger.info('Generated responsibility recommendations', {
      taskId,
      strategy,
      agentCount: agents.length,
    });

    return recommendations;
  }

  /**
   * Automatically distribute responsibilities
   */
  public async autoDistributeResponsibilities(
    taskId: string,
    agents: string[],
    strategy: 'balanced' | 'weighted' | 'expertise-based' = this.config
      .defaultDistributionStrategy || 'balanced',
  ): Promise<ResponsibilityAssignment[]> {
    const recommendations = await this.recommendResponsibilityDistribution(
      taskId,
      agents,
      strategy,
    );
    const assignments: ResponsibilityAssignment[] = [];

    for (const [agentId, types] of recommendations.entries()) {
      for (const type of types) {
        try {
          const assignment = await this.assignResponsibility(
            taskId,
            agentId,
            type,
            `Auto-assigned ${type} responsibility`,
            this.getDefaultPercentageForType(type),
          );

          assignments.push(assignment);
        } catch (error) {
          this.logger.error('Error auto-assigning responsibility', {
            agentId,
            taskId,
            type,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return assignments;
  }

  /**
   * Record a contribution from an agent
   */
  public async recordContribution(
    taskId: string,
    agentId: string,
    responsibilityId: string,
    contributionType: ContributionRecord['contributionType'],
    description: string,
    metrics: ContributionRecord['metrics'] = {},
  ): Promise<ContributionRecord> {
    // Check if the responsibility exists
    const responsibility = this.responsibilityAssignments.get(responsibilityId);
    if (!responsibility) {
      throw new Error(`Responsibility with ID ${responsibilityId} not found`);
    }

    // Check if the responsibility belongs to the agent
    if (responsibility.agentId !== agentId) {
      throw new Error(
        `Responsibility with ID ${responsibilityId} does not belong to agent ${agentId}`,
      );
    }

    // Create the contribution record
    const contribution: ContributionRecord = {
      id: uuidv4(),
      taskId,
      agentId,
      responsibilityId,
      timestamp: Date.now(),
      contributionType,
      description,
      metrics,
      metadata: {},
    };

    // Store the contribution
    if (!this.contributionRecords.has(taskId)) {
      this.contributionRecords.set(taskId, []);
    }

    this.contributionRecords.get(taskId)!.push(contribution);

    this.logger.info('Contribution recorded', {
      contributionId: contribution.id,
      taskId,
      agentId,
      type: contributionType,
    });

    return contribution;
  }

  /**
   * Review a contribution
   */
  public async reviewContribution(
    contributionId: string,
    reviewerId: string,
    reviewStatus: 'approved' | 'needs_improvements' | 'rejected',
  ): Promise<ContributionRecord> {
    // Find the contribution
    for (const [taskId, contributions] of this.contributionRecords.entries()) {
      const contributionIndex = contributions.findIndex(
        (c) => c.id === contributionId,
      );

      if (contributionIndex >= 0) {
        const contribution = contributions[contributionIndex];

        // Check if the reviewer has a reviewer responsibility
        const reviewerResponsibilities = await this.getResponsibilities(taskId);
        const hasReviewerRole = reviewerResponsibilities.some(
          (r) =>
            r.agentId === reviewerId && r.type === ResponsibilityType.REVIEWER,
        );

        if (!hasReviewerRole) {
          throw new Error(
            `Agent ${reviewerId} does not have reviewer responsibility for task ${taskId}`,
          );
        }

        // Update the contribution
        const updatedContribution = {
          ...contribution,
          reviewStatus,
          reviewedBy: reviewerId,
          reviewedAt: Date.now(),
        };

        contributions[contributionIndex] = updatedContribution;

        this.logger.info('Contribution reviewed', {
          contributionId,
          reviewerId,
          status: reviewStatus,
        });

        return updatedContribution;
      }
    }

    throw new Error(`Contribution with ID ${contributionId} not found`);
  }

  /**
   * Get contribution summary for an agent on a task
   */
  public async getAgentContributionSummary(
    taskId: string,
    agentId: string,
  ): Promise<AgentContributionSummary> {
    const contributions = this.contributionRecords.get(taskId) || [];
    const agentContributions = contributions.filter(
      (c) => c.agentId === agentId,
    );

    // Count contributions by type
    const contributionsByType: Record<string, number> = {};
    for (const contribution of agentContributions) {
      contributionsByType[contribution.contributionType] =
        (contributionsByType[contribution.contributionType] || 0) + 1;
    }

    // Calculate total time spent
    const totalTimeSpent = agentContributions.reduce(
      (sum, c) => sum + (c.metrics.timeSpent || 0),
      0,
    );

    // Get responsibilities
    const responsibilities = await this.getResponsibilities(taskId);
    const agentResponsibilities = responsibilities.filter(
      (r) => r.agentId === agentId,
    );

    // Calculate summary
    const summary: AgentContributionSummary = {
      agentId,
      taskId,
      totalContributions: agentContributions.length,
      contributionsByType,
      totalTimeSpent,
      effectivenessScore: this.calculateEffectivenessScore(
        agentContributions,
        agentResponsibilities,
      ),
      completedResponsibilities: agentResponsibilities.filter(
        (r) => !!r.completedAt,
      ).length,
      pendingResponsibilities: agentResponsibilities.filter(
        (r) => !r.completedAt,
      ).length,
      metadata: {},
    };

    return summary;
  }

  /**
   * Calculate an effectiveness score based on contributions and responsibilities
   */
  private calculateEffectivenessScore(
    contributions: ContributionRecord[],
    responsibilities: ResponsibilityAssignment[],
  ): number {
    if (responsibilities.length === 0) {
      return 0;
    }

    // Simple scoring logic - could be much more sophisticated
    const completionRatio =
      responsibilities.filter((r) => !!r.completedAt).length /
      responsibilities.length;
    const approvedContributions = contributions.filter(
      (c) => c.reviewStatus === 'approved',
    ).length;
    const approvalRatio =
      contributions.length === 0
        ? 0
        : approvedContributions / contributions.length;

    return completionRatio * 0.6 + approvalRatio * 0.4;
  }

  /**
   * Get all contributions for a task
   */
  public async getTaskContributions(
    taskId: string,
  ): Promise<ContributionRecord[]> {
    return this.contributionRecords.get(taskId) || [];
  }

  /**
   * Get all contributions by an agent
   */
  public async getAgentContributions(
    agentId: string,
  ): Promise<ContributionRecord[]> {
    const allContributions: ContributionRecord[] = [];

    for (const contributions of this.contributionRecords.values()) {
      allContributions.push(
        ...contributions.filter((c) => c.agentId === agentId),
      );
    }

    return allContributions;
  }

  /**
   * Get progress status of responsibilities for a task
   */
  public async getTaskResponsibilityProgress(taskId: string): Promise<{
    total: number;
    accepted: number;
    completed: number;
    progressPercentage: number;
  }> {
    const responsibilities = await this.getResponsibilities(taskId);

    const total = responsibilities.length;
    const accepted = responsibilities.filter((r) => !!r.acceptedAt).length;
    const completed = responsibilities.filter((r) => !!r.completedAt).length;

    // Calculate weighted progress based on responsibility percentages
    let totalPercentage = 0;
    let completedPercentage = 0;

    for (const r of responsibilities) {
      totalPercentage += r.percentage;
      if (r.completedAt) {
        completedPercentage += r.percentage;
      }
    }

    const progressPercentage =
      totalPercentage === 0 ? 0 : (completedPercentage / totalPercentage) * 100;

    return {
      total,
      accepted,
      completed,
      progressPercentage,
    };
  }
}
