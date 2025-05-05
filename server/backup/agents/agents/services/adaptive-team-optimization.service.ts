/**
 * Adaptive Team Optimization Service
 *
 * Analyzes team performance, identifies optimization opportunities,
 * and implements adaptive improvements to team composition and role allocations.
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { EventEmitter } from 'events';
import {
  TeamPerformanceAnalysis,
  WorkloadDistribution,
  TeamOptimizationModel,
  TeamRoleEventType,
  TeamRoleEvent,
  RoleAdjustmentType,
} from '../interfaces/emergent-roles.interface';
import { RoleEmergenceService } from './role-emergence.service';

/**
 * Interface for a message bus to enable communication
 */
interface MessageBus {
  publish(topic: string, message: any): Promise<void>;
  subscribe(topic: string, handler: (message: any) => void): void;
}

/**
 * Event-based MessageBus implementation
 */
class EventMessageBus implements MessageBus {
  private emitter = new EventEmitter();

  async publish(topic: string, message: any): Promise<void> {
    this.emitter.emit(topic, message);
  }

  subscribe(topic: string, handler: (message: any) => void): void {
    this.emitter.on(topic, handler);
  }
}

/**
 * Service for adaptive team optimization
 *
 * @deprecated Previous team optimization services - use this adaptive approach instead
 */
export class AdaptiveTeamOptimizationService {
  private static instance: AdaptiveTeamOptimizationService;
  private logger: Logger;
  private roleEmergenceService: RoleEmergenceService;
  private eventEmitter: EventEmitter;
  private messageBus: MessageBus;

  // Storage
  private performanceAnalyses: Map<string, TeamPerformanceAnalysis> = new Map();
  private workloadDistributions: Map<string, WorkloadDistribution> = new Map();
  private optimizationModels: Map<string, TeamOptimizationModel> = new Map();

  // Optimization state
  private activeOptimizations: Map<
    string,
    {
      teamId: string;
      startedAt: number;
      status: 'in_progress' | 'completed' | 'failed';
      actions: {
        type: string;
        description: string;
        status: 'pending' | 'executed' | 'failed';
        timestamp: number;
      }[];
    }
  > = new Map();

  /**
   * Private constructor (singleton pattern)
   */
  private constructor(
    options: {
      logger?: Logger;
      roleEmergenceService?: RoleEmergenceService;
      messageBus?: MessageBus;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.roleEmergenceService =
      options.roleEmergenceService || RoleEmergenceService.getInstance();
    this.eventEmitter = new EventEmitter();
    this.messageBus = options.messageBus || new EventMessageBus();

    // Subscribe to relevant events
    this.messageBus.subscribe(
      'team.performance.updated',
      this.handlePerformanceUpdate.bind(this),
    );
    this.messageBus.subscribe(
      'team.workload.imbalance',
      this.handleWorkloadImbalance.bind(this),
    );
    this.messageBus.subscribe(
      'agent.role.transition.completed',
      this.handleRoleTransitionCompleted.bind(this),
    );

    this.logger.info('AdaptiveTeamOptimizationService initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(
    options: {
      logger?: Logger;
      roleEmergenceService?: RoleEmergenceService;
      messageBus?: MessageBus;
    } = {},
  ): AdaptiveTeamOptimizationService {
    if (!AdaptiveTeamOptimizationService.instance) {
      AdaptiveTeamOptimizationService.instance =
        new AdaptiveTeamOptimizationService(options);
    }
    return AdaptiveTeamOptimizationService.instance;
  }

  /**
   * Handle team performance updates
   */
  private async handlePerformanceUpdate(update: any): Promise<void> {
    try {
      if (!update.teamId || !update.metrics) {
        this.logger.warn('Received invalid performance update');
        return;
      }

      const teamId = update.teamId;
      const taskId = update.taskId;

      // Create or update performance analysis
      const analysisId = `${teamId}:${taskId}`;
      const existingAnalysis = this.performanceAnalyses.get(analysisId);

      const timestamp = Date.now();

      // Process metrics and create updated analysis
      const metrics = update.metrics;
      const overallScore = this.calculateOverallPerformance(metrics);

      const newAnalysis: TeamPerformanceAnalysis = {
        id: existingAnalysis?.id || uuidv4(),
        teamId,
        taskId,
        timestamp,
        overallPerformanceScore: overallScore,
        efficiency: metrics.efficiency || 0,
        qualityScore: metrics.quality || 0,
        collaborationScore: metrics.collaboration || 0,
        agentPerformance: update.agentPerformance || [],
        roleEffectiveness: update.roleEffectiveness || [],
        recommendations: [],
      };

      // Generate recommendations if performance is below threshold
      if (overallScore < 0.7) {
        newAnalysis.recommendations =
          await this.generateOptimizationRecommendations(newAnalysis);
      }

      // Store the analysis
      this.performanceAnalyses.set(analysisId, newAnalysis);

      // If recommendations exist and are high priority, initiate optimization
      const highPriorityRecs = newAnalysis.recommendations.filter(
        (r) => r.priority === 'high',
      );
      if (highPriorityRecs.length > 0) {
        await this.initiateTeamOptimization(teamId, taskId, newAnalysis);
      }

      this.logger.info(`Updated performance analysis for team ${teamId}`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error handling performance update: ${errorMessage}`);
    }
  }

  /**
   * Handle workload imbalance notifications
   */
  private async handleWorkloadImbalance(notification: any): Promise<void> {
    try {
      if (!notification.teamId || !notification.distribution) {
        this.logger.warn('Received invalid workload imbalance notification');
        return;
      }

      const teamId = notification.teamId;
      const taskId = notification.taskId;
      const timestamp = Date.now();

      // Calculate balance score (lower means more imbalanced)
      const distribution = notification.distribution;
      let balanceScore = 1.0; // Start with perfect balance

      // Simple algorithm: calculate standard deviation of workload percentages
      if (distribution.length > 1) {
        const mean =
          distribution.reduce(
            (sum: number, d: { workloadPercentage: number }) =>
              sum + d.workloadPercentage,
            0,
          ) / distribution.length;
        const variance =
          distribution.reduce(
            (sum: number, d: { workloadPercentage: number }) =>
              sum + Math.pow(d.workloadPercentage - mean, 2),
            0,
          ) / distribution.length;
        const stdDev = Math.sqrt(variance);

        // Convert to a score between 0 and 1 (0 = imbalanced, 1 = balanced)
        balanceScore = Math.max(0, 1 - stdDev * 2); // Scale stdDev to make smaller deviations more significant
      }

      // Create workload distribution record
      const workloadDistribution: WorkloadDistribution = {
        teamId,
        taskId,
        timestamp,
        distribution: notification.distribution,
        balanceScore,
        recommendations: [],
      };

      // Generate recommendations if imbalance is significant
      if (balanceScore < 0.7) {
        workloadDistribution.recommendations =
          this.generateWorkloadRecommendations(workloadDistribution);

        // Emit event for significant imbalance
        this.emitEvent({
          id: uuidv4(),
          type: TeamRoleEventType.WORKLOAD_IMBALANCE_DETECTED,
          timestamp,
          teamId,
          taskId,
          data: { workloadDistribution },
        });

        // Initiate optimization if severe imbalance
        if (balanceScore < 0.4) {
          await this.balanceTeamWorkload(teamId, taskId, workloadDistribution);
        }
      }

      // Store the workload distribution
      this.workloadDistributions.set(
        `${teamId}:${taskId}`,
        workloadDistribution,
      );

      this.logger.info(
        `Processed workload imbalance for team ${teamId} with balance score ${balanceScore.toFixed(2)}`,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error handling workload imbalance: ${errorMessage}`);
    }
  }

  /**
   * Handle role transition completion
   */
  private async handleRoleTransitionCompleted(event: any): Promise<void> {
    try {
      const { teamId, agentId, success } = event;

      if (!teamId || !agentId) {
        return;
      }

      // Check if this is part of an active optimization
      for (const [id, optimization] of this.activeOptimizations.entries()) {
        if (optimization.teamId === teamId) {
          // Find any pending role transition actions
          const pendingAction = optimization.actions.find(
            (a) =>
              a.type === 'role_transition' &&
              a.status === 'pending' &&
              a.description.includes(agentId),
          );

          if (pendingAction) {
            // Update action status
            pendingAction.status = success ? 'executed' : 'failed';
            pendingAction.timestamp = Date.now();

            // Check if all actions are completed
            const allCompleted = optimization.actions.every(
              (a) => a.status === 'executed' || a.status === 'failed',
            );

            if (allCompleted) {
              optimization.status = 'completed';

              // Notify completion
              await this.messageBus.publish('team.optimization.completed', {
                optimizationId: id,
                teamId,
                success: optimization.actions.every(
                  (a) => a.status === 'executed',
                ),
                timestamp: Date.now(),
              });

              this.logger.info(
                `Team optimization ${id} completed for team ${teamId}`,
              );
            }

            this.activeOptimizations.set(id, optimization);
            break;
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error handling role transition completion: ${errorMessage}`,
      );
    }
  }

  /**
   * Calculate overall performance score
   */
  private calculateOverallPerformance(metrics: Record<string, number>): number {
    // Default weights if not specified
    const weights: Record<string, number> = {
      efficiency: 0.3,
      quality: 0.4,
      collaboration: 0.3,
    };

    // Add any custom weights if provided
    if (metrics.weights && typeof metrics.weights === 'object') {
      Object.entries(metrics.weights).forEach(([key, value]) => {
        if (typeof value === 'number') {
          weights[key] = value;
        }
      });
    }

    let weightedSum = 0;
    let weightTotal = 0;

    if (metrics.efficiency !== undefined) {
      weightedSum += metrics.efficiency * weights.efficiency;
      weightTotal += weights.efficiency;
    }

    if (metrics.quality !== undefined) {
      weightedSum += metrics.quality * weights.quality;
      weightTotal += weights.quality;
    }

    if (metrics.collaboration !== undefined) {
      weightedSum += metrics.collaboration * weights.collaboration;
      weightTotal += weights.collaboration;
    }

    // Handle any additional metrics with default weight of 0.1
    for (const [key, value] of Object.entries(metrics)) {
      if (
        key !== 'efficiency' &&
        key !== 'quality' &&
        key !== 'collaboration' &&
        key !== 'weights' &&
        typeof value === 'number'
      ) {
        const weight = weights[key] || 0.1;
        weightedSum += value * weight;
        weightTotal += weight;
      }
    }

    return weightTotal > 0 ? weightedSum / weightTotal : 0.5;
  }

  /**
   * Generate optimization recommendations based on performance analysis
   */
  private async generateOptimizationRecommendations(
    analysis: TeamPerformanceAnalysis,
  ): Promise<TeamPerformanceAnalysis['recommendations']> {
    const recommendations: TeamPerformanceAnalysis['recommendations'] = [];

    // Check for low-performing agents
    const lowPerformingAgents = analysis.agentPerformance.filter(
      (ap) => ap.performanceScore < 0.6,
    );

    // Check for ineffective roles
    const ineffectiveRoles = analysis.roleEffectiveness.filter(
      (re) => re.effectivenessScore < 0.6,
    );

    // Generate recommendations

    // 1. Role adjustments for low-performing agents
    for (const agent of lowPerformingAgents) {
      recommendations.push({
        type: 'role_adjustment',
        description: `Consider reassigning agent ${agent.agentId} to better match their capabilities`,
        priority: agent.performanceScore < 0.4 ? 'high' : 'medium',
        expectedImpact: 0.8,
      });
    }

    // 2. Process improvements for ineffective roles
    for (const role of ineffectiveRoles) {
      recommendations.push({
        type: 'process_improvement',
        description: `Redefine responsibilities for role ${role.roleId} to increase effectiveness`,
        priority: role.effectivenessScore < 0.4 ? 'high' : 'medium',
        expectedImpact: 0.7,
      });
    }

    // 3. Team composition adjustment if overall performance is very low
    if (analysis.overallPerformanceScore < 0.5) {
      recommendations.push({
        type: 'team_composition',
        description:
          'Consider restructuring team with different skill set distribution',
        priority: 'high',
        expectedImpact: 0.9,
      });
    }

    return recommendations;
  }

  /**
   * Generate workload balancing recommendations
   */
  private generateWorkloadRecommendations(
    workload: WorkloadDistribution,
  ): WorkloadDistribution['recommendations'] {
    const recommendations: WorkloadDistribution['recommendations'] = [];

    // Find overloaded and underloaded agents
    const overloadedAgents = workload.distribution.filter(
      (d) => d.workloadPercentage > 0.75, // More than 75% workload is overloaded
    );

    const underloadedAgents = workload.distribution.filter(
      (d) => d.workloadPercentage < 0.4, // Less than 40% workload is underloaded
    );

    // Generate recommendations
    for (const agent of overloadedAgents) {
      recommendations.push({
        targetAgentId: agent.agentId,
        suggestedAction: 'decrease',
        rationale: `Agent is overloaded with ${(agent.workloadPercentage * 100).toFixed(0)}% of capacity`,
      });
    }

    for (const agent of underloadedAgents) {
      recommendations.push({
        targetAgentId: agent.agentId,
        suggestedAction: 'increase',
        rationale: `Agent is underutilized at ${(agent.workloadPercentage * 100).toFixed(0)}% of capacity`,
      });
    }

    return recommendations;
  }

  /**
   * Initiate team optimization based on performance analysis
   */
  private async initiateTeamOptimization(
    teamId: string,
    taskId: string,
    analysis: TeamPerformanceAnalysis,
  ): Promise<void> {
    try {
      const timestamp = Date.now();
      const optimizationId = uuidv4();

      this.logger.info(`Initiating team optimization for team ${teamId}`);

      // Create actions based on recommendations
      const actions: {
        type: string;
        description: string;
        status: 'pending' | 'executed' | 'failed';
        timestamp: number;
      }[] = [];

      // Process recommendations
      for (const rec of analysis.recommendations) {
        if (rec.type === 'role_adjustment' && rec.priority === 'high') {
          // Extract agent ID from description - in real implementation, this would be more structured
          const agentIdMatch = rec.description.match(/agent\s+([a-zA-Z0-9-]+)/);
          const agentId = agentIdMatch ? agentIdMatch[1] : null;

          if (agentId) {
            const currentRole = this.roleEmergenceService.getAgentRoleInTeam(
              agentId,
              teamId,
            );

            if (currentRole) {
              const agentPerf = analysis.agentPerformance.find(
                (ap) => ap.agentId === agentId,
              );

              if (
                agentPerf &&
                agentPerf.improvementAreas &&
                agentPerf.improvementAreas.length > 0
              ) {
                // Find a more suitable role for this agent
                actions.push({
                  type: 'role_transition',
                  description: `Initiate role transition for agent ${agentId} to better match capabilities`,
                  status: 'pending',
                  timestamp,
                });
              }
            }
          }
        }

        if (rec.type === 'team_composition' && rec.priority === 'high') {
          actions.push({
            type: 'team_restructure',
            description:
              'Plan team restructuring to optimize overall performance',
            status: 'pending',
            timestamp,
          });
        }
      }

      // Store the optimization plan
      this.activeOptimizations.set(optimizationId, {
        teamId,
        startedAt: timestamp,
        status: 'in_progress',
        actions,
      });

      // Emit event
      this.emitEvent({
        id: uuidv4(),
        type: TeamRoleEventType.TEAM_OPTIMIZATION_APPLIED,
        timestamp,
        teamId,
        taskId,
        data: {
          optimizationId,
          recommendations: analysis.recommendations.filter(
            (r) => r.priority === 'high',
          ),
        },
      });

      // Execute the optimization actions
      for (const action of actions) {
        await this.executeOptimizationAction(
          optimizationId,
          teamId,
          taskId,
          action,
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error initiating team optimization: ${errorMessage}`);
    }
  }

  /**
   * Balance team workload
   */
  private async balanceTeamWorkload(
    teamId: string,
    taskId: string,
    workload: WorkloadDistribution,
  ): Promise<void> {
    try {
      const timestamp = Date.now();
      const optimizationId = uuidv4();

      this.logger.info(`Initiating workload balancing for team ${teamId}`);

      // Create actions based on workload recommendations
      const actions: {
        type: string;
        description: string;
        status: 'pending' | 'executed' | 'failed';
        timestamp: number;
      }[] = [];

      // Find agents to redistribute work from/to
      const overloadedAgents = workload.distribution
        .filter((d) => d.workloadPercentage > 0.75)
        .sort((a, b) => b.workloadPercentage - a.workloadPercentage);

      const underloadedAgents = workload.distribution
        .filter((d) => d.workloadPercentage < 0.4)
        .sort((a, b) => a.workloadPercentage - b.workloadPercentage);

      // Create rebalancing actions
      if (overloadedAgents.length > 0 && underloadedAgents.length > 0) {
        actions.push({
          type: 'workload_transfer',
          description: `Transfer responsibilities from agent ${overloadedAgents[0].agentId} to agent ${underloadedAgents[0].agentId}`,
          status: 'pending',
          timestamp,
        });
      }

      // Store the optimization plan
      this.activeOptimizations.set(optimizationId, {
        teamId,
        startedAt: timestamp,
        status: 'in_progress',
        actions,
      });

      // Emit event
      this.emitEvent({
        id: uuidv4(),
        type: TeamRoleEventType.WORKLOAD_IMBALANCE_DETECTED,
        timestamp,
        teamId,
        taskId,
        data: {
          optimizationId,
          balanceScore: workload.balanceScore,
          recommendations: workload.recommendations,
        },
      });

      // Execute the optimization actions
      for (const action of actions) {
        await this.executeOptimizationAction(
          optimizationId,
          teamId,
          taskId,
          action,
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error balancing team workload: ${errorMessage}`);
    }
  }

  /**
   * Execute a specific optimization action
   */
  private async executeOptimizationAction(
    optimizationId: string,
    teamId: string,
    taskId: string,
    action: {
      type: string;
      description: string;
      status: 'pending' | 'executed' | 'failed';
      timestamp: number;
    },
  ): Promise<void> {
    try {
      // Handle different action types
      if (action.type === 'role_transition') {
        // Extract agent ID from description
        const agentIdMatch = action.description.match(
          /agent\s+([a-zA-Z0-9-]+)/,
        );
        const agentId = agentIdMatch ? agentIdMatch[1] : null;

        if (agentId) {
          const currentRole = this.roleEmergenceService.getAgentRoleInTeam(
            agentId,
            teamId,
          );

          if (currentRole) {
            // In a real implementation, we would find the most suitable new role
            // For now, we'll simply record that the action was executed
            await this.messageBus.publish('team.optimization.action', {
              optimizationId,
              teamId,
              taskId,
              actionType: action.type,
              status: 'executed',
              details: {
                agentId,
                currentRoleId: currentRole.roleId,
              },
              timestamp: Date.now(),
            });

            action.status = 'executed';
            action.timestamp = Date.now();
          }
        }
      } else if (action.type === 'workload_transfer') {
        // Extract agent IDs from description
        const match = action.description.match(
          /from agent\s+([a-zA-Z0-9-]+) to agent\s+([a-zA-Z0-9-]+)/,
        );
        const fromAgentId = match ? match[1] : null;
        const toAgentId = match ? match[2] : null;

        if (fromAgentId && toAgentId) {
          // In a real implementation, we would identify specific tasks to transfer
          // and execute the transfer
          await this.messageBus.publish('team.optimization.action', {
            optimizationId,
            teamId,
            taskId,
            actionType: action.type,
            status: 'executed',
            details: {
              fromAgentId,
              toAgentId,
            },
            timestamp: Date.now(),
          });

          action.status = 'executed';
          action.timestamp = Date.now();
        }
      }

      // Update the optimization record
      const optimization = this.activeOptimizations.get(optimizationId);
      if (optimization) {
        const actionIndex = optimization.actions.findIndex(
          (a) => a.type === action.type && a.description === action.description,
        );

        if (actionIndex >= 0) {
          optimization.actions[actionIndex] = action;
          this.activeOptimizations.set(optimizationId, optimization);
        }
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error executing optimization action: ${errorMessage}`);

      // Mark action as failed
      action.status = 'failed';
      action.timestamp = Date.now();

      const optimization = this.activeOptimizations.get(optimizationId);
      if (optimization) {
        const actionIndex = optimization.actions.findIndex(
          (a) => a.type === action.type && a.description === action.description,
        );

        if (actionIndex >= 0) {
          optimization.actions[actionIndex] = action;
          this.activeOptimizations.set(optimizationId, optimization);
        }
      }
    }
  }

  /**
   * Create an optimization model for a team
   */
  public async createTeamOptimizationModel(
    teamId: string,
    optimizationFactors: TeamOptimizationModel['optimizationFactors'],
  ): Promise<TeamOptimizationModel> {
    const timestamp = Date.now();
    const modelId = uuidv4();

    const model: TeamOptimizationModel = {
      id: modelId,
      teamId,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      optimizationFactors,
      roleDistributionPatterns: [],
      adaptationRules: [],
      confidenceScore: 0.5, // Initial confidence
      trainingData: {
        dataPoints: 0,
        lastTrainedAt: timestamp,
        performanceImprovement: 0,
      },
    };

    // Store the model
    this.optimizationModels.set(modelId, model);

    this.logger.info(`Created team optimization model for team ${teamId}`);
    return model;
  }

  /**
   * Emit a team role event
   */
  private emitEvent(event: TeamRoleEvent): void {
    this.eventEmitter.emit('team_role_event', event);
  }

  /**
   * Subscribe to team role events
   */
  public subscribeToEvents(
    callback: (event: TeamRoleEvent) => void,
    eventTypes?: TeamRoleEventType[],
  ): string {
    const subscriptionId = uuidv4();

    const listener = (event: TeamRoleEvent) => {
      if (!eventTypes || eventTypes.includes(event.type)) {
        callback(event);
      }
    };

    this.eventEmitter.on('team_role_event', listener);

    return subscriptionId;
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    this.eventEmitter.removeAllListeners('team_role_event');
    this.performanceAnalyses.clear();
    this.workloadDistributions.clear();
    this.optimizationModels.clear();
    this.activeOptimizations.clear();

    this.logger.info('AdaptiveTeamOptimizationService resources cleaned up');
  }

  /**
   * Reset the singleton instance (for testing purposes)
   */
  public static resetInstance(): void {
    if (AdaptiveTeamOptimizationService.instance) {
      AdaptiveTeamOptimizationService.instance.cleanup();
      AdaptiveTeamOptimizationService.instance = undefined as any;
    }
  }
}
