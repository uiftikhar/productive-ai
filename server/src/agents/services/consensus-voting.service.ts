/**
 * Consensus Voting Service
 *
 * Provides mechanisms for agents to vote on decisions and reach consensus
 * through democratic processes rather than top-down control
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { AgentRegistryService } from './agent-registry.service';
import { EventEmitter } from 'events';

/**
 * Voting session structure
 */
export interface VotingSession {
  id: string;
  title: string;
  description: string;
  creator: {
    id: string;
    name: string;
  };
  options: string[];
  votes: Record<
    string,
    {
      option: string;
      timestamp: number;
      reasoning?: string;
    }
  >;
  eligibleVoters: string[]; // Agent IDs allowed to vote
  status: 'open' | 'closed';
  createdAt: number;
  closesAt: number;
  result?: VotingResult;
  metadata?: Record<string, any>;
}

/**
 * Voting result structure
 */
export interface VotingResult {
  winningOption: string;
  tally: Record<string, number>;
  voterCount: number;
  eligibleVoterCount: number;
  participationRate: number;
  consensusLevel: number; // 0-1 indicating consensus strength
  timestamp: number;
}

/**
 * Vote structure
 */
export interface Vote {
  sessionId: string;
  voterId: string;
  voterName: string;
  option: string;
  reasoning?: string;
  timestamp: number;
}

/**
 * Create voting session options
 */
export interface CreateVotingSessionOptions {
  title: string;
  description: string;
  options: string[];
  eligibleVoters?: string[]; // If empty, all agents can vote
  duration?: number; // Duration in milliseconds
  autoClose?: boolean; // Automatically close when all eligible voters vote
  metadata?: Record<string, any>;
  consensusThreshold?: number; // Threshold for unanimous consensus (0-1)
}

/**
 * Voting events
 */
export enum VotingEventType {
  SESSION_CREATED = 'session-created',
  VOTE_CAST = 'vote-cast',
  SESSION_CLOSED = 'session-closed',
  CONSENSUS_REACHED = 'consensus-reached',
}

/**
 * Configuration for ConsensusVotingService
 */
export interface ConsensusVotingConfig {
  logger?: Logger;
  agentRegistry?: AgentRegistryService;
  defaultVotingDuration?: number;
  defaultConsensusThreshold?: number;
}

/**
 * Service for facilitating consensus voting among agents
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export class ConsensusVotingService {
  private static instance: ConsensusVotingService;
  private logger: Logger;
  private agentRegistry: AgentRegistryService;
  private eventEmitter: EventEmitter = new EventEmitter();

  // Settings
  private defaultVotingDuration: number = 5 * 60 * 1000; // 5 minutes
  private defaultConsensusThreshold: number = 0.7; // 70% agreement

  // Storage
  private votingSessions: Map<string, VotingSession> = new Map();
  private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private subscriptions: Map<
    string,
    {
      callback: (event: any) => void;
      types?: VotingEventType[];
    }
  > = new Map();

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: ConsensusVotingConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.agentRegistry =
      config.agentRegistry || AgentRegistryService.getInstance();

    if (config.defaultVotingDuration) {
      this.defaultVotingDuration = config.defaultVotingDuration;
    }

    if (config.defaultConsensusThreshold) {
      this.defaultConsensusThreshold = config.defaultConsensusThreshold;
    }

    this.logger.info('Initialized ConsensusVotingService');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    config: ConsensusVotingConfig = {},
  ): ConsensusVotingService {
    if (!ConsensusVotingService.instance) {
      ConsensusVotingService.instance = new ConsensusVotingService(config);
    }
    return ConsensusVotingService.instance;
  }

  /**
   * Create a new voting session
   */
  createVotingSession(
    creatorId: string,
    options: CreateVotingSessionOptions,
  ): VotingSession {
    const creator = this.agentRegistry.getAgent(creatorId);
    if (!creator) {
      throw new Error(`Creator agent not found: ${creatorId}`);
    }

    if (!options.title || !options.options || options.options.length < 2) {
      throw new Error(
        'Invalid voting session: requires title and at least 2 options',
      );
    }

    const sessionId = uuidv4();
    const now = Date.now();
    const duration = options.duration || this.defaultVotingDuration;

    // Determine eligible voters
    let eligibleVoters: string[] = [];
    if (options.eligibleVoters && options.eligibleVoters.length > 0) {
      eligibleVoters = options.eligibleVoters;
    } else {
      // If no eligible voters specified, all agents can vote
      eligibleVoters = this.agentRegistry.listAgents().map((agent) => agent.id);
    }

    // Create the session
    const session: VotingSession = {
      id: sessionId,
      title: options.title,
      description: options.description,
      creator: {
        id: creator.id,
        name: creator.name,
      },
      options: options.options,
      votes: {},
      eligibleVoters,
      status: 'open',
      createdAt: now,
      closesAt: now + duration,
      metadata: {
        ...options.metadata,
        autoClose: options.autoClose,
        consensusThreshold:
          options.consensusThreshold || this.defaultConsensusThreshold,
      },
    };

    // Store the session
    this.votingSessions.set(sessionId, session);

    // Set a timeout to close the session
    const timeout = setTimeout(() => {
      this.closeVotingSession(sessionId);
    }, duration);

    this.sessionTimeouts.set(sessionId, timeout);

    // Emit event
    this.emitEvent({
      type: VotingEventType.SESSION_CREATED,
      sessionId,
      creatorId: creator.id,
      title: options.title,
      options: options.options,
      eligibleVoterCount: eligibleVoters.length,
      deadline: new Date(session.closesAt).toISOString(),
      timestamp: now,
    });

    // Notify eligible voters
    this.notifyEligibleVoters(session);

    return session;
  }

  /**
   * Notify eligible voters about a voting session
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private async notifyEligibleVoters(session: VotingSession): Promise<void> {
    for (const voterId of session.eligibleVoters) {
      const voter = this.agentRegistry.getAgent(voterId);
      if (!voter) continue;

      try {
        // Skip notifying the creator
        if (voterId === session.creator.id) continue;

        // Check if agent has a vote capability
        const capabilities = voter.getCapabilities();
        const canVote = capabilities.some(
          (cap) => cap.name === 'voting' || cap.name === 'consensus-voting',
        );

        if (!canVote) continue;

        // Create notification payload as string
        const notificationPayload = JSON.stringify({
          type: 'voting-notification',
          sessionId: session.id,
          title: session.title,
          description: session.description,
          options: session.options,
          createdBy: session.creator.name,
          deadline: new Date(session.closesAt).toISOString(),
        });

        // Notify the agent
        await voter.execute({
          capability: 'voting',
          input: notificationPayload,
          parameters: {
            isVotingNotification: true,
          },
        });
      } catch (error) {
        this.logger.warn(`Failed to notify voter ${voterId}`, { error });
      }
    }
  }

  /**
   * Cast a vote in a voting session
   */
  castVote(vote: Omit<Vote, 'timestamp'>): Vote {
    const session = this.votingSessions.get(vote.sessionId);
    if (!session) {
      throw new Error(`Voting session not found: ${vote.sessionId}`);
    }

    if (session.status === 'closed') {
      throw new Error(`Voting session is closed: ${vote.sessionId}`);
    }

    // Verify voter is eligible
    if (!session.eligibleVoters.includes(vote.voterId)) {
      throw new Error(
        `Voter ${vote.voterId} is not eligible for session ${vote.sessionId}`,
      );
    }

    // Verify option is valid
    if (!session.options.includes(vote.option)) {
      throw new Error(`Invalid voting option: ${vote.option}`);
    }

    const now = Date.now();

    // Record the vote
    session.votes[vote.voterId] = {
      option: vote.option,
      timestamp: now,
      reasoning: vote.reasoning,
    };

    this.votingSessions.set(vote.sessionId, session);

    // Check if auto-close is enabled and all eligible voters have voted
    if (
      session.metadata?.autoClose &&
      Object.keys(session.votes).length === session.eligibleVoters.length
    ) {
      this.closeVotingSession(vote.sessionId);
    }

    // Check if consensus has been reached
    this.checkConsensus(vote.sessionId);

    // Complete vote object
    const completeVote: Vote = {
      ...vote,
      timestamp: now,
    };

    // Emit event
    this.emitEvent({
      type: VotingEventType.VOTE_CAST,
      sessionId: vote.sessionId,
      voterId: vote.voterId,
      voterName: vote.voterName,
      option: vote.option,
      timestamp: now,
    });

    return completeVote;
  }

  /**
   * Check if consensus has been reached
   */
  private checkConsensus(sessionId: string): boolean {
    const session = this.votingSessions.get(sessionId);
    if (!session || session.status === 'closed') return false;

    // Only check if at least 2 votes have been cast
    const votesCount = Object.keys(session.votes).length;
    if (votesCount < 2) return false;

    // Calculate vote tallies
    const tally: Record<string, number> = {};
    for (const option of session.options) {
      tally[option] = 0;
    }

    for (const vote of Object.values(session.votes)) {
      tally[vote.option] = (tally[vote.option] || 0) + 1;
    }

    // Find the option with the most votes
    let maxVotes = 0;
    let winningOption = '';

    for (const [option, count] of Object.entries(tally)) {
      if (count > maxVotes) {
        maxVotes = count;
        winningOption = option;
      }
    }

    // Calculate consensus level (percentage of votes for winning option)
    const consensusLevel = maxVotes / votesCount;

    // Get consensus threshold
    const threshold =
      session.metadata?.consensusThreshold || this.defaultConsensusThreshold;

    // Check if consensus has been reached
    if (consensusLevel >= threshold) {
      // Emit consensus reached event
      this.emitEvent({
        type: VotingEventType.CONSENSUS_REACHED,
        sessionId,
        winningOption,
        consensusLevel,
        votesForWinner: maxVotes,
        totalVotes: votesCount,
        timestamp: Date.now(),
      });

      return true;
    }

    return false;
  }

  /**
   * Close a voting session and calculate results
   */
  closeVotingSession(sessionId: string): VotingResult {
    const session = this.votingSessions.get(sessionId);
    if (!session) {
      throw new Error(`Voting session not found: ${sessionId}`);
    }

    if (session.status === 'closed') {
      return session.result!;
    }

    // Clear any timeout
    const timeout = this.sessionTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(sessionId);
    }

    // Calculate vote tallies
    const tally: Record<string, number> = {};
    for (const option of session.options) {
      tally[option] = 0;
    }

    for (const vote of Object.values(session.votes)) {
      tally[vote.option] = (tally[vote.option] || 0) + 1;
    }

    // Find the option with the most votes
    let maxVotes = 0;
    let winningOption = '';

    for (const [option, count] of Object.entries(tally)) {
      if (count > maxVotes) {
        maxVotes = count;
        winningOption = option;
      }
    }

    // In case of tie, choose the first option alphabetically for determinism
    if (maxVotes === 0) {
      winningOption = session.options[0];
    }

    const votesCount = Object.keys(session.votes).length;
    const eligibleCount = session.eligibleVoters.length;

    // Calculate consensus level (percentage of votes for winning option)
    const consensusLevel = votesCount > 0 ? maxVotes / votesCount : 0;

    // Create result
    const result: VotingResult = {
      winningOption,
      tally,
      voterCount: votesCount,
      eligibleVoterCount: eligibleCount,
      participationRate: eligibleCount > 0 ? votesCount / eligibleCount : 0,
      consensusLevel,
      timestamp: Date.now(),
    };

    // Update session
    session.status = 'closed';
    session.result = result;
    this.votingSessions.set(sessionId, session);

    // Emit event
    this.emitEvent({
      type: VotingEventType.SESSION_CLOSED,
      sessionId,
      result,
      timestamp: result.timestamp,
    });

    return result;
  }

  /**
   * Get a voting session by ID
   */
  getVotingSession(sessionId: string): VotingSession | undefined {
    return this.votingSessions.get(sessionId);
  }

  /**
   * Get all active voting sessions
   */
  getActiveVotingSessions(): VotingSession[] {
    return Array.from(this.votingSessions.values()).filter(
      (session) => session.status === 'open',
    );
  }

  /**
   * Get a list of voting sessions (with optional filtering)
   */
  listVotingSessions(options?: {
    status?: 'open' | 'closed';
    creatorId?: string;
    voterId?: string;
  }): VotingSession[] {
    let sessions = Array.from(this.votingSessions.values());

    // Apply filters
    if (options?.status) {
      sessions = sessions.filter((s) => s.status === options.status);
    }

    if (options?.creatorId) {
      sessions = sessions.filter((s) => s.creator.id === options.creatorId);
    }

    if (options?.voterId) {
      sessions = sessions.filter((s) =>
        s.eligibleVoters.includes(options.voterId!),
      );
    }

    return sessions;
  }

  /**
   * Subscribe to voting events
   */
  subscribe(
    callback: (event: any) => void,
    eventTypes?: VotingEventType[],
  ): string {
    const subscriptionId = uuidv4();

    this.subscriptions.set(subscriptionId, {
      callback,
      types: eventTypes,
    });

    return subscriptionId;
  }

  /**
   * Unsubscribe from voting events
   */
  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Emit a voting event
   */
  private emitEvent(event: any): void {
    // Deliver to all matching subscribers
    for (const [id, subscription] of this.subscriptions.entries()) {
      // Skip if subscription specifies event types and this doesn't match
      if (
        subscription.types &&
        !subscription.types.includes(event.type as VotingEventType)
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

  /**
   * Clean up resources
   */
  cleanup(): void {
    // Clear all timeouts
    for (const timeout of this.sessionTimeouts.values()) {
      clearTimeout(timeout);
    }

    this.sessionTimeouts.clear();

    // Close any open sessions
    for (const [sessionId, session] of this.votingSessions.entries()) {
      if (session.status === 'open') {
        try {
          this.closeVotingSession(sessionId);
        } catch (error) {
          this.logger.warn(
            `Error closing session ${sessionId} during cleanup`,
            { error },
          );
        }
      }
    }
  }
}
