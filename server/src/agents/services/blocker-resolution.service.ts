import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';

import {
  StatusPriority,
  StatusUpdateType,
  BlockerUpdate,
  AssistanceRequest,
  ProgressStatus,
} from '../interfaces/status-reporting.interface';
import {
  DetailedAssistanceRequest,
  AssistanceResponse,
  AssistanceResolutionStatus,
  AssistanceCategory,
  AssistanceResponseType,
  BlockerResolutionStrategy,
} from '../interfaces/assistance-request.interface';
import { AgentMessagingService } from './agent-messaging.service';
import { ProgressBroadcastService } from './progress-broadcast.service';
import { AgentRegistryService } from './agent-registry.service';

/**
 * Service for resolving blockers and handling assistance requests
 */
export class BlockerResolutionService {
  private assistanceRequests: Map<string, DetailedAssistanceRequest> =
    new Map();
  private assistanceResponses: Map<string, AssistanceResponse[]> = new Map();
  private blockerStrategies: Map<string, BlockerResolutionStrategy> = new Map();
  private activeHelpers: Map<string, Set<string>> = new Map(); // requestId -> agentIds
  private readonly eventEmitter: EventEmitter;
  private readonly logger: Logger;

  constructor(
    private readonly messaging: AgentMessagingService,
    private readonly progressService: ProgressBroadcastService,
    private readonly agentRegistry: AgentRegistryService,
    logger: Logger,
  ) {
    this.logger = logger;
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);

    // Subscribe to status updates to detect new blockers
    this.subscribeToStatusUpdates();
  }

  /**
   * Create a detailed assistance request
   */
  async createAssistanceRequest(
    request: DetailedAssistanceRequest,
  ): Promise<DetailedAssistanceRequest> {
    // Store the request
    this.assistanceRequests.set(request.id, request);
    this.assistanceResponses.set(request.id, []);

    // Notify potential helpers
    await this.notifyPotentialHelpers(request);

    this.logger.info('Assistance request created', {
      requestId: request.id,
      requesterId: request.requesterId,
      category: request.category,
      title: request.title,
    });

    // Emit event
    this.eventEmitter.emit('assistance.request_created', request);

    return request;
  }

  /**
   * Convert a simple assistance request to a detailed one
   */
  async convertToDetailedRequest(
    assistanceRequest: AssistanceRequest,
    problemStatement: string,
    taskContext: string,
    desiredOutcome: string,
    category: AssistanceCategory,
  ): Promise<DetailedAssistanceRequest> {
    const detailedRequest: DetailedAssistanceRequest = {
      id: uuidv4(),
      originatingRequestId: assistanceRequest.id,
      requesterId: assistanceRequest.agentId,
      taskId: assistanceRequest.taskId,
      timestamp: Date.now(),
      category,
      title: assistanceRequest.requestDescription,
      description: assistanceRequest.message,
      urgency: assistanceRequest.urgency,
      priority: assistanceRequest.priority,
      expectedResponseTime: 3600000, // 1 hour default
      requiredBy: assistanceRequest.requiredBy,
      context: {
        problemStatement,
        taskContext,
        relevantFacts: [],
        constraints: [],
        attachments: [],
      },
      attemptedSolutions: assistanceRequest.attemptedSolutions,
      desiredOutcome,
      targetAgentIds: assistanceRequest.possibleAssistants,
      requiredExpertise: assistanceRequest.expertise,
      status: AssistanceResolutionStatus.PENDING,
      statusHistory: [
        {
          timestamp: Date.now(),
          status: AssistanceResolutionStatus.PENDING,
          updatedBy: assistanceRequest.agentId,
        },
      ],
      escalationLevel: 0,
    };

    // Store and process the detailed request
    return this.createAssistanceRequest(detailedRequest);
  }

  /**
   * Get an assistance request by ID
   */
  getAssistanceRequest(
    requestId: string,
  ): DetailedAssistanceRequest | undefined {
    return this.assistanceRequests.get(requestId);
  }

  /**
   * Get all assistance requests for a task
   */
  getTaskAssistanceRequests(
    taskId: string,
    includeResolved: boolean = false,
  ): DetailedAssistanceRequest[] {
    const requests: DetailedAssistanceRequest[] = [];

    for (const request of this.assistanceRequests.values()) {
      if (request.taskId === taskId) {
        if (
          includeResolved ||
          (request.status !== AssistanceResolutionStatus.RESOLVED &&
            request.status !== AssistanceResolutionStatus.UNRESOLVABLE)
        ) {
          requests.push(request);
        }
      }
    }

    return requests;
  }

  /**
   * Update assistance request status
   */
  updateRequestStatus(
    requestId: string,
    status: AssistanceResolutionStatus,
    updatedBy: string,
    notes?: string,
  ): DetailedAssistanceRequest | undefined {
    const request = this.assistanceRequests.get(requestId);

    if (!request) {
      return undefined;
    }

    // Update status
    request.status = status;

    // Add status history entry
    request.statusHistory.push({
      timestamp: Date.now(),
      status,
      updatedBy,
      notes,
    });

    // Store updated request
    this.assistanceRequests.set(requestId, request);

    this.logger.info('Assistance request status updated', {
      requestId,
      status,
      updatedBy,
    });

    // Emit event
    this.eventEmitter.emit('assistance.status_updated', {
      request,
      status,
      updatedBy,
      notes,
    });

    return request;
  }

  /**
   * Submit a response to an assistance request
   */
  async submitResponse(
    response: AssistanceResponse,
  ): Promise<AssistanceResponse> {
    const request = this.assistanceRequests.get(response.requestId);

    if (!request) {
      throw new Error(`Assistance request ${response.requestId} not found`);
    }

    // Store the response
    let responses = this.assistanceResponses.get(response.requestId) || [];
    responses.push(response);
    this.assistanceResponses.set(response.requestId, responses);

    // Add responder to active helpers
    let helpers = this.activeHelpers.get(response.requestId) || new Set();
    helpers.add(response.responderId);
    this.activeHelpers.set(response.requestId, helpers);

    // Update request status if not already in progress
    if (request.status === AssistanceResolutionStatus.PENDING) {
      this.updateRequestStatus(
        request.id,
        AssistanceResolutionStatus.IN_PROGRESS,
        response.responderId,
        'First response received',
      );
    }

    // Check if this response fully resolves the request
    if (response.completeness >= 0.9 && response.confidence >= 0.8) {
      this.updateRequestStatus(
        request.id,
        AssistanceResolutionStatus.RESOLVED,
        response.responderId,
        'High confidence solution provided',
      );
    } else if (response.completeness >= 0.5) {
      this.updateRequestStatus(
        request.id,
        AssistanceResolutionStatus.PARTIALLY_RESOLVED,
        response.responderId,
        'Partial solution provided',
      );
    }

    // Notify the requester
    await this.notifyRequester(response);

    this.logger.info('Assistance response submitted', {
      responseId: response.id,
      requestId: response.requestId,
      responderId: response.responderId,
      confidence: response.confidence,
      completeness: response.completeness,
    });

    // Emit event
    this.eventEmitter.emit('assistance.response_submitted', response);

    return response;
  }

  /**
   * Get all responses for a request
   */
  getResponsesForRequest(requestId: string): AssistanceResponse[] {
    return this.assistanceResponses.get(requestId) || [];
  }

  /**
   * Create a blocker resolution strategy
   */
  createBlockerStrategy(
    strategy: BlockerResolutionStrategy,
  ): BlockerResolutionStrategy {
    // Store the strategy
    this.blockerStrategies.set(strategy.id, strategy);

    this.logger.info('Blocker resolution strategy created', {
      strategyId: strategy.id,
      blockerId: strategy.blockerId,
      creatorId: strategy.creatorId,
      title: strategy.title,
    });

    // Emit event
    this.eventEmitter.emit('blocker.strategy_created', strategy);

    return strategy;
  }

  /**
   * Get resolution strategies for a blocker
   */
  getBlockerStrategies(blockerId: string): BlockerResolutionStrategy[] {
    const strategies: BlockerResolutionStrategy[] = [];

    for (const strategy of this.blockerStrategies.values()) {
      if (strategy.blockerId === blockerId) {
        strategies.push(strategy);
      }
    }

    return strategies;
  }

  /**
   * Update a blocker resolution strategy
   */
  updateBlockerStrategy(
    strategyId: string,
    updates: Partial<
      Omit<
        BlockerResolutionStrategy,
        'id' | 'blockerId' | 'creatorId' | 'timestamp'
      >
    >,
    updatedBy: string,
  ): BlockerResolutionStrategy | undefined {
    const strategy = this.blockerStrategies.get(strategyId);

    if (!strategy) {
      return undefined;
    }

    // Apply updates
    const updatedStrategy = {
      ...strategy,
      ...updates,
    };

    // Store updated strategy
    this.blockerStrategies.set(strategyId, updatedStrategy);

    this.logger.info('Blocker strategy updated', {
      strategyId,
      updatedBy,
      status: updatedStrategy.status,
    });

    // Emit event
    this.eventEmitter.emit('blocker.strategy_updated', {
      strategy: updatedStrategy,
      updatedBy,
    });

    return updatedStrategy;
  }

  /**
   * Find potential helpers for an assistance request
   */
  async findPotentialHelpers(
    request: DetailedAssistanceRequest,
  ): Promise<string[]> {
    const potentialHelpers: string[] = [];

    // If request has specific target agents, use those
    if (request.targetAgentIds && request.targetAgentIds.length > 0) {
      return request.targetAgentIds;
    }

    // Get all available agents
    const agents = await this.agentRegistry.getAllAgents();

    for (const agent of agents) {
      // Skip the requester
      if (agent.id === request.requesterId) {
        continue;
      }

      // Check if agent has required expertise
      // Production-ready implementation for capability matching
      if (request.requiredExpertise && request.requiredExpertise.length > 0) {
        // Check if the agent has any of the required capabilities
        const hasRequiredExpertise = request.requiredExpertise.some(
          (expertise) => {
            // First check if agent can handle this capability
            if (agent.canHandle && agent.canHandle(expertise)) {
              return true;
            }

            // Next check through all agent capabilities
            const capabilities = agent.getCapabilities
              ? agent.getCapabilities()
              : [];
            return capabilities.some(
              (cap) =>
                // Check for exact matches
                cap.name === expertise ||
                // Check for partial matches in name
                cap.name.includes(expertise) ||
                // Check for matches in description
                (cap.description &&
                  cap.description
                    .toLowerCase()
                    .includes(expertise.toLowerCase())),
            );
          },
        );

        // If agent doesn't have any required expertise, skip them
        if (!hasRequiredExpertise) {
          continue;
        }

        // For more critical requests, we can also check confidence level
        if (request.urgency === 'critical' || request.urgency === 'high') {
          try {
            // For critical requests, we might want to check the agent's confidence
            // in handling the specific capability
            // This is optional and can be skipped if getConfidence is not implemented
            if (agent.getConfidence) {
              const expertiseToCheck = request.requiredExpertise[0]; // Check first expertise
              const confidence = await agent.getConfidence(
                expertiseToCheck,
                request.title,
              );

              // Only include agents with moderate to high confidence
              if (confidence === 'low' || confidence === 'very_low') {
                continue;
              }
            }
          } catch (error) {
            // Ignore errors in getting confidence - don't block potential helpers
            this.logger.warn('Error checking agent confidence', {
              agentId: agent.id,
              error,
            });
          }
        }
      }

      potentialHelpers.push(agent.id);
    }

    return potentialHelpers;
  }

  /**
   * Escalate an assistance request
   */
  async escalateRequest(
    requestId: string,
    escalatedBy: string,
    reason: string,
  ): Promise<DetailedAssistanceRequest | undefined> {
    const request = this.assistanceRequests.get(requestId);

    if (!request) {
      return undefined;
    }

    // Increment escalation level
    request.escalationLevel += 1;

    // Add escalation note to status history
    request.statusHistory.push({
      timestamp: Date.now(),
      status: request.status,
      updatedBy: escalatedBy,
      notes: `Escalated: ${reason}`,
    });

    // Store updated request
    this.assistanceRequests.set(requestId, request);

    // Find additional helpers based on escalation level
    const additionalHelpers = await this.findEscalationHelpers(request);

    // Notify additional helpers
    if (additionalHelpers.length > 0) {
      await this.notifyHelpers(request, additionalHelpers);
    }

    this.logger.info('Assistance request escalated', {
      requestId,
      escalatedBy,
      newLevel: request.escalationLevel,
      reason,
    });

    // Emit event
    this.eventEmitter.emit('assistance.escalated', {
      request,
      escalatedBy,
      reason,
      additionalHelpers,
    });

    return request;
  }

  /**
   * Subscribe to events
   */
  subscribe(
    eventType:
      | 'assistance.request_created'
      | 'assistance.status_updated'
      | 'assistance.response_submitted'
      | 'assistance.escalated'
      | 'blocker.detected'
      | 'blocker.strategy_created'
      | 'blocker.strategy_updated',
    callback: (data: any) => void,
  ): () => void {
    this.eventEmitter.on(eventType, callback);

    // Return unsubscribe function
    return () => {
      this.eventEmitter.off(eventType, callback);
    };
  }

  /**
   * Helper methods
   */

  /**
   * Subscribe to status updates
   */
  private subscribeToStatusUpdates(): void {
    // Subscribe to blocker updates
    this.progressService.subscribe('status.blocker', (update) => {
      const blockerUpdate = update as BlockerUpdate;

      // Check if we should auto-create an assistance request
      if (
        blockerUpdate.impact === 'critical' ||
        blockerUpdate.impact === 'major'
      ) {
        this.handleNewBlocker(blockerUpdate);
      }
    });

    // Subscribe to assistance requests
    this.progressService.subscribe('status.assistance', (update) => {
      const assistanceRequest = update as AssistanceRequest;

      // Create a detailed assistance request if we don't have one already
      this.handleAssistanceRequest(assistanceRequest);
    });
  }

  /**
   * Handle a new blocker
   */
  private async handleNewBlocker(blockerUpdate: BlockerUpdate): Promise<void> {
    // Check if we already have an assistance request for this blocker
    const existingRequests = this.getTaskAssistanceRequests(
      blockerUpdate.taskId,
    );
    const matchingRequest = existingRequests.find(
      (req) =>
        req.description.includes(blockerUpdate.blockerDescription) ||
        req.context.problemStatement.includes(blockerUpdate.blockerDescription),
    );

    if (matchingRequest) {
      // Already have a request for this blocker
      return;
    }

    // Create a detailed assistance request
    const request: DetailedAssistanceRequest = {
      id: uuidv4(),
      requesterId: blockerUpdate.agentId,
      taskId: blockerUpdate.taskId,
      timestamp: Date.now(),
      category: AssistanceCategory.TECHNICAL_OBSTACLE,
      title: `Blocker: ${blockerUpdate.blockerDescription.substring(0, 50)}${blockerUpdate.blockerDescription.length > 50 ? '...' : ''}`,
      description: blockerUpdate.message,
      urgency: this.mapImpactToUrgency(blockerUpdate.impact),
      priority: blockerUpdate.priority,
      context: {
        problemStatement: blockerUpdate.blockerDescription,
        taskContext: `Task ${blockerUpdate.taskId} is blocked with ${blockerUpdate.impact} impact.`,
        relevantFacts: blockerUpdate.potentialSolutions
          ? [...blockerUpdate.potentialSolutions]
          : [],
        constraints: [],
      },
      desiredOutcome: 'Remove the blocker and allow the task to proceed',
      requiredResources: blockerUpdate.resourcesNeeded,
      status: AssistanceResolutionStatus.PENDING,
      statusHistory: [
        {
          timestamp: Date.now(),
          status: AssistanceResolutionStatus.PENDING,
          updatedBy: 'system',
        },
      ],
      escalationLevel: 0,
    };

    // Create the request
    await this.createAssistanceRequest(request);

    // Emit event
    this.eventEmitter.emit('blocker.detected', {
      blockerUpdate,
      assistanceRequest: request,
    });
  }

  /**
   * Handle an assistance request from the progress service
   */
  private async handleAssistanceRequest(
    assistanceRequest: AssistanceRequest,
  ): Promise<void> {
    // Check if we already have a detailed request for this
    const existingDetailedRequest = Array.from(
      this.assistanceRequests.values(),
    ).find((req) => req.originatingRequestId === assistanceRequest.id);

    if (existingDetailedRequest) {
      // Already processed this request
      return;
    }

    // Convert to detailed request
    const problemStatement = assistanceRequest.requestDescription;
    const taskContext = `Task ${assistanceRequest.taskId} requires assistance.`;
    const desiredOutcome = `Provide ${assistanceRequest.requestType} to resolve the request`;

    // Map request type to category
    let category: AssistanceCategory;
    switch (assistanceRequest.requestType) {
      case 'information':
        category = AssistanceCategory.KNOWLEDGE_GAP;
        break;
      case 'resource':
        category = AssistanceCategory.RESOURCE_LIMITATION;
        break;
      case 'expertise':
        category = AssistanceCategory.SKILL_LIMITATION;
        break;
      case 'review':
        category = AssistanceCategory.VALIDATION_REVIEW;
        break;
      case 'decision':
        category = AssistanceCategory.STRATEGIC_GUIDANCE;
        break;
      default:
        category = AssistanceCategory.CLARIFICATION_NEEDED;
    }

    await this.convertToDetailedRequest(
      assistanceRequest,
      problemStatement,
      taskContext,
      desiredOutcome,
      category,
    );
  }

  /**
   * Notify potential helpers about a request
   */
  private async notifyPotentialHelpers(
    request: DetailedAssistanceRequest,
  ): Promise<void> {
    // Find potential helpers
    const helpers = await this.findPotentialHelpers(request);

    if (helpers.length === 0) {
      this.logger.warn('No potential helpers found for assistance request', {
        requestId: request.id,
      });
      return;
    }

    // Notify helpers
    await this.notifyHelpers(request, helpers);
  }

  /**
   * Notify helpers about a request
   */
  private async notifyHelpers(
    request: DetailedAssistanceRequest,
    helperIds: string[],
  ): Promise<void> {
    // Get requester info
    const requester = await this.agentRegistry.getAgent(request.requesterId);

    if (!requester) {
      this.logger.warn('Requester not found', {
        requesterId: request.requesterId,
      });
      return;
    }

    // Create message content
    const messageContent = {
      type: 'assistance_request',
      request: {
        id: request.id,
        title: request.title,
        description: request.description,
        category: request.category,
        urgency: request.urgency,
        problemStatement: request.context.problemStatement,
        requesterName: requester.name,
        timestamp: request.timestamp,
      },
    };

    // Send messages to helpers
    for (const helperId of helperIds) {
      // Create conversation
      const conversation = await this.messaging.createConversation(
        [request.requesterId, helperId],
        `Assistance request: ${request.title}`,
      );

      // Send message
      await this.messaging.sendMessage({
        id: uuidv4(),
        conversationId: conversation.conversationId,
        senderId: request.requesterId,
        senderName: requester.name,
        recipientId: helperId,
        intent: 'request' as any,
        modality: 'structured_data' as any,
        content: messageContent,
        timestamp: Date.now(),
        priority: this.mapStatusPriorityToMessagePriority(request.priority),
      });
    }
  }

  /**
   * Notify requester about a response
   */
  private async notifyRequester(response: AssistanceResponse): Promise<void> {
    const request = this.assistanceRequests.get(response.requestId);

    if (!request) {
      this.logger.warn('Request not found for response notification', {
        requestId: response.requestId,
      });
      return;
    }

    // Get responder info
    const responder = await this.agentRegistry.getAgent(response.responderId);

    if (!responder) {
      this.logger.warn('Responder not found', {
        responderId: response.responderId,
      });
      return;
    }

    // Create conversation if needed
    const conversation = await this.messaging.createConversation(
      [request.requesterId, response.responderId],
      `Assistance: ${request.title}`,
    );

    // Create message content
    const messageContent = {
      type: 'assistance_response',
      response: {
        id: response.id,
        requestId: response.requestId,
        responseType: response.responseType,
        content: response.content,
        confidence: response.confidence,
        completeness: response.completeness,
        responderName: responder.name,
        timestamp: response.timestamp,
      },
    };

    // Send message
    await this.messaging.sendMessage({
      id: uuidv4(),
      conversationId: conversation.conversationId,
      senderId: response.responderId,
      senderName: responder.name,
      recipientId: request.requesterId,
      intent: 'inform' as any,
      modality: 'structured_data' as any,
      content: messageContent,
      timestamp: Date.now(),
      priority: response.completeness > 0.8 ? 2 : 1,
    });
  }

  /**
   * Find additional helpers for escalation
   */
  private async findEscalationHelpers(
    request: DetailedAssistanceRequest,
  ): Promise<string[]> {
    // Get current helpers
    const currentHelpers = this.activeHelpers.get(request.id) || new Set();
    const currentHelperIds = Array.from(currentHelpers);

    // For higher escalation levels, look for more specialized agents
    const allPotentialHelpers = await this.findPotentialHelpers(request);

    // Filter out already active helpers
    const newHelpers = allPotentialHelpers.filter(
      (id) => !currentHelperIds.includes(id),
    );

    // Take a subset based on escalation level
    const helpersToAdd = Math.min(
      request.escalationLevel * 2, // 2 new helpers per escalation level
      newHelpers.length,
    );

    return newHelpers.slice(0, helpersToAdd);
  }

  /**
   * Map impact to urgency
   */
  private mapImpactToUrgency(
    impact: BlockerUpdate['impact'],
  ): DetailedAssistanceRequest['urgency'] {
    switch (impact) {
      case 'critical':
        return 'critical';
      case 'major':
        return 'high';
      case 'moderate':
        return 'medium';
      case 'minor':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Map StatusPriority to message priority
   */
  private mapStatusPriorityToMessagePriority(priority: StatusPriority): number {
    switch (priority) {
      case StatusPriority.CRITICAL:
        return 3;
      case StatusPriority.HIGH:
        return 2;
      case StatusPriority.NORMAL:
        return 1;
      case StatusPriority.LOW:
        return 0;
      default:
        return 1;
    }
  }
}
