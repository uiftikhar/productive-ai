/**
 * Conflict Resolution Service for the Agentic Meeting Analysis System
 *
 * This service handles:
 * - Conflict detection across agent outputs
 * - Structured dialogue protocols for resolution
 * - Reconciliation mechanisms for contradictory findings
 * - Escalation paths for human review
 * - Resolution documentation
 */
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import {
  AgentMessage,
  MessageType,
  AgentOutput,
  ConfidenceLevel,
} from '../interfaces/agent.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  ICommunicationService,
  MessagePriority,
} from '../interfaces/communication.interface';
import { ProtocolMessageType } from './collaborative-protocol.service';

/**
 * Configuration options for ConflictResolutionService
 */
export interface ConflictResolutionServiceConfig {
  communicationService: ICommunicationService;
  logger?: Logger;
  autoResolveThreshold?: number;
  maxDialogueRounds?: number;
  requireHumanApproval?: boolean;
}

/**
 * Conflict status enum
 */
export enum ConflictStatus {
  DETECTED = 'detected',
  IN_DIALOGUE = 'in_dialogue',
  RESOLVED = 'resolved',
  ESCALATED = 'escalated',
  RECONCILED = 'reconciled',
  DOCUMENTED = 'documented',
}

/**
 * Conflict severity levels
 */
export enum ConflictSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Conflict types
 */
export enum ConflictType {
  FACTUAL = 'factual',
  INTERPRETIVE = 'interpretive',
  METHODOLOGICAL = 'methodological',
  TEMPORAL = 'temporal',
  SCOPE = 'scope',
}

/**
 * Resolution strategy types
 */
export enum ResolutionStrategy {
  COMPROMISE = 'compromise',
  EVIDENCE_BASED = 'evidence_based',
  MAJORITY_VOTE = 'majority_vote',
  EXPERT_AUTHORITY = 'expert_authority',
  HUMAN_DECISION = 'human_decision',
  INTEGRATION = 'integration',
}

/**
 * Conflict between agent outputs
 */
export interface Conflict {
  id: string;
  type: ConflictType;
  topic: string;
  participants: string[];
  severity: ConflictSeverity;
  claims: {
    agentId: string;
    claim: any;
    confidence: ConfidenceLevel;
    reasoning?: string;
    evidence?: any;
  }[];
  status: ConflictStatus;
  detectedAt: number;
  resolvedAt?: number;
  resolution?: {
    strategy: ResolutionStrategy;
    outcome: any;
    acceptedBy: string[];
    documentation: string;
  };
  dialogueHistory: {
    messageId: string;
    sender: string;
    content: any;
    timestamp: number;
  }[];
  escalationReason?: string;
  humanInput?: {
    decision: string;
    rationale: string;
    timestamp: number;
  };
}

/**
 * Implementation of conflict resolution service
 */
export class ConflictResolutionService extends EventEmitter {
  private communicationService: ICommunicationService;
  private logger: Logger;
  private autoResolveThreshold: number;
  private maxDialogueRounds: number;
  private requireHumanApproval: boolean;

  private activeConflicts: Map<string, Conflict> = new Map();
  private resolvedConflicts: Conflict[] = [];
  private pendingEscalations: Conflict[] = [];

  /**
   * Create a new conflict resolution service
   */
  constructor(config: ConflictResolutionServiceConfig) {
    super();

    this.communicationService = config.communicationService;
    this.logger = config.logger || new ConsoleLogger();
    this.autoResolveThreshold = config.autoResolveThreshold || 0.8;
    this.maxDialogueRounds = config.maxDialogueRounds || 3;
    this.requireHumanApproval = config.requireHumanApproval || false;

    this.logger.info('Initialized ConflictResolutionService');
  }

  /**
   * Initialize the conflict resolution service
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing conflict resolution service');

      // Set up message handlers
      await this.setupMessageHandlers();

      this.logger.info('Conflict resolution service initialized successfully');
    } catch (error) {
      this.logger.error(
        `Error initializing conflict resolution service: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Detect conflicts between agent outputs
   */
  async detectConflict(
    topic: string,
    agentA: string,
    claimA: any,
    confidenceA: ConfidenceLevel,
    agentB: string,
    claimB: any,
    confidenceB: ConfidenceLevel,
    type: ConflictType = ConflictType.FACTUAL,
  ): Promise<string> {
    this.logger.info(
      `Detecting conflict on topic "${topic}" between agents ${agentA} and ${agentB}`,
    );

    // Generate a conflict ID
    const conflictId = `conflict-${uuidv4()}`;

    // Determine severity based on confidence levels and conflict type
    const severity = this.determineConflictSeverity(
      confidenceA,
      confidenceB,
      type,
    );

    // Create the conflict object
    const conflict: Conflict = {
      id: conflictId,
      type,
      topic,
      participants: [agentA, agentB],
      severity,
      claims: [
        {
          agentId: agentA,
          claim: claimA,
          confidence: confidenceA,
        },
        {
          agentId: agentB,
          claim: claimB,
          confidence: confidenceB,
        },
      ],
      status: ConflictStatus.DETECTED,
      detectedAt: Date.now(),
      dialogueHistory: [],
    };

    // Store the conflict
    this.activeConflicts.set(conflictId, conflict);

    // Notify relevant agents about the conflict
    await this.notifyConflictParticipants(conflictId);

    // Begin resolution process
    setTimeout(() => this.initiateDialogue(conflictId), 1000);

    this.logger.info(`Conflict ${conflictId} detected and registered`);

    return conflictId;
  }

  /**
   * Initiate dialogue for conflict resolution
   */
  async initiateDialogue(conflictId: string): Promise<void> {
    this.logger.info(`Initiating dialogue for conflict ${conflictId}`);

    // Get the conflict
    const conflict = this.activeConflicts.get(conflictId);
    if (!conflict) {
      this.logger.warn(`Conflict not found: ${conflictId}`);
      return;
    }

    // Update status
    conflict.status = ConflictStatus.IN_DIALOGUE;
    this.activeConflicts.set(conflictId, conflict);

    // Determine which resolution strategy to use
    const strategy = this.selectResolutionStrategy(conflict);

    // Create structured dialogue protocol message
    const dialogueMessage: AgentMessage = {
      id: `msg-${uuidv4()}`,
      type: MessageType.REQUEST,
      sender: 'conflict-resolution',
      recipients: conflict.participants,
      content: {
        type: ProtocolMessageType.CONFLICT_NOTIFICATION,
        conflictId,
        topic: conflict.topic,
        conflictType: conflict.type,
        severity: conflict.severity,
        claims: conflict.claims,
        proposedStrategy: strategy,
        instructions: this.getDialogueInstructions(strategy, conflict),
        deadline: Date.now() + 30000, // 30 seconds
      },
      timestamp: Date.now(),
    };

    // Send dialogue initiation message
    await this.communicationService.sendMessage(dialogueMessage, {
      priority: MessagePriority.HIGH,
    });

    // Record in dialogue history
    conflict.dialogueHistory.push({
      messageId: dialogueMessage.id,
      sender: dialogueMessage.sender,
      content: dialogueMessage.content,
      timestamp: dialogueMessage.timestamp,
    });

    this.activeConflicts.set(conflictId, conflict);

    this.logger.info(
      `Dialogue initiated for conflict ${conflictId} using ${strategy} strategy`,
    );
  }

  /**
   * Submit resolution proposal from an agent
   */
  async submitResolutionProposal(
    conflictId: string,
    agentId: string,
    proposal: any,
    reasoning: string,
    evidence?: any,
  ): Promise<void> {
    this.logger.info(
      `Agent ${agentId} submitting resolution proposal for conflict ${conflictId}`,
    );

    // Get the conflict
    const conflict = this.activeConflicts.get(conflictId);
    if (!conflict) {
      throw new Error(`Conflict not found: ${conflictId}`);
    }

    // Verify agent is a participant
    if (!conflict.participants.includes(agentId)) {
      throw new Error(
        `Agent ${agentId} is not a participant in conflict ${conflictId}`,
      );
    }

    // Create resolution proposal message
    const proposalMessage: AgentMessage = {
      id: `msg-${uuidv4()}`,
      type: MessageType.RESPONSE,
      sender: agentId,
      recipients: conflict.participants.filter((p) => p !== agentId),
      content: {
        type: ProtocolMessageType.CONFLICT_RESOLUTION,
        conflictId,
        proposal,
        reasoning,
        evidence,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };

    // Send proposal to other participants
    await this.communicationService.sendMessage(proposalMessage);

    // Record in dialogue history
    conflict.dialogueHistory.push({
      messageId: proposalMessage.id,
      sender: proposalMessage.sender,
      content: proposalMessage.content,
      timestamp: proposalMessage.timestamp,
    });

    this.activeConflicts.set(conflictId, conflict);

    this.logger.info(`Resolution proposal recorded for conflict ${conflictId}`);

    // Check if dialogue should be closed
    if (
      conflict.dialogueHistory.length >=
      this.maxDialogueRounds * conflict.participants.length
    ) {
      await this.processDialogueOutcome(conflictId);
    }
  }

  /**
   * Process dialogue outcome to determine resolution
   */
  async processDialogueOutcome(conflictId: string): Promise<void> {
    this.logger.info(`Processing dialogue outcome for conflict ${conflictId}`);

    // Get the conflict
    const conflict = this.activeConflicts.get(conflictId);
    if (!conflict) {
      this.logger.warn(`Conflict not found: ${conflictId}`);
      return;
    }

    // Analyze dialogue and claims
    const resolutionAnalysis = await this.analyzeDialogue(conflict);

    // Check if resolution threshold is reached
    if (
      (resolutionAnalysis.agreementLevel >= this.autoResolveThreshold &&
        !this.requireHumanApproval) ||
      conflict.severity === ConflictSeverity.LOW
    ) {
      // Auto-resolve the conflict
      await this.resolveConflict(
        conflictId,
        resolutionAnalysis.recommendedStrategy,
        resolutionAnalysis.proposedResolution,
        resolutionAnalysis.documentation,
      );
    } else if (
      conflict.severity === ConflictSeverity.CRITICAL ||
      this.requireHumanApproval
    ) {
      // Escalate to human
      await this.escalateToHuman(
        conflictId,
        `Agreement level ${resolutionAnalysis.agreementLevel} below threshold or critical severity`,
      );
    } else {
      // Try to reconcile with automated methods
      await this.attemptReconciliation(conflictId);
    }
  }

  /**
   * Resolve a conflict
   */
  async resolveConflict(
    conflictId: string,
    strategy: ResolutionStrategy,
    outcome: any,
    documentation: string,
  ): Promise<void> {
    this.logger.info(
      `Resolving conflict ${conflictId} using ${strategy} strategy`,
    );

    // Get the conflict
    const conflict = this.activeConflicts.get(conflictId);
    if (!conflict) {
      this.logger.warn(`Conflict not found: ${conflictId}`);
      return;
    }

    // Update conflict with resolution
    conflict.status = ConflictStatus.RESOLVED;
    conflict.resolvedAt = Date.now();
    conflict.resolution = {
      strategy,
      outcome,
      acceptedBy: conflict.participants,
      documentation,
    };

    // Move from active to resolved
    this.activeConflicts.delete(conflictId);
    this.resolvedConflicts.push(conflict);

    // Notify participants
    await this.communicationService.sendMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.NOTIFICATION,
      sender: 'conflict-resolution',
      recipients: conflict.participants,
      content: {
        type: ProtocolMessageType.CONFLICT_RESOLUTION,
        conflictId,
        status: ConflictStatus.RESOLVED,
        resolution: conflict.resolution,
      },
      timestamp: Date.now(),
    });

    // Emit resolution event
    this.emit('conflict_resolved', {
      conflictId,
      resolution: conflict.resolution,
    });

    this.logger.info(`Conflict ${conflictId} resolved successfully`);
  }

  /**
   * Escalate conflict to human
   */
  async escalateToHuman(conflictId: string, reason: string): Promise<void> {
    this.logger.info(`Escalating conflict ${conflictId} to human: ${reason}`);

    // Get the conflict
    const conflict = this.activeConflicts.get(conflictId);
    if (!conflict) {
      this.logger.warn(`Conflict not found: ${conflictId}`);
      return;
    }

    // Update conflict status
    conflict.status = ConflictStatus.ESCALATED;
    conflict.escalationReason = reason;

    // Add to pending escalations
    this.activeConflicts.delete(conflictId);
    this.pendingEscalations.push(conflict);

    // Notify participants
    await this.communicationService.sendMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.NOTIFICATION,
      sender: 'conflict-resolution',
      recipients: conflict.participants,
      content: {
        type: ProtocolMessageType.CONFLICT_NOTIFICATION,
        conflictId,
        status: ConflictStatus.ESCALATED,
        reason,
      },
      timestamp: Date.now(),
    });

    // Emit escalation event
    this.emit('conflict_escalated', {
      conflictId,
      conflict,
      reason,
    });

    this.logger.info(`Conflict ${conflictId} escalated to human successfully`);
  }

  /**
   * Submit human decision for escalated conflict
   */
  async submitHumanDecision(
    conflictId: string,
    decision: string,
    rationale: string,
  ): Promise<void> {
    this.logger.info(`Receiving human decision for conflict ${conflictId}`);

    // Find the escalated conflict
    const conflictIndex = this.pendingEscalations.findIndex(
      (c) => c.id === conflictId,
    );

    if (conflictIndex === -1) {
      throw new Error(`Escalated conflict not found: ${conflictId}`);
    }

    const conflict = this.pendingEscalations[conflictIndex];

    // Update conflict with human input
    conflict.humanInput = {
      decision,
      rationale,
      timestamp: Date.now(),
    };

    // Remove from pending escalations
    this.pendingEscalations.splice(conflictIndex, 1);

    // Resolve the conflict
    await this.resolveConflict(
      conflictId,
      ResolutionStrategy.HUMAN_DECISION,
      decision,
      `Human decision: ${rationale}`,
    );

    this.logger.info(`Human decision processed for conflict ${conflictId}`);
  }

  /**
   * Attempt to reconcile conflicting claims
   */
  private async attemptReconciliation(conflictId: string): Promise<void> {
    this.logger.info(`Attempting reconciliation for conflict ${conflictId}`);

    // Get the conflict
    const conflict = this.activeConflicts.get(conflictId);
    if (!conflict) {
      this.logger.warn(`Conflict not found: ${conflictId}`);
      return;
    }

    // Create reconciliation message
    const reconciliationPrompt = this.createReconciliationPrompt(conflict);

    // TODO: Use LLM to generate reconciliation
    // For now, we'll simulate a reconciliation outcome

    const simulatedReconciliation = {
      strategy: ResolutionStrategy.INTEGRATION,
      outcome: {
        reconciledClaim:
          'This is a reconciled version of the conflicting claims that takes into account both perspectives.',
        explanation:
          'The reconciliation integrates key points from both agents while prioritizing evidence.',
      },
      documentation:
        'The reconciliation process analyzed the claims from both agents and found a middle ground.',
    };

    // Update conflict status
    conflict.status = ConflictStatus.RECONCILED;

    // Notify participants about reconciliation attempt
    await this.communicationService.sendMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.REQUEST,
      sender: 'conflict-resolution',
      recipients: conflict.participants,
      content: {
        type: ProtocolMessageType.CONFLICT_RESOLUTION,
        conflictId,
        status: ConflictStatus.RECONCILED,
        reconciliationProposal: simulatedReconciliation,
        requestFeedback: true,
        deadline: Date.now() + 20000, // 20 seconds
      },
      timestamp: Date.now(),
    });

    // Set timeout for feedback
    setTimeout(
      () => this.finalizeReconciliation(conflictId, simulatedReconciliation),
      25000,
    );

    this.logger.info(`Reconciliation attempted for conflict ${conflictId}`);
  }

  /**
   * Finalize reconciliation after feedback period
   */
  private async finalizeReconciliation(
    conflictId: string,
    reconciliation: any,
  ): Promise<void> {
    this.logger.info(`Finalizing reconciliation for conflict ${conflictId}`);

    // Get the conflict
    const conflict = this.activeConflicts.get(conflictId);
    if (!conflict) {
      // Conflict might have been resolved already
      return;
    }

    // Resolve with the reconciliation
    await this.resolveConflict(
      conflictId,
      ResolutionStrategy.INTEGRATION,
      reconciliation.outcome,
      reconciliation.documentation,
    );

    this.logger.info(`Reconciliation finalized for conflict ${conflictId}`);
  }

  /**
   * Get pending escalations requiring human input
   */
  getPendingEscalations(): Conflict[] {
    return [...this.pendingEscalations];
  }

  /**
   * Get a conflict by ID
   */
  getConflict(conflictId: string): Conflict | undefined {
    return (
      this.activeConflicts.get(conflictId) ||
      this.resolvedConflicts.find((c) => c.id === conflictId) ||
      this.pendingEscalations.find((c) => c.id === conflictId)
    );
  }

  /**
   * Get resolved conflicts
   */
  getResolvedConflicts(): Conflict[] {
    return [...this.resolvedConflicts];
  }

  /**
   * Private helper methods
   */

  /**
   * Set up message handlers
   */
  private async setupMessageHandlers(): Promise<void> {
    // Monitor for conflict-related messages
    this.communicationService.on('message', async (message: AgentMessage) => {
      const contentType = message.content?.type;

      if (contentType === ProtocolMessageType.CONFLICT_NOTIFICATION) {
        // Handle conflict notification from an agent
        const { topic, counterparty, claim, confidence, conflictType } =
          message.content;

        // Get counterparty's claim if it exists
        const counterpartyClaim = message.content.counterpartyClaim;
        const counterpartyConfidence =
          message.content.counterpartyConfidence || ConfidenceLevel.MEDIUM;

        if (counterparty && counterpartyClaim) {
          // Detect conflict if we have claims from both sides
          await this.detectConflict(
            topic,
            message.sender,
            claim,
            confidence || ConfidenceLevel.MEDIUM,
            counterparty,
            counterpartyClaim,
            counterpartyConfidence,
            conflictType || ConflictType.FACTUAL,
          );
        }
      } else if (contentType === ProtocolMessageType.CONFLICT_RESOLUTION) {
        // Handle resolution proposal
        const { conflictId, proposal, reasoning, evidence } = message.content;

        if (conflictId && proposal) {
          await this.submitResolutionProposal(
            conflictId,
            message.sender,
            proposal,
            reasoning || 'No reasoning provided',
            evidence,
          );
        }
      }
    });
  }

  /**
   * Notify conflict participants about a detected conflict
   */
  private async notifyConflictParticipants(conflictId: string): Promise<void> {
    const conflict = this.activeConflicts.get(conflictId);
    if (!conflict) return;

    // Create notification message
    const notification: AgentMessage = {
      id: `msg-${uuidv4()}`,
      type: MessageType.NOTIFICATION,
      sender: 'conflict-resolution',
      recipients: conflict.participants,
      content: {
        type: ProtocolMessageType.CONFLICT_NOTIFICATION,
        conflictId,
        topic: conflict.topic,
        conflictType: conflict.type,
        severity: conflict.severity,
        claims: conflict.claims,
        detectedAt: conflict.detectedAt,
      },
      timestamp: Date.now(),
    };

    // Send notification
    await this.communicationService.sendMessage(notification);

    // Record in dialogue history
    conflict.dialogueHistory.push({
      messageId: notification.id,
      sender: notification.sender,
      content: notification.content,
      timestamp: notification.timestamp,
    });

    this.activeConflicts.set(conflictId, conflict);
  }

  /**
   * Determine conflict severity
   */
  private determineConflictSeverity(
    confidenceA: ConfidenceLevel,
    confidenceB: ConfidenceLevel,
    type: ConflictType,
  ): ConflictSeverity {
    // Calculate confidence scores
    const confidenceScoreA = this.getConfidenceScore(confidenceA);
    const confidenceScoreB = this.getConfidenceScore(confidenceB);

    // High confidence on both sides indicates more severe conflict
    const averageConfidence = (confidenceScoreA + confidenceScoreB) / 2;

    // Factual conflicts are more severe than interpretive ones
    const typeSeverity = this.getConflictTypeSeverity(type);

    // Combine both factors
    const severityScore = averageConfidence * typeSeverity;

    // Determine severity level
    if (severityScore > 0.8) {
      return ConflictSeverity.CRITICAL;
    } else if (severityScore > 0.6) {
      return ConflictSeverity.HIGH;
    } else if (severityScore > 0.4) {
      return ConflictSeverity.MEDIUM;
    } else {
      return ConflictSeverity.LOW;
    }
  }

  /**
   * Get confidence score from confidence level
   */
  private getConfidenceScore(confidence: ConfidenceLevel): number {
    switch (confidence) {
      case ConfidenceLevel.HIGH:
        return 1.0;
      case ConfidenceLevel.MEDIUM:
        return 0.7;
      case ConfidenceLevel.LOW:
        return 0.4;
      case ConfidenceLevel.UNCERTAIN:
        return 0.2;
      default:
        return 0.5;
    }
  }

  /**
   * Get severity weight for conflict type
   */
  private getConflictTypeSeverity(type: ConflictType): number {
    switch (type) {
      case ConflictType.FACTUAL:
        return 1.0; // Most severe
      case ConflictType.METHODOLOGICAL:
        return 0.8;
      case ConflictType.TEMPORAL:
        return 0.7;
      case ConflictType.SCOPE:
        return 0.6;
      case ConflictType.INTERPRETIVE:
        return 0.5; // Least severe
      default:
        return 0.7;
    }
  }

  /**
   * Select an appropriate resolution strategy for a conflict
   */
  private selectResolutionStrategy(conflict: Conflict): ResolutionStrategy {
    // Strategy selection logic
    switch (conflict.severity) {
      case ConflictSeverity.CRITICAL:
        return this.requireHumanApproval
          ? ResolutionStrategy.HUMAN_DECISION
          : ResolutionStrategy.EVIDENCE_BASED;

      case ConflictSeverity.HIGH:
        return ResolutionStrategy.EVIDENCE_BASED;

      case ConflictSeverity.MEDIUM:
        return conflict.type === ConflictType.FACTUAL
          ? ResolutionStrategy.EVIDENCE_BASED
          : ResolutionStrategy.INTEGRATION;

      case ConflictSeverity.LOW:
        return ResolutionStrategy.COMPROMISE;

      default:
        return ResolutionStrategy.INTEGRATION;
    }
  }

  /**
   * Get dialogue instructions based on resolution strategy
   */
  private getDialogueInstructions(
    strategy: ResolutionStrategy,
    conflict: Conflict,
  ): string {
    switch (strategy) {
      case ResolutionStrategy.EVIDENCE_BASED:
        return 'Present evidence to support your claim. Focus on facts and provide specific references where possible.';

      case ResolutionStrategy.COMPROMISE:
        return 'Consider areas where your position can be adjusted. Identify common ground with the opposing view.';

      case ResolutionStrategy.INTEGRATION:
        return 'Propose a solution that integrates elements from both perspectives. Focus on creating a comprehensive view.';

      case ResolutionStrategy.MAJORITY_VOTE:
        return 'Present your position clearly. Other agents will evaluate all claims, and the majority position will be adopted.';

      case ResolutionStrategy.EXPERT_AUTHORITY:
        return `This is a ${conflict.type} conflict. The agent with the most relevant expertise will have priority in resolution.`;

      case ResolutionStrategy.HUMAN_DECISION:
        return 'Clearly articulate your position and reasoning. This conflict will be escalated for human review.';

      default:
        return 'Present your perspective and reasoning. Be prepared to engage in constructive dialogue.';
    }
  }

  /**
   * Analyze dialogue to determine resolution
   */
  private async analyzeDialogue(conflict: Conflict): Promise<{
    agreementLevel: number;
    recommendedStrategy: ResolutionStrategy;
    proposedResolution: any;
    documentation: string;
  }> {
    // In a real implementation, this would use LLM or other analysis methods
    // For now, we'll return a simulated analysis

    return {
      agreementLevel: 0.6, // Moderate agreement level
      recommendedStrategy: ResolutionStrategy.INTEGRATION,
      proposedResolution: {
        integratedClaim:
          'This is an integrated version of the conflicting claims',
      },
      documentation:
        'This resolution combines key elements from all perspectives while prioritizing factual accuracy.',
    };
  }

  /**
   * Create a reconciliation prompt
   */
  private createReconciliationPrompt(conflict: Conflict): string {
    // Format claims
    const claimsText = conflict.claims
      .map(
        (c) =>
          `Agent ${c.agentId} (Confidence: ${c.confidence}): ${JSON.stringify(c.claim)}`,
      )
      .join('\n\n');

    // Basic prompt format
    return `
# Conflict Reconciliation Request

## Topic: ${conflict.topic}
## Type: ${conflict.type}
## Severity: ${conflict.severity}

## Conflicting Claims:
${claimsText}

## Dialogue History:
${conflict.dialogueHistory
  .map(
    (m) =>
      `- ${new Date(m.timestamp).toISOString()} | ${m.sender}: ${JSON.stringify(m.content)}`,
  )
  .join('\n')}

## Reconciliation Task:
Please analyze these conflicting claims and generate a reconciled version that:
1. Preserves the most important factual information from both sides
2. Resolves contradictions in a principled manner
3. Acknowledges uncertainty where appropriate
4. Provides a clear, coherent perspective that integrates insights from both claims

Return your reconciliation in JSON format with:
- reconciledClaim: The integrated claim
- explanation: Reasoning for how the reconciliation was performed
- confidenceScore: Confidence in the reconciliation (0-1)
`;
  }
}
