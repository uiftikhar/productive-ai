/**
 * Role Emergence Service
 *
 * Implements dynamic role discovery, assignment and transitions
 * for adaptive team collaboration.
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { AgentRegistryService } from './agent-registry.service';
import { EventEmitter } from 'events';
import {
  EmergentRole,
  AgentRoleAssignment,
  RoleTransition,
  RoleEmergencePattern,
  RoleAdjustmentType,
  TeamRoleEventType,
  TeamRoleEvent,
  RolePattern,
} from '../interfaces/emergent-roles.interface';
import { BaseAgentInterface } from '../interfaces/base-agent.interface';
import {
  CapabilityAdvertisement,
  TeamContract,
} from '../interfaces/recruitment-protocol.interface';

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
 * Core service for dynamic role assignment and emergence
 */
export class RoleEmergenceService {
  private static instance: RoleEmergenceService;
  private logger: Logger;
  private agentRegistry: AgentRegistryService;
  private eventEmitter: EventEmitter;
  private messageBus: MessageBus;

  // Storage
  private emergentRoles: Map<string, EmergentRole> = new Map();
  private roleAssignments: Map<string, AgentRoleAssignment> = new Map();
  private roleTransitions: Map<string, RoleTransition> = new Map();
  private rolePatterns: Map<string, RolePattern> = new Map();

  // Tracking relationships
  private teamRoles: Map<string, Set<string>> = new Map(); // teamId -> roleIds
  private agentRoles: Map<string, Set<string>> = new Map(); // agentId -> assignmentIds
  private taskRoles: Map<string, Set<string>> = new Map(); // taskId -> roleIds

  /**
   * Private constructor (singleton pattern)
   */
  private constructor(
    options: {
      logger?: Logger;
      agentRegistry?: AgentRegistryService;
      messageBus?: MessageBus;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.agentRegistry =
      options.agentRegistry || AgentRegistryService.getInstance();
    this.eventEmitter = new EventEmitter();
    this.messageBus = options.messageBus || new EventMessageBus();

    // Subscribe to relevant events
    this.messageBus.subscribe(
      'agent.capability.advertised',
      this.handleCapabilityAdvertisement.bind(this),
    );
    this.messageBus.subscribe(
      'agent.team.contract.created',
      this.handleTeamContractCreated.bind(this),
    );

    this.logger.info('RoleEmergenceService initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(
    options: {
      logger?: Logger;
      agentRegistry?: AgentRegistryService;
      messageBus?: MessageBus;
    } = {},
  ): RoleEmergenceService {
    if (!RoleEmergenceService.instance) {
      RoleEmergenceService.instance = new RoleEmergenceService(options);
    }
    return RoleEmergenceService.instance;
  }

  /**
   * Handle capability advertisement from an agent
   */
  private async handleCapabilityAdvertisement(
    advertisement: CapabilityAdvertisement,
  ): Promise<void> {
    try {
      // Analyze capabilities to detect potential role patterns
      const capabilityNames = advertisement.capabilities.map((cap) => cap.name);

      // Find potential matches in existing role patterns
      const matchingPatterns = Array.from(this.rolePatterns.values()).filter(
        (pattern) => {
          const matchCount = pattern.capabilityRequirements.filter((req) =>
            capabilityNames.includes(req),
          ).length;
          return matchCount / pattern.capabilityRequirements.length > 0.7; // 70% match threshold
        },
      );

      // If matching patterns found, notify for potential role assignment
      if (matchingPatterns.length > 0) {
        this.logger.info(
          `Found ${matchingPatterns.length} potential role matches for agent ${advertisement.agentId}`,
        );

        // For each match, evaluate fitness
        for (const pattern of matchingPatterns) {
          const averageConfidence =
            advertisement.capabilities
              .filter((cap) =>
                pattern.capabilityRequirements.includes(cap.name),
              )
              .reduce((sum, cap) => sum + cap.confidenceScore, 0) /
            pattern.capabilityRequirements.length;

          // If confidence is high enough, suggest this role
          if (averageConfidence > 0.75) {
            // Find or create role based on pattern
            const existingRoles = Array.from(
              this.emergentRoles.values(),
            ).filter((role) =>
              role.requiredCapabilities.every((cap) =>
                pattern.capabilityRequirements.includes(cap),
              ),
            );

            if (existingRoles.length > 0) {
              this.logger.info(
                `Suggesting existing role ${existingRoles[0].name} for agent ${advertisement.agentId}`,
              );
              await this.messageBus.publish('agent.role.suggestion', {
                agentId: advertisement.agentId,
                roleId: existingRoles[0].id,
                matchScore: averageConfidence,
                timestamp: Date.now(),
              });
            }
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error handling capability advertisement: ${errorMessage}`,
      );
    }
  }

  /**
   * Handle team contract creation to initialize role discovery
   */
  private async handleTeamContractCreated(
    contract: TeamContract,
  ): Promise<void> {
    try {
      const teamId = contract.teamId || '';
      const taskId = contract.taskId;

      // Extract roles from contract participants
      for (const participant of contract.participants) {
        // Check if an explicit role is defined
        if (participant.role) {
          // Look for existing pattern or role that matches
          const matchingRoles = Array.from(this.emergentRoles.values()).filter(
            (role) =>
              role.name.toLowerCase() === participant.role.toLowerCase(),
          );

          if (matchingRoles.length > 0) {
            // Assign existing role
            await this.assignRoleToAgent(
              participant.agentId,
              matchingRoles[0].id,
              teamId,
              taskId,
            );
          } else {
            // Create new emergent role from contract definition
            const role = await this.createEmergentRole({
              name: participant.role,
              description: `Role based on contract for ${contract.name}`,
              responsibilities: participant.responsibilities,
              requiredCapabilities: participant.requiredCapabilities,
              pattern: RoleEmergencePattern.CAPABILITY_BASED,
              contextFactors: {
                teamSize: contract.participants.length,
                taskType: 'contract_defined',
              },
            });

            // Assign the new role
            await this.assignRoleToAgent(
              participant.agentId,
              role.id,
              teamId,
              taskId,
            );
          }
        }
      }

      // Initialize role pattern discovery for this team
      this.initializeRolePatternDiscovery(teamId, taskId);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error handling team contract creation: ${errorMessage}`,
      );
    }
  }

  /**
   * Initialize role pattern discovery for a team
   */
  private async initializeRolePatternDiscovery(
    teamId: string,
    taskId: string,
  ): Promise<void> {
    // Start monitoring agent interactions to discover emergent roles
    await this.messageBus.publish('role.discovery.initiated', {
      teamId,
      taskId,
      timestamp: Date.now(),
      monitoringConfig: {
        interactionThreshold: 5,
        analysisFrequency: 3600000, // 1 hour
        patternTypes: Object.values(RoleEmergencePattern),
      },
    });

    this.logger.info(`Role pattern discovery initiated for team ${teamId}`);
  }

  /**
   * Create a new emergent role
   */
  public async createEmergentRole(params: {
    name: string;
    description: string;
    responsibilities: string[];
    requiredCapabilities: string[];
    pattern: RoleEmergencePattern;
    contextFactors?: {
      teamSize?: number;
      taskType?: string;
      complexityLevel?: number;
    };
  }): Promise<EmergentRole> {
    const timestamp = Date.now();
    const roleId = uuidv4();

    const role: EmergentRole = {
      id: roleId,
      name: params.name,
      description: params.description,
      responsibilities: params.responsibilities,
      requiredCapabilities: params.requiredCapabilities,
      createdAt: timestamp,
      updatedAt: timestamp,
      discoveryPattern: params.pattern,
      contextualFactors: {
        taskType: params.contextFactors?.taskType,
        teamSize: params.contextFactors?.teamSize,
        complexityLevel: params.contextFactors?.complexityLevel,
      },
    };

    // Store the role
    this.emergentRoles.set(roleId, role);

    // Emit event
    this.emitEvent({
      id: uuidv4(),
      type: TeamRoleEventType.ROLE_DISCOVERED,
      timestamp,
      teamId: '', // Not specific to a team at creation
      taskId: '', // Not specific to a task at creation
      roleId,
      data: { role },
    });

    this.logger.info(`Created emergent role: ${role.name} (${roleId})`);
    return role;
  }

  /**
   * Assign a role to an agent
   */
  public async assignRoleToAgent(
    agentId: string,
    roleId: string,
    teamId: string,
    taskId: string,
    matchScore?: number,
  ): Promise<AgentRoleAssignment | null> {
    try {
      const role = this.emergentRoles.get(roleId);
      const agent = this.agentRegistry.getAgent(agentId);

      if (!role) {
        throw new Error(`Role with ID ${roleId} not found`);
      }

      if (!agent) {
        throw new Error(`Agent with ID ${agentId} not found`);
      }

      const timestamp = Date.now();
      const assignmentId = uuidv4();

      // Calculate match score if not provided
      let calculatedMatchScore = matchScore;
      if (calculatedMatchScore === undefined) {
        calculatedMatchScore = await this.calculateRoleMatch(agent, role);
      }

      // Get agent's confidence in this role
      const confidenceScore = await this.getAgentRoleConfidence(agent, role);

      const assignment: AgentRoleAssignment = {
        id: assignmentId,
        agentId,
        roleId,
        teamId,
        taskId,
        assignedAt: timestamp,
        updatedAt: timestamp,
        matchScore: calculatedMatchScore,
        confidenceScore,
        status: 'active',
      };

      // Store the assignment
      this.roleAssignments.set(assignmentId, assignment);

      // Update tracking relationships
      this.trackRoleAssignment(assignment);

      // Emit event
      this.emitEvent({
        id: uuidv4(),
        type: TeamRoleEventType.ROLE_ASSIGNED,
        timestamp,
        teamId,
        taskId,
        agentId,
        roleId,
        data: { assignment },
      });

      // Notify agent of role assignment
      await this.messageBus.publish('agent.role.assigned', {
        agentId,
        roleId,
        roleName: role.name,
        responsibilities: role.responsibilities,
        teamId,
        taskId,
        timestamp,
      });

      this.logger.info(
        `Assigned role ${role.name} to agent ${agentId} in team ${teamId}`,
      );
      return assignment;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error assigning role: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Calculate how well an agent matches a role
   */
  private async calculateRoleMatch(
    agent: BaseAgentInterface,
    role: EmergentRole,
  ): Promise<number> {
    // Get agent capabilities
    const capabilities = agent.getCapabilities();

    // Calculate match based on required capabilities
    const matchingCapabilities = capabilities.filter((capability) =>
      role.requiredCapabilities.includes(capability.name),
    );

    const capabilityMatchScore =
      matchingCapabilities.length /
      Math.max(role.requiredCapabilities.length, 1);

    // Add confidence adjustment
    let confidenceAdjustment = 0;
    for (const capability of matchingCapabilities) {
      const confidence = await agent.getConfidence(capability.name);
      confidenceAdjustment += this.confidenceLevelToScore(confidence);
    }

    confidenceAdjustment =
      confidenceAdjustment / Math.max(matchingCapabilities.length, 1);

    // Calculate final score (70% capability match, 30% confidence)
    const finalScore = capabilityMatchScore * 0.7 + confidenceAdjustment * 0.3;

    return Math.min(Math.max(finalScore, 0), 1); // Ensure between 0 and 1
  }

  /**
   * Get agent's confidence for a role
   */
  private async getAgentRoleConfidence(
    agent: BaseAgentInterface,
    role: EmergentRole,
  ): Promise<number> {
    // Ask agent for self-assessment on this role
    try {
      const assessmentResponse = await agent.assessCapability({
        capability: `role:${role.name}`,
        context: {
          roleDescription: role.description,
          responsibilities: role.responsibilities,
          requiredCapabilities: role.requiredCapabilities,
        },
      });

      // Extract confidence from assessment response
      const confidence =
        assessmentResponse.confidence ||
        assessmentResponse.confidenceLevel ||
        0.7; // Default if not found

      return typeof confidence === 'number'
        ? confidence
        : this.confidenceLevelToScore(confidence);
    } catch (error) {
      // Fallback to average confidence across required capabilities
      let totalConfidence = 0;
      let count = 0;

      for (const capability of role.requiredCapabilities) {
        try {
          const confidence = await agent.getConfidence(capability);
          totalConfidence += this.confidenceLevelToScore(confidence);
          count++;
        } catch (error) {
          // Skip capabilities that couldn't be assessed
        }
      }

      return count > 0 ? totalConfidence / count : 0.5; // Default to 0.5 if no assessment
    }
  }

  /**
   * Convert confidence level to number
   */
  private confidenceLevelToScore(confidence: any): number {
    const confidenceMap: Record<string, number> = {
      expert: 1.0,
      proficient: 0.8,
      competent: 0.6,
      novice: 0.3,
    };

    if (typeof confidence === 'number') {
      return confidence;
    } else if (typeof confidence === 'string' && confidence in confidenceMap) {
      return confidenceMap[confidence];
    }

    return 0.5; // Default value
  }

  /**
   * Track a role assignment in the relationship maps
   */
  private trackRoleAssignment(assignment: AgentRoleAssignment): void {
    // Track by team
    let teamRoles = this.teamRoles.get(assignment.teamId);
    if (!teamRoles) {
      teamRoles = new Set<string>();
      this.teamRoles.set(assignment.teamId, teamRoles);
    }
    teamRoles.add(assignment.roleId);

    // Track by agent
    let agentAssignments = this.agentRoles.get(assignment.agentId);
    if (!agentAssignments) {
      agentAssignments = new Set<string>();
      this.agentRoles.set(assignment.agentId, agentAssignments);
    }
    agentAssignments.add(assignment.id);

    // Track by task
    let taskRoles = this.taskRoles.get(assignment.taskId);
    if (!taskRoles) {
      taskRoles = new Set<string>();
      this.taskRoles.set(assignment.taskId, taskRoles);
    }
    taskRoles.add(assignment.roleId);
  }

  /**
   * Initiate a role transition for an agent
   */
  public async initiateRoleTransition(
    agentId: string,
    currentRoleAssignmentId: string,
    newRoleId: string,
    reason: string,
    adjustmentType: RoleAdjustmentType,
  ): Promise<RoleTransition | null> {
    try {
      const currentAssignment = this.roleAssignments.get(
        currentRoleAssignmentId,
      );
      const newRole = this.emergentRoles.get(newRoleId);

      if (!currentAssignment || !newRole) {
        throw new Error('Current assignment or new role not found');
      }

      if (currentAssignment.agentId !== agentId) {
        throw new Error('Current role not assigned to specified agent');
      }

      const timestamp = Date.now();
      const transitionId = uuidv4();

      // Create transition record
      const transition: RoleTransition = {
        id: transitionId,
        agentId,
        teamId: currentAssignment.teamId,
        taskId: currentAssignment.taskId,
        previousRoleId: currentAssignment.roleId,
        newRoleId,
        initiatedAt: timestamp,
        reason,
        adjustmentType,
        knowledgeTransfer: {
          required: adjustmentType === RoleAdjustmentType.TRANSITION,
          completionStatus: 'pending',
        },
        status: 'pending',
      };

      // Store the transition
      this.roleTransitions.set(transitionId, transition);

      // Update current assignment status
      currentAssignment.status = 'transitioning';
      currentAssignment.updatedAt = timestamp;
      this.roleAssignments.set(currentAssignment.id, currentAssignment);

      // Emit event
      this.emitEvent({
        id: uuidv4(),
        type: TeamRoleEventType.ROLE_TRANSITION_INITIATED,
        timestamp,
        teamId: currentAssignment.teamId,
        taskId: currentAssignment.taskId,
        agentId,
        roleId: newRoleId,
        data: { transition },
      });

      // Notify agent of transition
      await this.messageBus.publish('agent.role.transition.initiated', {
        agentId,
        previousRoleId: currentAssignment.roleId,
        newRoleId,
        transitionId,
        reason,
        timestamp,
      });

      this.logger.info(
        `Initiated role transition for agent ${agentId} from ${currentAssignment.roleId} to ${newRoleId}`,
      );
      return transition;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error initiating role transition: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Complete a role transition
   */
  public async completeRoleTransition(
    transitionId: string,
    success: boolean = true,
  ): Promise<boolean> {
    try {
      const transition = this.roleTransitions.get(transitionId);

      if (!transition) {
        throw new Error(`Transition with ID ${transitionId} not found`);
      }

      if (
        transition.status !== 'pending' &&
        transition.status !== 'in_progress'
      ) {
        throw new Error(
          `Transition ${transitionId} is already ${transition.status}`,
        );
      }

      const timestamp = Date.now();

      // Update transition
      transition.completedAt = timestamp;
      transition.status = success ? 'completed' : 'cancelled';
      this.roleTransitions.set(transitionId, transition);

      if (success) {
        // Get current assignments for agent
        const agentAssignmentIds =
          this.agentRoles.get(transition.agentId) || new Set<string>();

        // Find the assignment for the previous role
        const previousAssignment = Array.from(agentAssignmentIds)
          .map((id) => this.roleAssignments.get(id))
          .find(
            (assignment) =>
              assignment?.roleId === transition.previousRoleId &&
              assignment?.teamId === transition.teamId,
          );

        if (previousAssignment) {
          // Mark previous assignment as completed
          previousAssignment.status = 'completed';
          previousAssignment.updatedAt = timestamp;
          this.roleAssignments.set(previousAssignment.id, previousAssignment);
        }

        // Create new role assignment
        await this.assignRoleToAgent(
          transition.agentId,
          transition.newRoleId,
          transition.teamId,
          transition.taskId,
        );
      } else {
        // If transition failed, revert previous assignment status
        const agentAssignmentIds =
          this.agentRoles.get(transition.agentId) || new Set<string>();

        const previousAssignment = Array.from(agentAssignmentIds)
          .map((id) => this.roleAssignments.get(id))
          .find(
            (assignment) =>
              assignment?.roleId === transition.previousRoleId &&
              assignment?.teamId === transition.teamId,
          );

        if (previousAssignment) {
          previousAssignment.status = 'active';
          previousAssignment.updatedAt = timestamp;
          this.roleAssignments.set(previousAssignment.id, previousAssignment);
        }
      }

      // Emit event
      this.emitEvent({
        id: uuidv4(),
        type: TeamRoleEventType.ROLE_TRANSITION_COMPLETED,
        timestamp,
        teamId: transition.teamId,
        taskId: transition.taskId,
        agentId: transition.agentId,
        roleId: transition.newRoleId,
        data: {
          transition,
          success,
        },
      });

      // Notify agent of completed transition
      await this.messageBus.publish('agent.role.transition.completed', {
        agentId: transition.agentId,
        previousRoleId: transition.previousRoleId,
        newRoleId: transition.newRoleId,
        transitionId,
        success,
        timestamp,
      });

      this.logger.info(
        `Completed role transition ${transitionId} with status: ${success ? 'success' : 'cancelled'}`,
      );
      return true;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error completing role transition: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Get all roles for a team
   */
  public getTeamRoles(teamId: string): EmergentRole[] {
    const roleIds = this.teamRoles.get(teamId) || new Set<string>();
    return Array.from(roleIds)
      .map((id) => this.emergentRoles.get(id))
      .filter((role) => role !== undefined) as EmergentRole[];
  }

  /**
   * Get all role assignments for an agent
   */
  public getAgentRoleAssignments(agentId: string): AgentRoleAssignment[] {
    const assignmentIds = this.agentRoles.get(agentId) || new Set<string>();
    return Array.from(assignmentIds)
      .map((id) => this.roleAssignments.get(id))
      .filter(
        (assignment) => assignment !== undefined,
      ) as AgentRoleAssignment[];
  }

  /**
   * Get active role assignment for an agent in a team
   */
  public getAgentRoleInTeam(
    agentId: string,
    teamId: string,
  ): AgentRoleAssignment | null {
    const assignmentIds = this.agentRoles.get(agentId) || new Set<string>();

    const assignment = Array.from(assignmentIds)
      .map((id) => this.roleAssignments.get(id))
      .find(
        (assignment) =>
          assignment?.teamId === teamId && assignment?.status === 'active',
      );

    return assignment || null;
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
    this.emergentRoles.clear();
    this.roleAssignments.clear();
    this.roleTransitions.clear();
    this.rolePatterns.clear();
    this.teamRoles.clear();
    this.agentRoles.clear();
    this.taskRoles.clear();

    this.logger.info('RoleEmergenceService resources cleaned up');
  }

  /**
   * Reset the singleton instance (for testing purposes)
   */
  public static resetInstance(): void {
    if (RoleEmergenceService.instance) {
      RoleEmergenceService.instance.cleanup();
      RoleEmergenceService.instance = undefined as any;
    }
  }
}
