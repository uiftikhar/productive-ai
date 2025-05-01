import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';

import {
  ProblemSolvingSession,
  AssistanceResponse,
  AssistanceResponseType,
  DetailedAssistanceRequest,
  AssistanceResolutionStatus,
} from '../interfaces/assistance-request.interface';
import { BlockerResolutionService } from './blocker-resolution.service';
import { AgentMessagingService } from './agent-messaging.service';
import { AgentRegistryService } from './agent-registry.service';

/**
 * Vote type for solution proposals
 */
export enum VoteType {
  UP = 'up',
  DOWN = 'down',
  NEUTRAL = 'neutral',
}

/**
 * Expertise contribution weighting
 */
interface ExpertiseWeight {
  expertise: string;
  weight: number; // 0-2 scale: 0 = irrelevant, 1 = relevant, 2 = critical
}

/**
 * Collective reasoning trace
 */
interface ReasoningTrace {
  id: string;
  sessionId: string;
  timestamp: number;
  steps: Array<{
    agentId: string;
    reasoning: string;
    conclusion: string;
    confidence: number;
  }>;
  finalConclusion: string;
  confidence: number;
}

/**
 * Service for coordinating collective problem solving among multiple agents
 */
export class CollectiveProblemSolvingService {
  private sessions: Map<string, ProblemSolvingSession> = new Map();
  private reasoningTraces: Map<string, ReasoningTrace[]> = new Map();
  private expertiseWeights: Map<string, ExpertiseWeight[]> = new Map(); // sessionId -> expertise weights
  private readonly eventEmitter: EventEmitter;
  private readonly logger: Logger;

  constructor(
    private readonly blockerResolution: BlockerResolutionService,
    private readonly messaging: AgentMessagingService,
    private readonly agentRegistry: AgentRegistryService,
    logger: Logger,
  ) {
    this.logger = logger;
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);

    // Subscribe to assistance request events
    this.subscribeToAssistanceEvents();
  }

  /**
   * Create a problem solving session
   */
  async createSession(
    assistanceRequestId: string,
    participantIds: string[],
    facilitatorId: string = participantIds[0],
  ): Promise<ProblemSolvingSession> {
    // Get the assistance request
    const request =
      this.blockerResolution.getAssistanceRequest(assistanceRequestId);

    if (!request) {
      throw new Error(`Assistance request ${assistanceRequestId} not found`);
    }

    // Create the session
    const session: ProblemSolvingSession = {
      id: uuidv4(),
      requestId: assistanceRequestId,
      title: `Problem solving: ${request.title}`,
      description: request.description,
      startTime: Date.now(),
      status: 'active',
      participants: participantIds,
      problem: {
        statement: request.context.problemStatement,
        context: request.context.taskContext,
        constraints: request.context.constraints || [],
        acceptanceCriteria: request.acceptanceCriteria || [],
      },
      contributions: [],
      facilitatorId,
    };

    // Store the session
    this.sessions.set(session.id, session);
    this.reasoningTraces.set(session.id, []);

    // Set up expertise weights
    if (request.requiredExpertise && request.requiredExpertise.length > 0) {
      this.expertiseWeights.set(
        session.id,
        request.requiredExpertise.map((expertise) => ({
          expertise,
          weight: 1.5, // Default weight for required expertise
        })),
      );
    }

    // Notify participants
    await this.notifySessionStart(session);

    this.logger.info('Problem solving session created', {
      sessionId: session.id,
      requestId: assistanceRequestId,
      participantCount: participantIds.length,
    });

    // Emit event
    this.eventEmitter.emit('problem_solving.session_created', session);

    return session;
  }

  /**
   * Get a problem solving session
   */
  getSession(sessionId: string): ProblemSolvingSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get sessions for an assistance request
   */
  getSessionsForRequest(requestId: string): ProblemSolvingSession[] {
    const sessions: ProblemSolvingSession[] = [];

    for (const session of this.sessions.values()) {
      if (session.requestId === requestId) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Add a contribution to a session
   */
  async addContribution(
    sessionId: string,
    contributorId: string,
    type: ProblemSolvingSession['contributions'][0]['type'],
    content: string,
    options: {
      references?: string[];
    } = {},
  ): Promise<ProblemSolvingSession> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Check if contributor is a participant
    if (!session.participants.includes(contributorId)) {
      throw new Error(
        `Agent ${contributorId} is not a participant in session ${sessionId}`,
      );
    }

    // Create contribution
    const contribution = {
      id: uuidv4(),
      contributorId,
      timestamp: Date.now(),
      type,
      content,
      references: options.references || [],
      votes: {},
    };

    // Add contribution to session
    session.contributions.push(contribution);

    // Store updated session
    this.sessions.set(sessionId, session);

    // Notify participants
    await this.notifyNewContribution(session, contribution);

    this.logger.info('Contribution added to problem solving session', {
      sessionId,
      contributionId: contribution.id,
      contributorId,
      type,
    });

    // Emit event
    this.eventEmitter.emit('problem_solving.contribution_added', {
      session,
      contribution,
    });

    return session;
  }

  /**
   * Vote on a contribution
   */
  async voteOnContribution(
    sessionId: string,
    contributionId: string,
    voterId: string,
    vote: VoteType,
  ): Promise<ProblemSolvingSession> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Find the contribution
    const contributionIndex = session.contributions.findIndex(
      (c) => c.id === contributionId,
    );

    if (contributionIndex === -1) {
      throw new Error(
        `Contribution ${contributionId} not found in session ${sessionId}`,
      );
    }

    // Check if voter is a participant
    if (!session.participants.includes(voterId)) {
      throw new Error(
        `Agent ${voterId} is not a participant in session ${sessionId}`,
      );
    }

    // Record the vote
    session.contributions[contributionIndex].votes = {
      ...session.contributions[contributionIndex].votes,
      [voterId]: vote,
    };

    // Store updated session
    this.sessions.set(sessionId, session);

    this.logger.info('Vote recorded on contribution', {
      sessionId,
      contributionId,
      voterId,
      vote,
    });

    // Emit event
    this.eventEmitter.emit('problem_solving.vote_recorded', {
      session,
      contributionId,
      voterId,
      vote,
    });

    return session;
  }

  /**
   * Submit a collective solution
   */
  async submitCollectiveSolution(
    sessionId: string,
    solutionContributionIds: string[],
    finalSolutionText: string,
    selectedSolutionId?: string,
    rationale?: string,
  ): Promise<AssistanceResponse> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Get the assistance request
    const request = this.blockerResolution.getAssistanceRequest(
      session.requestId,
    );

    if (!request) {
      throw new Error(`Assistance request ${session.requestId} not found`);
    }

    // Check that we have at least one solution contribution
    if (solutionContributionIds.length === 0) {
      throw new Error('Must provide at least one solution contribution');
    }

    // Verify that all contribution IDs exist
    const contributions = session.contributions.filter((c) =>
      solutionContributionIds.includes(c.id),
    );

    if (contributions.length !== solutionContributionIds.length) {
      throw new Error('One or more contribution IDs are invalid');
    }

    // Update session with outcome information
    session.outcomes = {
      solutions: contributions.map((c) => c.content),
      selectedSolutionId,
      rationale: rationale || 'Collective agreement on solution',
      lessonsLearned: [],
    };

    session.status = 'completed';
    session.endTime = Date.now();

    // Store updated session
    this.sessions.set(sessionId, session);

    // Create response for the assistance request
    const response: AssistanceResponse = {
      id: uuidv4(),
      requestId: session.requestId,
      responderId: session.facilitatorId || 'system',
      timestamp: Date.now(),
      responseType: AssistanceResponseType.SOLUTION,
      content: finalSolutionText,
      confidence: this.calculateCollectiveConfidence(session),
      completeness: 1.0, // Collective solutions are considered complete
      references: solutionContributionIds,
      followupActions: this.extractFollowupActions(session),
    };

    // Submit the response
    await this.blockerResolution.submitResponse(response);

    // Mark the session as completed
    await this.completeSession(sessionId, 'completed');

    this.logger.info('Collective solution submitted', {
      sessionId,
      requestId: session.requestId,
      confidence: response.confidence,
    });

    // Emit event
    this.eventEmitter.emit('problem_solving.solution_submitted', {
      session,
      response,
    });

    return response;
  }

  /**
   * Complete a problem solving session
   */
  async completeSession(
    sessionId: string,
    status: 'completed' | 'abandoned',
  ): Promise<ProblemSolvingSession> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Update session status
    session.status = status;
    session.endTime = Date.now();

    // Store updated session
    this.sessions.set(sessionId, session);

    // Notify participants
    await this.notifySessionEnd(session);

    this.logger.info('Problem solving session completed', {
      sessionId,
      status,
    });

    // Emit event
    this.eventEmitter.emit('problem_solving.session_completed', {
      session,
      status,
    });

    return session;
  }

  /**
   * Add a reasoning trace to a session
   */
  addReasoningTrace(
    sessionId: string,
    reasoningSteps: ReasoningTrace['steps'],
    finalConclusion: string,
    confidence: number,
  ): ReasoningTrace {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Create reasoning trace
    const trace: ReasoningTrace = {
      id: uuidv4(),
      sessionId,
      timestamp: Date.now(),
      steps: reasoningSteps,
      finalConclusion,
      confidence,
    };

    // Store reasoning trace
    const traces = this.reasoningTraces.get(sessionId) || [];
    traces.push(trace);
    this.reasoningTraces.set(sessionId, traces);

    this.logger.info('Reasoning trace added', {
      sessionId,
      traceId: trace.id,
      stepCount: reasoningSteps.length,
    });

    // Emit event
    this.eventEmitter.emit('problem_solving.reasoning_added', trace);

    return trace;
  }

  /**
   * Get all reasoning traces for a session
   */
  getReasoningTraces(sessionId: string): ReasoningTrace[] {
    return this.reasoningTraces.get(sessionId) || [];
  }

  /**
   * Set expertise weightings for a session
   */
  setExpertiseWeights(sessionId: string, weights: ExpertiseWeight[]): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Store weights
    this.expertiseWeights.set(sessionId, weights);

    this.logger.info('Expertise weights set', {
      sessionId,
      weightCount: weights.length,
    });
  }

  /**
   * Subscribe to events
   */
  subscribe(
    eventType:
      | 'problem_solving.session_created'
      | 'problem_solving.contribution_added'
      | 'problem_solving.vote_recorded'
      | 'problem_solving.solution_submitted'
      | 'problem_solving.session_completed'
      | 'problem_solving.reasoning_added',
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
   * Subscribe to assistance events
   */
  private subscribeToAssistanceEvents(): void {
    // Listen for assistance requests that might need collective problem solving
    this.blockerResolution.subscribe(
      'assistance.request_created',
      async (request) => {
        await this.considerCollectiveProblemSolving(request);
      },
    );

    // Listen for responses that don't fully resolve a request
    this.blockerResolution.subscribe(
      'assistance.response_submitted',
      async (response) => {
        if (response.completeness < 0.7) {
          await this.considerCollectiveResponseEnhancement(response);
        }
      },
    );
  }

  /**
   * Consider starting a collective problem-solving session for a request
   */
  private async considerCollectiveProblemSolving(
    request: DetailedAssistanceRequest,
  ): Promise<void> {
    // Determine if this is a complex problem that needs collective solving
    const isComplex = this.isComplexProblem(request);

    if (!isComplex) {
      return;
    }

    // Find potential participants
    const participants = await this.findPotentialParticipants(request);

    if (participants.length < 2) {
      this.logger.warn(
        'Not enough participants for collective problem solving',
        {
          requestId: request.id,
        },
      );
      return;
    }

    // Create a problem-solving session
    await this.createSession(request.id, participants);
  }

  /**
   * Consider enhancing a partial response with collective input
   */
  private async considerCollectiveResponseEnhancement(
    response: AssistanceResponse,
  ): Promise<void> {
    // Get the request
    const request = this.blockerResolution.getAssistanceRequest(
      response.requestId,
    );

    if (!request) {
      return;
    }

    // Check if the request is already being handled by a session
    const existingSessions = this.getSessionsForRequest(
      response.requestId,
    ).filter((s) => s.status === 'active');

    if (existingSessions.length > 0) {
      // Already have an active session
      return;
    }

    // Check if this is a significant response but incomplete
    if (response.confidence > 0.5 && response.completeness < 0.7) {
      // Find potential participants to enhance the response
      const participants = await this.findPotentialParticipants(request);

      // Add the responder as a participant if not already included
      if (!participants.includes(response.responderId)) {
        participants.push(response.responderId);
      }

      if (participants.length < 2) {
        return;
      }

      // Create a session with the responder as facilitator
      const session = await this.createSession(
        response.requestId,
        participants,
        response.responderId,
      );

      // Add the initial response as a contribution
      await this.addContribution(
        session.id,
        response.responderId,
        'solution',
        response.content,
      );
    }
  }

  /**
   * Determine if a problem is complex enough for collective solving
   */
  private isComplexProblem(request: DetailedAssistanceRequest): boolean {
    // This is a simplified heuristic - in a real system this would be more sophisticated

    // Check if the problem has high complexity indicators
    const complexityIndicators = [
      request.category === 'strategic_guidance',
      request.category === 'technical_obstacle' && request.urgency === 'high',
      request.escalationLevel > 0,
      request.requiredExpertise && request.requiredExpertise.length > 1,
      request.context.constraints && request.context.constraints.length > 2,
    ];

    // Count how many complexity indicators are true
    const complexityScore = complexityIndicators.filter(Boolean).length;

    // Consider complex if at least 2 indicators are true
    return complexityScore >= 2;
  }

  /**
   * Find potential participants for a problem-solving session
   */
  private async findPotentialParticipants(
    request: DetailedAssistanceRequest,
  ): Promise<string[]> {
    const participants: string[] = [];

    // Include the requester
    participants.push(request.requesterId);

    // Include any assigned helpers
    if (request.assignedHelpers) {
      participants.push(...request.assignedHelpers);
    }

    // If we don't have enough participants, find more based on expertise
    if (participants.length < 3 && request.requiredExpertise) {
      const agents = await this.agentRegistry.getAllAgents();

      for (const agent of agents) {
        // Skip agents already included
        if (participants.includes(agent.id)) {
          continue;
        }

        // Check if agent has any of the required expertise
        if (request.requiredExpertise && request.requiredExpertise.length > 0) {
          // Production-ready implementation for expertise matching
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

          // Only include agents with required expertise
          if (hasRequiredExpertise) {
            participants.push(agent.id);

            // Stop once we have enough participants
            if (participants.length >= 5) {
              break;
            }
          }
        } else {
          // If no specific expertise is required, include agent based on
          // general problem-solving capability
          if (agent.canHandle && agent.canHandle('problem_solving')) {
            participants.push(agent.id);

            // Stop once we have enough participants
            if (participants.length >= 5) {
              break;
            }
          }
        }
      }
    }

    return participants;
  }

  /**
   * Notify participants about session start
   */
  private async notifySessionStart(
    session: ProblemSolvingSession,
  ): Promise<void> {
    try {
      // Create a conversation for all participants
      const conversation = await this.messaging.createConversation(
        session.participants,
        `Problem Solving: ${session.title}`,
      );

      // Get facilitator info
      const facilitator = session.facilitatorId
        ? await this.agentRegistry.getAgent(session.facilitatorId)
        : { name: 'System' };

      // Create message content
      const messageContent = {
        type: 'problem_solving_session_start',
        session: {
          id: session.id,
          title: session.title,
          description: session.description,
          problem: session.problem,
          participants: session.participants,
          facilitatorId: session.facilitatorId,
          facilitatorName: facilitator?.name || 'Unknown',
        },
      };

      // Send message to all participants
      await this.messaging.sendMessage({
        id: uuidv4(),
        conversationId: conversation.conversationId,
        senderId: session.facilitatorId || 'system',
        senderName: facilitator?.name,
        intent: 'inform' as any,
        modality: 'structured_data' as any,
        content: messageContent,
        timestamp: Date.now(),
        priority: 2,
      });
    } catch (error) {
      this.logger.error('Error notifying session start', { error });
    }
  }

  /**
   * Notify participants about a new contribution
   */
  private async notifyNewContribution(
    session: ProblemSolvingSession,
    contribution: ProblemSolvingSession['contributions'][0],
  ): Promise<void> {
    try {
      // Create a conversation for all participants
      const conversation = await this.messaging.createConversation(
        session.participants,
        `Problem Solving: ${session.title}`,
      );

      // Get contributor info
      const contributor = await this.agentRegistry.getAgent(
        contribution.contributorId,
      );

      // Create message content
      const messageContent = {
        type: 'problem_solving_contribution',
        contribution: {
          id: contribution.id,
          type: contribution.type,
          content: contribution.content,
          contributorId: contribution.contributorId,
          contributorName: contributor?.name || 'Unknown',
          timestamp: contribution.timestamp,
          references: contribution.references,
        },
      };

      // Send message to all participants
      await this.messaging.sendMessage({
        id: uuidv4(),
        conversationId: conversation.conversationId,
        senderId: session.facilitatorId || 'system',
        senderName: contributor?.name,
        intent: 'inform' as any,
        modality: 'structured_data' as any,
        content: messageContent,
        timestamp: Date.now(),
        priority: 1,
      });
    } catch (error) {
      this.logger.error('Error notifying new contribution', { error });
    }
  }

  /**
   * Notify participants about session end
   */
  private async notifySessionEnd(
    session: ProblemSolvingSession,
  ): Promise<void> {
    try {
      // Create a conversation for all participants
      const conversation = await this.messaging.createConversation(
        session.participants,
        `Problem Solving: ${session.title}`,
      );

      // Get facilitator info
      const facilitator = session.facilitatorId
        ? await this.agentRegistry.getAgent(session.facilitatorId)
        : { name: 'System' };

      // Create message content
      const messageContent = {
        type: 'problem_solving_session_end',
        session: {
          id: session.id,
          status: session.status,
          outcomes: session.outcomes,
          duration: session.endTime ? session.endTime - session.startTime : 0,
        },
      };

      // Send message to all participants
      await this.messaging.sendMessage({
        id: uuidv4(),
        conversationId: conversation.conversationId,
        senderId: session.facilitatorId || 'system',
        senderName: facilitator?.name,
        intent: 'inform' as any,
        modality: 'structured_data' as any,
        content: messageContent,
        timestamp: Date.now(),
        priority: 2,
      });
    } catch (error) {
      this.logger.error('Error notifying session end', { error });
    }
  }

  /**
   * Calculate collective confidence based on votes and expertise
   */
  private calculateCollectiveConfidence(
    session: ProblemSolvingSession,
  ): number {
    if (!session.outcomes || !session.outcomes.selectedSolutionId) {
      return 0.7; // Default confidence
    }

    // Get the selected solution
    const solution = session.contributions.find(
      (c) => c.id === session.outcomes?.selectedSolutionId,
    );

    if (!solution) {
      return 0.7; // Default confidence
    }

    // Count votes
    const votes = solution.votes || {};
    let upVotes = 0;
    let downVotes = 0;

    for (const [voterId, vote] of Object.entries(votes)) {
      if (vote === VoteType.UP) {
        upVotes++;
      } else if (vote === VoteType.DOWN) {
        downVotes++;
      }
    }

    // Calculate consensus level (0-1)
    const totalVotes = Object.keys(votes).length;
    const consensusLevel = totalVotes > 0 ? upVotes / totalVotes : 0.5;

    // Calculate weighted confidence based on expertise and consensus
    let confidence = 0.6 + consensusLevel * 0.3;

    // Add expertise-based boost if expertise weights are available
    const weights = this.expertiseWeights.get(session.id) || [];

    if (weights.length > 0) {
      // For expertise-based calculations, add a moderate boost
      // A more detailed implementation would be done asynchronously after agent capability checks
      const expertiseBoost = 0.1;
      confidence += expertiseBoost;

      // Try to get contributor expertise information in the background
      // This won't affect the current calculation but will log for future reference
      this.evaluateContributorExpertise(solution.contributorId, weights).catch(
        (error) => {
          this.logger.warn('Error evaluating contributor expertise', {
            contributorId: solution.contributorId,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      );
    }

    // Ensure confidence is between 0 and 1
    return Math.min(0.95, Math.max(0.6, confidence));
  }

  /**
   * Evaluate contributor expertise against weighted expertise requirements
   * This is separated out to allow async evaluation without blocking the confidence calculation
   */
  private async evaluateContributorExpertise(
    contributorId: string,
    weights: ExpertiseWeight[],
  ): Promise<number> {
    const creator = await this.agentRegistry.getAgent(contributorId);
    if (!creator || !creator.getCapabilities) {
      return 0;
    }

    // Get the contributor's capabilities
    const capabilities = creator.getCapabilities();

    // Calculate expertise boost
    let expertiseBoost = 0;

    // Check each capability against the relevant expertise weights
    for (const capability of capabilities) {
      const weight = weights.find(
        (w) =>
          w.expertise === capability.name ||
          (capability.description &&
            capability.description
              .toLowerCase()
              .includes(w.expertise.toLowerCase())),
      );

      if (weight) {
        // Add 0.02-0.05 per relevant expertise
        expertiseBoost += (weight.weight - 1) * 0.025;
      }
    }

    // Cap the expertise boost
    expertiseBoost = Math.min(0.15, expertiseBoost);
    return expertiseBoost;
  }

  /**
   * Extract follow-up actions from session contributions
   */
  private extractFollowupActions(session: ProblemSolvingSession): string[] {
    const followupActions: string[] = [];

    // Look for follow-up actions in contributions
    for (const contribution of session.contributions) {
      // Check for action-oriented content in refinement contributions
      if (contribution.type === 'refinement') {
        const lines = contribution.content.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();

          // Look for action-oriented statements
          if (
            trimmed.startsWith('- [ ]') ||
            trimmed.startsWith('* Next step:') ||
            trimmed.startsWith('Next:') ||
            trimmed.match(/^[0-9]+\.\s+[A-Z]/)
          ) {
            followupActions.push(trimmed.replace(/^[- *\[\]0-9.]+\s*/, ''));
          }
        }
      }
    }

    // Deduplicate actions
    return [...new Set(followupActions)];
  }
}
