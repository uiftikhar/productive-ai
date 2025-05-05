/**
 * Dynamic Delegation Protocol Service
 *
 * Handles dynamic task routing and delegation based on agent capabilities,
 * enabling more flexible and emergent collaboration patterns
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import {
  BaseAgentInterface,
  AgentRequest,
  AgentResponse,
} from '../interfaces/base-agent.interface';
import { AgentRegistryService } from './agent-registry.service';
import { TeamAssemblyService, Team } from './team-assembly.service';
import { EventEmitter } from 'events';

/**
 * Task advertisement structure
 */
export interface TaskAdvertisement {
  id: string;
  title: string;
  description: string;
  requiredCapabilities: string[];
  priority: number;
  deadline?: number;
  reward?: number; // Conceptual "reward" for completing task (could be priority)
  advertiser: {
    id: string;
    name: string;
  };
  status: 'open' | 'assigned' | 'completed' | 'cancelled';
  responses: Array<{
    agentId: string;
    agentName: string;
    confidence: number;
    bidTime: number;
  }>;
  createdAt: number;
  assignedTo?: {
    agentId: string;
    agentName: string;
    assignedAt: number;
  };
  metadata?: Record<string, any>;
}

/**
 * Task delegation request
 */
export interface TaskDelegationRequest {
  title: string;
  description: string;
  requiredCapabilities?: string[];
  priority?: number;
  deadline?: number;
  preferredAgentIds?: string[];
  excludedAgentIds?: string[];
  teamId?: string;
  advertisementStrategy?: 'broadcast' | 'targeted' | 'team-only';
  waitForResponses?: number; // Time in milliseconds to wait for agent responses
  autoAssign?: boolean; // Automatically assign to best responder
  context?: Record<string, any>;
}

/**
 * Task delegation result
 */
export interface TaskDelegationResult {
  advertisementId: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  responses: Array<{
    agentId: string;
    agentName: string;
    confidence: number;
  }>;
  status: 'assigned' | 'pending' | 'failed';
  message?: string;
}

/**
 * Delegation protocol events
 */
export enum DelegationEventType {
  TASK_ADVERTISED = 'task-advertised',
  AGENT_RESPONDED = 'agent-responded',
  TASK_ASSIGNED = 'task-assigned',
  TASK_COMPLETED = 'task-completed',
  TASK_FAILED = 'task-failed',
  TASK_CANCELLED = 'task-cancelled',
}

/**
 * Configuration for DelegationProtocolService
 */
export interface DelegationProtocolConfig {
  logger?: Logger;
  agentRegistry?: AgentRegistryService;
  teamAssembly?: TeamAssemblyService;
  defaultWaitTime?: number;
  defaultAdvertisementStrategy?: 'broadcast' | 'targeted' | 'team-only';
}

/**
 * Service for task delegation between agents
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export class DelegationProtocolService {
  private static instance: DelegationProtocolService;
  private logger: Logger;
  private agentRegistry: AgentRegistryService;
  private teamAssembly: TeamAssemblyService;
  private eventEmitter: EventEmitter = new EventEmitter();

  // Settings
  private defaultWaitTime: number = 5000; // 5 seconds
  private defaultAdvertisementStrategy: 'broadcast' | 'targeted' | 'team-only' =
    'targeted';

  // Storage
  private advertisements: Map<string, TaskAdvertisement> = new Map();
  private pendingAssignments: Map<
    string,
    {
      advertisement: TaskAdvertisement;
      timer: NodeJS.Timeout;
      resolve: (result: TaskDelegationResult) => void;
      reject: (error: Error) => void;
    }
  > = new Map();

  // Subscription management
  private subscriptions: Map<
    string,
    {
      callback: (event: any) => void;
      types?: DelegationEventType[];
    }
  > = new Map();

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: DelegationProtocolConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();

    this.agentRegistry =
      config.agentRegistry || AgentRegistryService.getInstance();
    this.teamAssembly =
      config.teamAssembly || TeamAssemblyService.getInstance();

    if (config.defaultWaitTime) {
      this.defaultWaitTime = config.defaultWaitTime;
    }

    if (config.defaultAdvertisementStrategy) {
      this.defaultAdvertisementStrategy = config.defaultAdvertisementStrategy;
    }

    this.logger.info('Initialized DelegationProtocolService');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    config: DelegationProtocolConfig = {},
  ): DelegationProtocolService {
    if (!DelegationProtocolService.instance) {
      DelegationProtocolService.instance = new DelegationProtocolService(
        config,
      );
    }
    return DelegationProtocolService.instance;
  }

  /**
   * Advertise a task and find an agent to handle it
   */
  async delegateTask(
    advertiserId: string,
    request: TaskDelegationRequest,
  ): Promise<TaskDelegationResult> {
    const advertiser = this.agentRegistry.getAgent(advertiserId);
    if (!advertiser) {
      throw new Error(`Advertiser agent not found: ${advertiserId}`);
    }

    // Create the advertisement
    const advertisement: TaskAdvertisement = {
      id: uuidv4(),
      title: request.title,
      description: request.description,
      requiredCapabilities: request.requiredCapabilities || [],
      priority: request.priority || 5,
      deadline: request.deadline,
      advertiser: {
        id: advertiser.id,
        name: advertiser.name,
      },
      status: 'open',
      responses: [],
      createdAt: Date.now(),
      metadata: {
        context: request.context,
      },
    };

    // Store the advertisement
    this.advertisements.set(advertisement.id, advertisement);

    // Determine which agents to advertise to
    const targetAgents = await this.determineTargetAgents(
      advertisement,
      request,
    );

    if (targetAgents.length === 0) {
      this.logger.warn(
        `No eligible agents found for task: ${advertisement.title}`,
      );

      return {
        advertisementId: advertisement.id,
        responses: [],
        status: 'failed',
        message: 'No eligible agents found',
      };
    }

    // Advertise the task
    await this.broadcastAdvertisement(advertisement, targetAgents);

    // Emit event
    this.emitEvent({
      type: DelegationEventType.TASK_ADVERTISED,
      advertisementId: advertisement.id,
      advertiserId: advertiser.id,
      targetAgents: targetAgents.map((a) => a.id),
      timestamp: Date.now(),
    });

    // If auto-assign is disabled, return immediately with pending status
    if (request.autoAssign === false) {
      return {
        advertisementId: advertisement.id,
        responses: [],
        status: 'pending',
      };
    }

    // Wait for responses and make assignment
    return await this.waitForResponses(
      advertisement,
      request.waitForResponses || this.defaultWaitTime,
    );
  }

  /**
   * Determine which agents should receive the advertisement
   */
  private async determineTargetAgents(
    advertisement: TaskAdvertisement,
    request: TaskDelegationRequest,
  ): Promise<BaseAgentInterface[]> {
    const strategy =
      request.advertisementStrategy || this.defaultAdvertisementStrategy;
    let candidates: BaseAgentInterface[] = [];

    switch (strategy) {
      case 'broadcast':
        // Send to all agents
        candidates = this.agentRegistry.listAgents();
        break;

      case 'team-only':
        // Send only to members of the specified team
        if (request.teamId) {
          const team = this.teamAssembly.getTeam(request.teamId);
          if (team) {
            const teamAgentIds = team.members.map((m) => m.agentId);
            candidates = teamAgentIds
              .map((id) => this.agentRegistry.getAgent(id))
              .filter(
                (agent): agent is BaseAgentInterface => agent !== undefined,
              );
          } else {
            this.logger.warn(`Team not found: ${request.teamId}`);
          }
        } else {
          this.logger.warn(
            'Team-only strategy specified but no teamId provided',
          );
        }
        break;

      case 'targeted':
      default:
        // Send to agents with matching capabilities
        if (advertisement.requiredCapabilities.length > 0) {
          const allAgents = this.agentRegistry.listAgents();
          candidates = allAgents.filter((agent) => {
            const agentCapabilities = agent
              .getCapabilities()
              .map((c) => c.name);
            return advertisement.requiredCapabilities.some((cap) =>
              agentCapabilities.includes(cap),
            );
          });
        } else {
          // Without specific capabilities, send to all agents
          candidates = this.agentRegistry.listAgents();
        }
        break;
    }

    // Apply preferred/excluded filters
    if (request.preferredAgentIds && request.preferredAgentIds.length > 0) {
      // Keep only preferred agents that are in the candidates list
      const preferredSet = new Set(request.preferredAgentIds);
      candidates = candidates.filter((agent) => preferredSet.has(agent.id));
    }

    if (request.excludedAgentIds && request.excludedAgentIds.length > 0) {
      // Remove excluded agents
      const excludedSet = new Set(request.excludedAgentIds);
      candidates = candidates.filter((agent) => !excludedSet.has(agent.id));
    }

    // Exclude the advertiser itself
    candidates = candidates.filter(
      (agent) => agent.id !== advertisement.advertiser.id,
    );

    return candidates;
  }

  /**
   * Broadcast an advertisement to target agents
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private async broadcastAdvertisement(
    advertisement: TaskAdvertisement,
    targetAgents: BaseAgentInterface[],
  ): Promise<void> {
    this.logger.info(
      `Broadcasting advertisement ${advertisement.id} to ${targetAgents.length} agents`,
    );

    // Create advertisement payload as a JSON string
    const advertisementPayload = JSON.stringify({
      taskAdvertisement: {
        id: advertisement.id,
        title: advertisement.title,
        description: advertisement.description,
        requiredCapabilities: advertisement.requiredCapabilities,
        priority: advertisement.priority,
        deadline: advertisement.deadline,
        advertiser: advertisement.advertiser,
      },
    });

    // Broadcast to all target agents concurrently
    await Promise.all(
      targetAgents.map(async (agent) => {
        try {
          await agent.execute({
            capability: 'task-evaluation',
            input: advertisementPayload,
            parameters: {
              type: 'task-advertisement',
              advertisementId: advertisement.id,
            },
          });
        } catch (error) {
          this.logger.warn(
            `Failed to send advertisement to agent ${agent.id}`,
            { error, advertisementId: advertisement.id },
          );
        }
      }),
    );
  }

  /**
   * Process an agent response to an advertisement
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private async processAgentResponse(
    advertisement: TaskAdvertisement,
    agent: BaseAgentInterface,
    response: AgentResponse,
  ): Promise<void> {
    this.logger.info(
      `Processing response from agent ${agent.id} for advertisement ${advertisement.id}`,
    );

    if (!response.success) {
      this.logger.warn(`Agent ${agent.id} failed to process advertisement`, {
        error: response.error,
        advertisementId: advertisement.id,
      });
      return;
    }

    // Extract confidence from response
    let confidence = 0;

    if (typeof response.output === 'number') {
      confidence = response.output;
    } else if (
      typeof response.output === 'object' &&
      response.output !== null
    ) {
      const outputObj = response.output as any;
      confidence = outputObj.confidence || outputObj.score || 0;
    } else if (typeof response.output === 'string') {
      try {
        const parsed = JSON.parse(response.output);
        if (typeof parsed === 'number') {
          confidence = parsed;
        } else if (typeof parsed === 'object' && parsed !== null) {
          confidence = parsed.confidence || parsed.score || 0;
        }
      } catch (error) {
        // If not parseable, try to extract a number from the string
        const match = response.output.match(/(\d+(\.\d+)?)/);
        if (match) {
          confidence = parseFloat(match[0]);
        }
      }
    }

    // Clamp confidence to 0-1 range
    confidence = Math.max(0, Math.min(1, confidence));

    // Record the response in the advertisement
    const agentResponse = {
      agentId: agent.id,
      agentName: agent.name,
      confidence,
      bidTime: Date.now(),
    };

    advertisement.responses.push(agentResponse);
    this.advertisements.set(advertisement.id, advertisement);

    // Emit event for the response
    this.emitEvent({
      type: DelegationEventType.AGENT_RESPONDED,
      advertisementId: advertisement.id,
      agentId: agent.id,
      confidence,
      timestamp: Date.now(),
    });

    // Check for auto-assignment
    const pendingAssignment = this.pendingAssignments.get(advertisement.id);
    if (
      pendingAssignment &&
      pendingAssignment.advertisement.status === 'open' &&
      pendingAssignment.advertisement.responses.length > 0
    ) {
      // Sort by confidence
      const responses = [...pendingAssignment.advertisement.responses].sort(
        (a, b) => b.confidence - a.confidence,
      );

      // If the best response has high confidence, assign the task
      if (responses[0].confidence > 0.8) {
        this.assignTask(advertisement.id)
          .then((result) => {
            pendingAssignment.resolve(result);
          })
          .catch((error) => {
            pendingAssignment.reject(error);
          });
      }
    }
  }

  /**
   * Wait for agent responses and select the best match
   */
  private waitForResponses(
    advertisement: TaskAdvertisement,
    waitTime: number,
  ): Promise<TaskDelegationResult> {
    return new Promise((resolve, reject) => {
      // Set a timer to make the assignment after the wait period
      const timer = setTimeout(() => {
        this.assignTask(advertisement.id).then(resolve).catch(reject);
      }, waitTime);

      // Store the pending assignment
      this.pendingAssignments.set(advertisement.id, {
        advertisement,
        timer,
        resolve,
        reject,
      });
    });
  }

  /**
   * Assign a task to the best responder
   */
  async assignTask(advertisementId: string): Promise<TaskDelegationResult> {
    const advertisement = this.advertisements.get(advertisementId);
    if (!advertisement) {
      throw new Error(`Advertisement not found: ${advertisementId}`);
    }

    // Clean up any pending assignment
    const pending = this.pendingAssignments.get(advertisementId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingAssignments.delete(advertisementId);
    }

    // If already assigned, return the current assignment
    if (advertisement.status === 'assigned' && advertisement.assignedTo) {
      return {
        advertisementId,
        assignedAgentId: advertisement.assignedTo.agentId,
        assignedAgentName: advertisement.assignedTo.agentName,
        responses: advertisement.responses.map((r) => ({
          agentId: r.agentId,
          agentName: r.agentName,
          confidence: r.confidence,
        })),
        status: 'assigned',
      };
    }

    // If no responses, return failure
    if (advertisement.responses.length === 0) {
      advertisement.status = 'cancelled';
      this.advertisements.set(advertisementId, advertisement);

      return {
        advertisementId,
        responses: [],
        status: 'failed',
        message: 'No agent responses received',
      };
    }

    // Sort responses by confidence (descending)
    const sortedResponses = [...advertisement.responses].sort(
      (a, b) => b.confidence - a.confidence,
    );

    // Select the best responder
    const bestResponse = sortedResponses[0];

    // Make sure the agent still exists
    const agent = this.agentRegistry.getAgent(bestResponse.agentId);
    if (!agent) {
      advertisement.status = 'cancelled';
      this.advertisements.set(advertisementId, advertisement);

      return {
        advertisementId,
        responses: sortedResponses.map((r) => ({
          agentId: r.agentId,
          agentName: r.agentName,
          confidence: r.confidence,
        })),
        status: 'failed',
        message: `Selected agent no longer exists: ${bestResponse.agentId}`,
      };
    }

    // Update the advertisement
    advertisement.status = 'assigned';
    advertisement.assignedTo = {
      agentId: bestResponse.agentId,
      agentName: bestResponse.agentName,
      assignedAt: Date.now(),
    };

    this.advertisements.set(advertisementId, advertisement);

    // Emit event
    this.emitEvent({
      type: DelegationEventType.TASK_ASSIGNED,
      advertisementId,
      agentId: bestResponse.agentId,
      confidence: bestResponse.confidence,
      timestamp: Date.now(),
    });

    return {
      advertisementId,
      assignedAgentId: bestResponse.agentId,
      assignedAgentName: bestResponse.agentName,
      responses: sortedResponses.map((r) => ({
        agentId: r.agentId,
        agentName: r.agentName,
        confidence: r.confidence,
      })),
      status: 'assigned',
    };
  }

  /**
   * Complete a delegated task with result
   */
  async completeTask(
    advertisementId: string,
    result: any,
    performedById?: string,
  ): Promise<void> {
    const advertisement = this.advertisements.get(advertisementId);
    if (!advertisement) {
      throw new Error(`Advertisement not found: ${advertisementId}`);
    }

    // Verify the task was assigned to the agent completing it
    if (performedById && advertisement.assignedTo?.agentId !== performedById) {
      throw new Error(`Task not assigned to this agent: ${performedById}`);
    }

    // Update the advertisement
    advertisement.status = 'completed';
    advertisement.metadata = {
      ...(advertisement.metadata || {}),
      result,
      completedAt: Date.now(),
    };

    this.advertisements.set(advertisementId, advertisement);

    // Emit event
    this.emitEvent({
      type: DelegationEventType.TASK_COMPLETED,
      advertisementId,
      agentId: advertisement.assignedTo?.agentId,
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Mark a task as failed
   */
  async failTask(
    advertisementId: string,
    reason: string,
    performedById?: string,
  ): Promise<void> {
    const advertisement = this.advertisements.get(advertisementId);
    if (!advertisement) {
      throw new Error(`Advertisement not found: ${advertisementId}`);
    }

    // Verify the task was assigned to the agent reporting failure
    if (performedById && advertisement.assignedTo?.agentId !== performedById) {
      throw new Error(`Task not assigned to this agent: ${performedById}`);
    }

    // Update the advertisement
    advertisement.status = 'cancelled';
    advertisement.metadata = {
      ...(advertisement.metadata || {}),
      failureReason: reason,
      failedAt: Date.now(),
    };

    this.advertisements.set(advertisementId, advertisement);

    // Emit event
    this.emitEvent({
      type: DelegationEventType.TASK_FAILED,
      advertisementId,
      agentId: advertisement.assignedTo?.agentId,
      reason,
      timestamp: Date.now(),
    });
  }

  /**
   * Cancel a task advertisement
   */
  async cancelAdvertisement(advertisementId: string): Promise<void> {
    const advertisement = this.advertisements.get(advertisementId);
    if (!advertisement) {
      throw new Error(`Advertisement not found: ${advertisementId}`);
    }

    // Clean up any pending assignment
    const pending = this.pendingAssignments.get(advertisementId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingAssignments.delete(advertisementId);
    }

    // Update the advertisement
    advertisement.status = 'cancelled';

    this.advertisements.set(advertisementId, advertisement);

    // Emit event
    this.emitEvent({
      type: DelegationEventType.TASK_CANCELLED,
      advertisementId,
      timestamp: Date.now(),
    });
  }

  /**
   * Get details about a task advertisement
   */
  getAdvertisement(advertisementId: string): TaskAdvertisement | undefined {
    return this.advertisements.get(advertisementId);
  }

  /**
   * List all active task advertisements
   */
  listActiveAdvertisements(): TaskAdvertisement[] {
    return Array.from(this.advertisements.values()).filter(
      (ad) => ad.status === 'open' || ad.status === 'assigned',
    );
  }

  /**
   * Subscribe to delegation events
   */
  subscribe(
    callback: (event: any) => void,
    eventTypes?: DelegationEventType[],
  ): string {
    const subscriptionId = uuidv4();

    this.subscriptions.set(subscriptionId, {
      callback,
      types: eventTypes,
    });

    return subscriptionId;
  }

  /**
   * Unsubscribe from delegation events
   */
  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Emit a delegation event
   */
  private emitEvent(event: any): void {
    // Deliver to all matching subscribers
    for (const [id, subscription] of this.subscriptions.entries()) {
      // Skip if subscription specifies event types and this doesn't match
      if (
        subscription.types &&
        !subscription.types.includes(event.type as DelegationEventType)
      ) {
        continue;
      }

      try {
        subscription.callback(event);
      } catch (error) {
        this.logger.error(`Error in event subscription handler ${id}`, {
          error,
        });
      }
    }
  }
}
