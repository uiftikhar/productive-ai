import { v4 as uuidv4 } from 'uuid';

import { AgentMessagingService } from './agent-messaging.service';
import { AgentRegistryService } from './agent-registry.service';
import { DialogueManagementService } from './dialogue-management.service';
import { RequestFormulationService } from './request-formulation.service';
import { ResponseGenerationService } from './response-generation.service';

import {
  MessageIntent,
  NaturalAgentMessage,
  CommunicationModality,
} from '../interfaces/message-protocol.interface';

import {
  DialogueType,
  DialoguePhase,
  NegotiationState,
} from '../interfaces/dialogue-system.interface';

/**
 * Service for handling agent-to-agent negotiations
 */
export class NegotiationDialogueService {
  private readonly negotiations: Map<string, NegotiationState> = new Map();

  constructor(
    private readonly messaging: AgentMessagingService,
    private readonly dialogueManagement: DialogueManagementService,
    private readonly requestFormulation: RequestFormulationService,
    private readonly responseGeneration: ResponseGenerationService,
    private readonly agentRegistry: AgentRegistryService,
  ) {
    // Listen for negotiation-related messages
    this.subscribeToNegotiationMessages();
  }

  /**
   * Start a negotiation between agents
   */
  async initiateNegotiation(
    initiatorId: string,
    parties: string[],
    topic: string,
    initialProposal: any,
    constraints?: any[],
    deadline?: number,
    resolutionStrategy:
      | 'consensus'
      | 'majority'
      | 'authority'
      | 'compromise' = 'consensus',
    priorities?: Record<string, Record<string, number>>,
  ): Promise<NegotiationState> {
    // Create a dialogue for this negotiation
    const dialogue = await this.dialogueManagement.initiateDialogue(
      initiatorId,
      parties,
      DialogueType.NEGOTIATION,
      topic,
    );

    // Create negotiation state
    const now = Date.now();
    const negotiationId = uuidv4();

    const negotiation: NegotiationState = {
      negotiationId,
      dialogueId: dialogue.dialogueId,
      topic,
      parties: [initiatorId, ...parties.filter((p) => p !== initiatorId)],
      startTime: now,
      lastUpdateTime: now,
      status: 'proposed',
      currentProposal: initialProposal,
      proposalHistory: [
        {
          proposerId: initiatorId,
          proposal: initialProposal,
          timestamp: now,
          status: 'proposed',
        },
      ],
      agreements: [],
      disagreements: [],
      deadline,
      resolutionStrategy,
      priorities,
    };

    // Store the negotiation
    this.negotiations.set(negotiationId, negotiation);

    // Send initial proposal to all parties
    for (const partyId of parties) {
      if (partyId !== initiatorId) {
        await this.sendProposal(
          initiatorId,
          partyId,
          negotiationId,
          initialProposal,
          constraints,
          dialogue.conversationId,
        );
      }
    }

    return negotiation;
  }

  /**
   * Get negotiation state by ID
   */
  getNegotiation(negotiationId: string): NegotiationState | undefined {
    return this.negotiations.get(negotiationId);
  }

  /**
   * Send a proposal to a party
   */
  async sendProposal(
    senderId: string,
    recipientId: string,
    negotiationId: string,
    proposal: any,
    constraints?: any[],
    conversationId?: string,
  ): Promise<NaturalAgentMessage> {
    const negotiation = this.negotiations.get(negotiationId);

    if (!negotiation) {
      throw new Error(`Negotiation with ID ${negotiationId} not found`);
    }

    // Create proposal message
    const message = await this.requestFormulation.createProposalRequest(
      senderId,
      recipientId,
      negotiation.topic,
      [proposal],
      constraints,
      { negotiationId },
      negotiation.deadline,
    );

    // Update negotiation state
    this.addProposal(negotiationId, senderId, proposal, 'proposed');

    return message;
  }

  /**
   * Generate a counter proposal
   */
  async sendCounterProposal(
    senderId: string,
    recipientId: string,
    negotiationId: string,
    counterProposal: any,
    reason?: string,
  ): Promise<NaturalAgentMessage> {
    const negotiation = this.negotiations.get(negotiationId);

    if (!negotiation) {
      throw new Error(`Negotiation with ID ${negotiationId} not found`);
    }

    // Find the original proposal message
    // This would be more robust in a real implementation
    // Here we're assuming the original proposal is the last one in the history
    // from the recipient to the sender

    // Get the dialogue
    const dialogue = this.dialogueManagement.getDialogue(
      negotiation.dialogueId,
    );
    if (!dialogue) {
      throw new Error(`Dialogue with ID ${negotiation.dialogueId} not found`);
    }

    // Get conversation messages
    const messages = this.messaging.getConversationMessages(
      dialogue.conversationId,
    );

    // Find the last proposal from recipient to sender
    const lastProposal = messages
      .filter(
        (m) =>
          m.senderId === recipientId &&
          m.recipientId === senderId &&
          [MessageIntent.PROPOSE, MessageIntent.COUNTER_PROPOSE].includes(
            m.intent,
          ),
      )
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (!lastProposal) {
      throw new Error(
        `No previous proposal found from ${recipientId} to ${senderId}`,
      );
    }

    // Create counter proposal response
    const response = await this.responseGeneration.generateNegotiationResponse(
      lastProposal,
      'counter',
      counterProposal,
      reason,
    );

    // Update negotiation state
    this.addProposal(negotiationId, senderId, counterProposal, 'countered');

    // Update the current proposal
    negotiation.currentProposal = counterProposal;
    this.negotiations.set(negotiationId, negotiation);

    return response;
  }

  /**
   * Accept a proposal
   */
  async acceptProposal(
    senderId: string,
    negotiationId: string,
    acceptanceTerms?: any,
  ): Promise<NaturalAgentMessage> {
    const negotiation = this.negotiations.get(negotiationId);

    if (!negotiation) {
      throw new Error(`Negotiation with ID ${negotiationId} not found`);
    }

    // Find the current proposal message (similar to counter proposal)
    const dialogue = this.dialogueManagement.getDialogue(
      negotiation.dialogueId,
    );
    if (!dialogue) {
      throw new Error(`Dialogue with ID ${negotiation.dialogueId} not found`);
    }

    // Get conversation messages
    const messages = this.messaging.getConversationMessages(
      dialogue.conversationId,
    );

    // Find who sent the current proposal
    const currentProposalRecord = negotiation.proposalHistory
      .filter((p) => p.proposal === negotiation.currentProposal)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (!currentProposalRecord) {
      throw new Error(`Current proposal record not found`);
    }

    // Find the message for that proposal
    const proposalMessage = messages
      .filter(
        (m) =>
          m.senderId === currentProposalRecord.proposerId &&
          m.timestamp >= currentProposalRecord.timestamp - 1000 && // Allow for slight timestamp differences
          [MessageIntent.PROPOSE, MessageIntent.COUNTER_PROPOSE].includes(
            m.intent,
          ),
      )
      .sort(
        (a, b) =>
          Math.abs(a.timestamp - currentProposalRecord.timestamp) -
          Math.abs(b.timestamp - currentProposalRecord.timestamp),
      )[0];

    if (!proposalMessage) {
      throw new Error(
        `Proposal message not found for proposal by ${currentProposalRecord.proposerId}`,
      );
    }

    // Create acceptance response
    const response = await this.responseGeneration.generateNegotiationResponse(
      proposalMessage,
      'accept',
      acceptanceTerms || negotiation.currentProposal,
    );

    // Update the negotiation state
    negotiation.status = 'resolved';
    negotiation.agreements.push({
      proposal: negotiation.currentProposal,
      agreedBy: senderId,
      timestamp: Date.now(),
    });

    // Update proposal history
    currentProposalRecord.status = 'accepted';
    negotiation.proposalHistory = negotiation.proposalHistory.map((p) =>
      p.proposal === currentProposalRecord.proposal ? currentProposalRecord : p,
    );

    this.negotiations.set(negotiationId, negotiation);

    // Complete the dialogue
    this.dialogueManagement.completeDialogue(
      negotiation.dialogueId,
      'completed',
      `Negotiation completed with acceptance by ${senderId}`,
    );

    return response;
  }

  /**
   * Reject a proposal
   */
  async rejectProposal(
    senderId: string,
    negotiationId: string,
    reason?: string,
  ): Promise<NaturalAgentMessage> {
    const negotiation = this.negotiations.get(negotiationId);

    if (!negotiation) {
      throw new Error(`Negotiation with ID ${negotiationId} not found`);
    }

    // Find the current proposal message (similar to accept)
    const dialogue = this.dialogueManagement.getDialogue(
      negotiation.dialogueId,
    );
    if (!dialogue) {
      throw new Error(`Dialogue with ID ${negotiation.dialogueId} not found`);
    }

    // Get conversation messages
    const messages = this.messaging.getConversationMessages(
      dialogue.conversationId,
    );

    // Find who sent the current proposal
    const currentProposalRecord = negotiation.proposalHistory
      .filter((p) => p.proposal === negotiation.currentProposal)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (!currentProposalRecord) {
      throw new Error(`Current proposal record not found`);
    }

    // Find the message for that proposal
    const proposalMessage = messages
      .filter(
        (m) =>
          m.senderId === currentProposalRecord.proposerId &&
          m.timestamp >= currentProposalRecord.timestamp - 1000 && // Allow for slight timestamp differences
          [MessageIntent.PROPOSE, MessageIntent.COUNTER_PROPOSE].includes(
            m.intent,
          ),
      )
      .sort(
        (a, b) =>
          Math.abs(a.timestamp - currentProposalRecord.timestamp) -
          Math.abs(b.timestamp - currentProposalRecord.timestamp),
      )[0];

    if (!proposalMessage) {
      throw new Error(
        `Proposal message not found for proposal by ${currentProposalRecord.proposerId}`,
      );
    }

    // Create rejection response
    const response = await this.responseGeneration.generateNegotiationResponse(
      proposalMessage,
      'reject',
      { reason: reason || 'Proposal rejected' },
    );

    // Update the negotiation state
    negotiation.status = 'abandoned';
    negotiation.disagreements.push({
      proposal: negotiation.currentProposal,
      rejectedBy: senderId,
      reason,
      timestamp: Date.now(),
    });

    // Update proposal history
    currentProposalRecord.status = 'rejected';
    negotiation.proposalHistory = negotiation.proposalHistory.map((p) =>
      p.proposal === currentProposalRecord.proposal ? currentProposalRecord : p,
    );

    this.negotiations.set(negotiationId, negotiation);

    // Complete the dialogue
    this.dialogueManagement.completeDialogue(
      negotiation.dialogueId,
      'abandoned',
      `Negotiation abandoned with rejection by ${senderId}: ${reason || 'No reason provided'}`,
    );

    return response;
  }

  /**
   * Check if a negotiation has reached resolution conditions
   */
  checkResolutionStatus(
    negotiationId: string,
  ): 'pending' | 'resolved' | 'abandoned' {
    const negotiation = this.negotiations.get(negotiationId);

    if (!negotiation) {
      throw new Error(`Negotiation with ID ${negotiationId} not found`);
    }

    // If already resolved or abandoned, return that status
    if (
      negotiation.status === 'resolved' ||
      negotiation.status === 'abandoned'
    ) {
      return negotiation.status;
    }

    // Check if deadline passed
    if (negotiation.deadline && Date.now() > negotiation.deadline) {
      negotiation.status = 'abandoned';
      this.negotiations.set(negotiationId, negotiation);
      return 'abandoned';
    }

    // Check resolution strategy conditions
    switch (negotiation.resolutionStrategy) {
      case 'consensus':
        // Check if all parties have agreed
        const agreements = new Set(
          negotiation.agreements.map((a) => a.agreedBy),
        );
        if (negotiation.parties.every((p) => agreements.has(p))) {
          negotiation.status = 'resolved';
          this.negotiations.set(negotiationId, negotiation);
          return 'resolved';
        }
        break;

      case 'majority':
        // Check if majority of parties have agreed
        if (negotiation.agreements.length > negotiation.parties.length / 2) {
          negotiation.status = 'resolved';
          this.negotiations.set(negotiationId, negotiation);
          return 'resolved';
        }
        break;

      // Other strategies would be handled similarly
    }

    return 'pending';
  }

  // Private helper methods

  /**
   * Subscribe to negotiation-related messages
   */
  private subscribeToNegotiationMessages(): void {
    // Subscribe to all negotiation-related intents
    const negotiationIntents = [
      MessageIntent.PROPOSE,
      MessageIntent.COUNTER_PROPOSE,
      MessageIntent.ACCEPT,
      MessageIntent.REJECT,
    ];

    this.messaging.subscribeToMessages(
      'negotiation-service',
      async (message) => {
        if (negotiationIntents.includes(message.intent)) {
          // Process the message
          await this.processNegotiationMessage(message);
        }
      },
    );
  }

  /**
   * Process a negotiation-related message
   */
  private async processNegotiationMessage(
    message: NaturalAgentMessage,
  ): Promise<void> {
    // Check if this message is related to an existing negotiation
    const negotiationId = this.findNegotiationIdForMessage(message);

    if (!negotiationId) {
      return; // Not related to a tracked negotiation
    }

    const negotiation = this.negotiations.get(negotiationId);
    if (!negotiation) {
      return;
    }

    // Update the negotiation's last update time
    negotiation.lastUpdateTime = message.timestamp;
    this.negotiations.set(negotiationId, negotiation);

    // Process based on intent
    switch (message.intent) {
      case MessageIntent.PROPOSE:
        // Extract proposal content
        await this.extractAndTrackProposal(message, negotiationId);
        break;

      case MessageIntent.COUNTER_PROPOSE:
        // Extract counter proposal
        await this.extractAndTrackProposal(message, negotiationId, 'countered');
        break;

      case MessageIntent.ACCEPT:
        // Track acceptance
        await this.trackAcceptance(message, negotiationId);
        break;

      case MessageIntent.REJECT:
        // Track rejection
        await this.trackRejection(message, negotiationId);
        break;
    }

    // Check if resolution conditions are met
    this.checkResolutionStatus(negotiationId);
  }

  /**
   * Find which negotiation a message belongs to
   */
  private findNegotiationIdForMessage(
    message: NaturalAgentMessage,
  ): string | undefined {
    // Check message metadata
    if (message.metadata?.negotiationId) {
      return message.metadata.negotiationId as string;
    }

    // Check message content
    if (message.modality === CommunicationModality.STRUCTURED_DATA) {
      const content = message.content as any;

      if (content?.negotiationId) {
        return content.negotiationId;
      }

      if (content?.context?.negotiationId) {
        return content.context.negotiationId;
      }
    }

    // Try to find by dialogue ID
    for (const [id, negotiation] of this.negotiations.entries()) {
      // Find the dialogue
      const dialogue = this.dialogueManagement.getDialogue(
        negotiation.dialogueId,
      );

      if (dialogue && dialogue.conversationId === message.conversationId) {
        return id;
      }
    }

    return undefined;
  }

  /**
   * Extract and track a proposal from a message
   */
  private async extractAndTrackProposal(
    message: NaturalAgentMessage,
    negotiationId: string,
    status: 'proposed' | 'countered' = 'proposed',
  ): Promise<void> {
    const negotiation = this.negotiations.get(negotiationId);
    if (!negotiation) return;

    // Extract proposal content
    let proposal: any;

    if (message.modality === CommunicationModality.STRUCTURED_DATA) {
      const content = message.content as any;

      if (content?.content?.proposal) {
        proposal = content.content.proposal;
      } else if (Array.isArray(content?.content)) {
        proposal = content.content[0];
      } else {
        proposal = content;
      }
    } else {
      // For non-structured messages, use the whole content
      proposal = message.content;
    }

    // Add to proposal history
    this.addProposal(negotiationId, message.senderId, proposal, status);

    // Update current proposal
    negotiation.currentProposal = proposal;
    this.negotiations.set(negotiationId, negotiation);
  }

  /**
   * Track acceptance of a proposal
   */
  private async trackAcceptance(
    message: NaturalAgentMessage,
    negotiationId: string,
  ): Promise<void> {
    const negotiation = this.negotiations.get(negotiationId);
    if (!negotiation) return;

    // Add to agreements
    negotiation.agreements.push({
      proposal: negotiation.currentProposal,
      agreedBy: message.senderId,
      timestamp: message.timestamp,
    });

    // Update in store
    this.negotiations.set(negotiationId, negotiation);
  }

  /**
   * Track rejection of a proposal
   */
  private async trackRejection(
    message: NaturalAgentMessage,
    negotiationId: string,
  ): Promise<void> {
    const negotiation = this.negotiations.get(negotiationId);
    if (!negotiation) return;

    // Extract reason if available
    let reason: string | undefined;

    if (message.modality === CommunicationModality.STRUCTURED_DATA) {
      const content = message.content as any;
      reason = content?.content?.reason || content?.reason;
    }

    // Add to disagreements
    negotiation.disagreements.push({
      proposal: negotiation.currentProposal,
      rejectedBy: message.senderId,
      reason,
      timestamp: message.timestamp,
    });

    // Update in store
    this.negotiations.set(negotiationId, negotiation);
  }

  /**
   * Add a proposal to the history
   */
  private addProposal(
    negotiationId: string,
    proposerId: string,
    proposal: any,
    status: 'proposed' | 'countered' | 'accepted' | 'rejected',
  ): void {
    const negotiation = this.negotiations.get(negotiationId);
    if (!negotiation) return;

    negotiation.proposalHistory.push({
      proposerId,
      proposal,
      timestamp: Date.now(),
      status,
    });

    this.negotiations.set(negotiationId, negotiation);
  }

  /**
   * Get all negotiations for a particular agent
   */
  getNegotiationsForAgent(agentId: string): NegotiationState[] {
    const result: NegotiationState[] = [];

    for (const negotiation of this.negotiations.values()) {
      if (negotiation.parties.includes(agentId)) {
        result.push(negotiation);
      }
    }

    return result;
  }

  /**
   * Get all negotiations in a particular conversation
   */
  getNegotiationsForConversation(conversationId: string): NegotiationState[] {
    const result: NegotiationState[] = [];

    for (const negotiation of this.negotiations.values()) {
      const dialogue = this.dialogueManagement.getDialogue(
        negotiation.dialogueId,
      );

      if (dialogue && dialogue.conversationId === conversationId) {
        result.push(negotiation);
      }
    }

    return result;
  }
}
