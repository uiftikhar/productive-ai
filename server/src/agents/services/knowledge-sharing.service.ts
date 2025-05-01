import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger';

import { AgentMessagingService } from './agent-messaging.service';
import { EpisodicMemoryService } from './episodic-memory.service';
import { SemanticMemoryService } from './semantic-memory.service';
import { AgentRegistryService } from './agent-registry.service';

import {
  AgentMemoryType,
  SemanticMemory,
  EpisodicMemory,
  MemoryReference,
} from '../interfaces/agent-memory.interface';

import {
  MessageIntent,
  NaturalAgentMessage,
  ConversationContext,
  CommunicationModality,
} from '../interfaces/message-protocol.interface';

/**
 * Knowledge sharing request type
 */
export enum KnowledgeSharingRequestType {
  FACT_REQUEST = 'fact_request',
  EXPERIENCE_REQUEST = 'experience_request',
  CONCEPT_EXPLANATION = 'concept_explanation',
  DOMAIN_KNOWLEDGE = 'domain_knowledge',
  KNOWLEDGE_VERIFICATION = 'knowledge_verification',
}

/**
 * Knowledge sharing request structure
 */
export interface KnowledgeSharingRequest {
  id: string;
  type: KnowledgeSharingRequestType;
  requesterId: string;
  targetAgentId: string;
  query: string;
  context?: any;
  timestamp: number;
  priority: number;
  replyToId?: string;
  conversationId?: string;
}

/**
 * Knowledge sharing response structure
 */
export interface KnowledgeSharingResponse {
  id: string;
  requestId: string;
  responderId: string;
  requesterId: string;
  content: any;
  format: 'text' | 'json' | 'memories';
  confidence: number;
  timestamp: number;
  sourceMemoryIds?: string[];
  verificationStatus?: 'verified' | 'unverified' | 'uncertain' | 'contested';
  verificationMethod?: string;
}

/**
 * Knowledge sharing pattern for regular exchange
 */
export interface KnowledgeSharingPattern {
  id: string;
  name: string;
  description: string;
  triggerConditions: string[];
  targetAgents: string[] | 'all';
  knowledgeTypes: AgentMemoryType[];
  domain?: string;
  concepts?: string[];
  frequency: 'on_change' | 'on_request' | 'scheduled' | 'threshold_based';
  priority: number;
  active: boolean;
  relevanceThreshold: number;
  filterCriteria?: any;
}

/**
 * Service for facilitating knowledge sharing between agents
 */
export class KnowledgeSharingService {
  private activeRequests: Map<string, KnowledgeSharingRequest> = new Map();
  private patterns: Map<string, KnowledgeSharingPattern> = new Map();
  private readonly eventEmitter: EventEmitter;
  private readonly logger: Logger;

  constructor(
    private readonly messaging: AgentMessagingService,
    private readonly episodicMemory: EpisodicMemoryService,
    private readonly semanticMemory: SemanticMemoryService,
    private readonly agentRegistry: AgentRegistryService,
    logger: Logger,
  ) {
    this.logger = logger;
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);

    // Subscribe to messages for automatic knowledge sharing
    this.subscribeToMessages();
  }

  /**
   * Create a knowledge sharing request
   */
  async createRequest(
    requesterId: string,
    targetAgentId: string,
    type: KnowledgeSharingRequestType,
    query: string,
    options: {
      conversationId?: string;
      priority?: number;
      context?: any;
      replyToId?: string;
    } = {},
  ): Promise<KnowledgeSharingRequest> {
    // Create the request
    const request: KnowledgeSharingRequest = {
      id: uuidv4(),
      type,
      requesterId,
      targetAgentId,
      query,
      context: options.context,
      timestamp: Date.now(),
      priority: options.priority || 1,
      replyToId: options.replyToId,
      conversationId: options.conversationId,
    };

    // Store the request
    this.activeRequests.set(request.id, request);

    // Create a conversation if one doesn't exist
    let conversationId = request.conversationId;
    if (!conversationId) {
      const conversation = await this.messaging.createConversation(
        [requesterId, targetAgentId],
        `Knowledge request: ${type}`,
      );
      conversationId = conversation.conversationId;
      request.conversationId = conversationId;
    }

    // Send a message to request the knowledge
    await this.sendKnowledgeRequestMessage(request);

    this.logger.info('Knowledge sharing request created', {
      requestId: request.id,
      type: request.type,
      requesterId,
      targetAgentId,
    });

    // Emit event
    this.eventEmitter.emit('knowledge.request.created', request);

    return request;
  }

  /**
   * Create and send a knowledge sharing response
   */
  async createResponse(
    requestId: string,
    responderId: string,
    content: any,
    options: {
      format?: 'text' | 'json' | 'memories';
      confidence?: number;
      sourceMemoryIds?: string[];
      verificationStatus?:
        | 'verified'
        | 'unverified'
        | 'uncertain'
        | 'contested';
      verificationMethod?: string;
    } = {},
  ): Promise<KnowledgeSharingResponse> {
    // Get the original request
    const request = this.activeRequests.get(requestId);
    if (!request) {
      throw new Error(`Request with ID ${requestId} not found`);
    }

    // Create the response
    const response: KnowledgeSharingResponse = {
      id: uuidv4(),
      requestId,
      responderId,
      requesterId: request.requesterId,
      content,
      format: options.format || 'text',
      confidence: options.confidence || 0.8,
      timestamp: Date.now(),
      sourceMemoryIds: options.sourceMemoryIds,
      verificationStatus: options.verificationStatus,
      verificationMethod: options.verificationMethod,
    };

    // Send the response message
    await this.sendKnowledgeResponseMessage(request, response);

    // Mark request as handled
    this.activeRequests.delete(requestId);

    this.logger.info('Knowledge sharing response sent', {
      responseId: response.id,
      requestId,
      responderId,
      format: response.format,
    });

    // Emit event
    this.eventEmitter.emit('knowledge.response.created', response);

    return response;
  }

  /**
   * Register a knowledge sharing pattern
   */
  registerSharingPattern(
    pattern: Omit<KnowledgeSharingPattern, 'id'>,
  ): KnowledgeSharingPattern {
    const patternWithId: KnowledgeSharingPattern = {
      id: uuidv4(),
      ...pattern,
    };

    this.patterns.set(patternWithId.id, patternWithId);

    this.logger.info('Knowledge sharing pattern registered', {
      patternId: patternWithId.id,
      name: patternWithId.name,
    });

    return patternWithId;
  }

  /**
   * Verify shared knowledge against other agents' knowledge
   */
  async verifyKnowledge(
    memoryId: string,
    agentIds: string[],
    verificationThreshold: number = 0.7,
  ): Promise<{
    verified: boolean;
    confidence: number;
    verifiers: string[];
    contesters: string[];
    verificationMethod: string;
  }> {
    // Get the memory to verify
    const memory = this.semanticMemory.getMemory(memoryId);

    if (!memory) {
      throw new Error(`Memory with ID ${memoryId} not found`);
    }

    const verifiers: string[] = [];
    const contesters: string[] = [];
    let totalConfidence = 0;

    // Ask each agent to verify
    for (const agentId of agentIds) {
      // Skip original memory owner
      if (agentId === memory.agentId) continue;

      // Check if agent has similar knowledge
      const agentMemories = this.semanticMemory.findByConcept(
        agentId,
        memory.concept,
        { exactMatch: false },
      );

      if (agentMemories.length === 0) {
        continue; // Agent has no knowledge about this concept
      }

      // Compare knowledge and assess agreement
      const agentMemory = agentMemories[0]; // Use highest confidence memory
      const agreement = this.assessKnowledgeAgreement(memory, agentMemory);

      if (agreement >= verificationThreshold) {
        verifiers.push(agentId);
        totalConfidence += agreement;
      } else {
        contesters.push(agentId);
      }
    }

    const verified =
      verifiers.length > 0 && verifiers.length > contesters.length;
    const confidence =
      verifiers.length > 0 ? totalConfidence / verifiers.length : 0;

    // Update the memory with verification status
    if (verifiers.length > 0) {
      this.semanticMemory.updateMemory(memoryId, {
        isVerified: verified,
        verificationMethod: 'agent_consensus',
        metadata: {
          ...memory.metadata,
          verification: {
            verifiers,
            contesters,
            confidence,
            timestamp: Date.now(),
          },
        },
      });
    }

    return {
      verified,
      confidence,
      verifiers,
      contesters,
      verificationMethod: 'agent_consensus',
    };
  }

  /**
   * Share knowledge with multiple agents
   */
  async shareKnowledgeWithTeam(
    sourceAgentId: string,
    targetAgentIds: string[],
    knowledgeType: AgentMemoryType,
    options: {
      domain?: string;
      concept?: string;
      importanceThreshold?: number;
      confidenceThreshold?: number;
      mustBeVerified?: boolean;
    } = {},
  ): Promise<{
    sharedWith: Record<string, string[]>; // agentId -> memory IDs shared
  }> {
    const result: Record<string, string[]> = {};

    // Determine memories to share based on filter criteria
    let memoriesToShare: (SemanticMemory | EpisodicMemory)[] = [];

    if (knowledgeType === AgentMemoryType.SEMANTIC) {
      // Get semantic memories
      if (options.concept) {
        memoriesToShare = this.semanticMemory.findByConcept(
          sourceAgentId,
          options.concept,
          { exactMatch: false },
        );
      } else if (options.domain) {
        memoriesToShare = this.semanticMemory.findByDomain(
          sourceAgentId,
          options.domain,
        );
      } else {
        memoriesToShare = this.semanticMemory.getAgentMemories(sourceAgentId);
      }
    } else if (knowledgeType === AgentMemoryType.EPISODIC) {
      // Get episodic memories
      memoriesToShare = this.episodicMemory.getAgentMemories(sourceAgentId);
    }

    // Apply additional filters
    if (
      options.importanceThreshold ||
      options.confidenceThreshold ||
      options.mustBeVerified
    ) {
      memoriesToShare = memoriesToShare.filter((memory) => {
        if (
          options.importanceThreshold &&
          memory.importance < options.importanceThreshold
        ) {
          return false;
        }

        if (
          options.confidenceThreshold &&
          memory.confidence < options.confidenceThreshold
        ) {
          return false;
        }

        if (
          options.mustBeVerified &&
          knowledgeType === AgentMemoryType.SEMANTIC &&
          !(memory as SemanticMemory).isVerified
        ) {
          return false;
        }

        return true;
      });
    }

    // Share with each agent
    for (const targetAgentId of targetAgentIds) {
      // Skip sharing with self
      if (targetAgentId === sourceAgentId) continue;

      result[targetAgentId] = [];

      // Share each memory
      for (const memory of memoriesToShare) {
        // Copy to target agent's memory
        const sharedMemoryId = await this.copyMemoryToAgent(
          memory,
          targetAgentId,
        );

        if (sharedMemoryId) {
          result[targetAgentId].push(sharedMemoryId);
        }
      }

      // Notify the agent about shared knowledge
      if (result[targetAgentId].length > 0) {
        await this.sendKnowledgeSharingNotification(
          sourceAgentId,
          targetAgentId,
          knowledgeType,
          result[targetAgentId],
        );
      }
    }

    return { sharedWith: result };
  }

  /**
   * Process an incoming agent message for knowledge extraction
   */
  async processMessageForKnowledge(
    message: NaturalAgentMessage,
  ): Promise<void> {
    // Skip processing non-text messages
    if (message.modality !== CommunicationModality.TEXT) {
      return;
    }

    // Extract knowledge based on intent
    if (message.intent === MessageIntent.INFORM) {
      // Potential semantic knowledge
      await this.extractSemanticKnowledge(message);
    } else if (
      message.intent === MessageIntent.NARRATE ||
      message.intent === MessageIntent.REFLECT
    ) {
      // Potential episodic knowledge
      await this.extractEpisodicKnowledge(message);
    }
  }

  /**
   * Helper methods
   */

  /**
   * Send a knowledge request message
   */
  private async sendKnowledgeRequestMessage(
    request: KnowledgeSharingRequest,
  ): Promise<void> {
    const requester = await this.agentRegistry.getAgent(request.requesterId);
    const target = await this.agentRegistry.getAgent(request.targetAgentId);

    // Map request type to message intent
    let intent: MessageIntent;
    switch (request.type) {
      case KnowledgeSharingRequestType.FACT_REQUEST:
      case KnowledgeSharingRequestType.CONCEPT_EXPLANATION:
      case KnowledgeSharingRequestType.DOMAIN_KNOWLEDGE:
        intent = MessageIntent.ASK;
        break;
      case KnowledgeSharingRequestType.EXPERIENCE_REQUEST:
        intent = MessageIntent.ASK;
        break;
      case KnowledgeSharingRequestType.KNOWLEDGE_VERIFICATION:
        intent = MessageIntent.VERIFY;
        break;
      default:
        intent = MessageIntent.ASK;
    }

    // Create a message
    const message: NaturalAgentMessage = {
      id: uuidv4(),
      conversationId: request.conversationId!,
      senderId: request.requesterId,
      senderName: requester?.name,
      recipientId: request.targetAgentId,
      recipientName: target?.name,
      intent,
      modality: CommunicationModality.STRUCTURED_DATA,
      content: request,
      timestamp: Date.now(),
      priority: request.priority,
      referencedMessageIds: request.replyToId ? [request.replyToId] : [],
      expectations: {
        responseRequired: true,
        responseType: [MessageIntent.INFORM],
      },
    };

    // Send the message
    await this.messaging.sendMessage(message);
  }

  /**
   * Send a knowledge response message
   */
  private async sendKnowledgeResponseMessage(
    request: KnowledgeSharingRequest,
    response: KnowledgeSharingResponse,
  ): Promise<void> {
    const responder = await this.agentRegistry.getAgent(response.responderId);
    const requester = await this.agentRegistry.getAgent(response.requesterId);

    // Create a message
    const message: NaturalAgentMessage = {
      id: uuidv4(),
      conversationId: request.conversationId!,
      senderId: response.responderId,
      senderName: responder?.name,
      recipientId: response.requesterId,
      recipientName: requester?.name,
      intent: MessageIntent.INFORM,
      modality: CommunicationModality.STRUCTURED_DATA,
      content: response,
      timestamp: Date.now(),
      priority: request.priority,
      referencedMessageIds: [request.id],
    };

    // Send the message
    await this.messaging.sendMessage(message);
  }

  /**
   * Send a notification about shared knowledge
   */
  private async sendKnowledgeSharingNotification(
    sourceAgentId: string,
    targetAgentId: string,
    knowledgeType: AgentMemoryType,
    sharedMemoryIds: string[],
  ): Promise<void> {
    const source = await this.agentRegistry.getAgent(sourceAgentId);
    const target = await this.agentRegistry.getAgent(targetAgentId);

    // Create a conversation
    const conversation = await this.messaging.createConversation(
      [sourceAgentId, targetAgentId],
      `Knowledge sharing: ${knowledgeType}`,
    );

    // Create a message
    const message: NaturalAgentMessage = {
      id: uuidv4(),
      conversationId: conversation.conversationId,
      senderId: sourceAgentId,
      senderName: source?.name,
      recipientId: targetAgentId,
      recipientName: target?.name,
      intent: MessageIntent.INFORM,
      modality: CommunicationModality.STRUCTURED_DATA,
      content: {
        type: 'knowledge_sharing',
        knowledgeType,
        memoryIds: sharedMemoryIds,
        message: `Shared ${sharedMemoryIds.length} memories of type ${knowledgeType}`,
      },
      timestamp: Date.now(),
      priority: 1,
    };

    // Send the message
    await this.messaging.sendMessage(message);
  }

  /**
   * Copy a memory to another agent
   */
  private async copyMemoryToAgent(
    memory: SemanticMemory | EpisodicMemory,
    targetAgentId: string,
  ): Promise<string | undefined> {
    try {
      if (memory.type === AgentMemoryType.SEMANTIC) {
        // Copy semantic memory
        const semanticMemory = memory as SemanticMemory;
        const newMemory = this.semanticMemory.createMemory(
          targetAgentId,
          semanticMemory.concept,
          semanticMemory.content,
          semanticMemory.domain,
          semanticMemory.relatedConcepts,
          {
            category: semanticMemory.category,
            source: `agent:${memory.agentId}`,
            isVerified: false, // New agent should verify independently
            stability: semanticMemory.stability,
            applicableContexts: semanticMemory.applicableContexts,
            contextRestrictions: semanticMemory.contextRestrictions,
            tags: semanticMemory.tags,
            importance: semanticMemory.importance * 0.9, // Slightly reduce importance for shared knowledge
            confidence: semanticMemory.confidence * 0.8, // Reduce confidence for shared knowledge
            format: semanticMemory.format,
          },
        );

        // Add metadata to track origin
        this.semanticMemory.updateMemory(newMemory.id, {
          metadata: {
            ...newMemory.metadata,
            originalAgentId: memory.agentId,
            originalMemoryId: memory.id,
            shared: true,
            sharedAt: Date.now(),
          },
        });

        return newMemory.id;
      } else if (memory.type === AgentMemoryType.EPISODIC) {
        // Copy episodic memory
        const episodicMemory = memory as EpisodicMemory;
        const newMemory = this.episodicMemory.createMemory(
          targetAgentId,
          episodicMemory.title,
          episodicMemory.description,
          episodicMemory.narrative,
          episodicMemory.keyEvents,
          episodicMemory.outcomes,
          {
            timestamp: episodicMemory.timestamp,
            duration: episodicMemory.duration,
            location: episodicMemory.location,
            participants: episodicMemory.participants,
            relatedTaskIds: episodicMemory.relatedTaskIds,
            conversationId: episodicMemory.conversationId,
            messageIds: episodicMemory.messageIds,
            emotional: episodicMemory.emotional,
            lessons: episodicMemory.lessons,
            tags: episodicMemory.tags,
            importance: episodicMemory.importance * 0.9, // Slightly reduce importance
            confidence: episodicMemory.confidence * 0.8, // Reduce confidence for shared knowledge
          },
        );

        // Add metadata to track origin
        this.episodicMemory.updateMemory(newMemory.id, {
          metadata: {
            ...newMemory.metadata,
            originalAgentId: memory.agentId,
            originalMemoryId: memory.id,
            shared: true,
            sharedAt: Date.now(),
            witnessedFirsthand: false,
          },
        });

        return newMemory.id;
      }
    } catch (error) {
      this.logger.error('Error copying memory to agent', {
        memoryId: memory.id,
        targetAgentId,
        error,
      });
    }

    return undefined;
  }

  /**
   * Extract semantic knowledge from a message
   */
  private async extractSemanticKnowledge(
    message: NaturalAgentMessage,
  ): Promise<void> {
    // This would use more sophisticated NLP/LLM to extract knowledge
    // For now, just a stub implementation
    this.logger.debug('Extracting semantic knowledge from message', {
      messageId: message.id,
    });

    // In a real implementation, would use an LLM to identify concepts, facts, etc.
  }

  /**
   * Extract episodic knowledge from a message
   */
  private async extractEpisodicKnowledge(
    message: NaturalAgentMessage,
  ): Promise<void> {
    // This would use more sophisticated NLP/LLM to extract experiences
    // For now, just a stub implementation
    this.logger.debug('Extracting episodic knowledge from message', {
      messageId: message.id,
    });

    // In a real implementation, would use an LLM to identify experiences, events, etc.
  }

  /**
   * Subscribe to messages for knowledge extraction
   */
  private subscribeToMessages(): void {
    this.messaging.subscribeToMessages('knowledge-sharing', async (message) => {
      // Process message for potential knowledge
      await this.processMessageForKnowledge(message);

      // Check for knowledge requests
      if (message.modality === CommunicationModality.STRUCTURED_DATA) {
        const content = message.content as any;

        if (
          content?.type &&
          Object.values(KnowledgeSharingRequestType).includes(content.type)
        ) {
          // Handle knowledge request
          this.handleKnowledgeRequest(message);
        }
      }
    });
  }

  /**
   * Handle an incoming knowledge request
   */
  private async handleKnowledgeRequest(
    message: NaturalAgentMessage,
  ): Promise<void> {
    const request = message.content as KnowledgeSharingRequest;

    // Store active request
    this.activeRequests.set(request.id, request);

    this.logger.debug('Received knowledge request', {
      requestId: request.id,
      type: request.type,
    });

    // This would trigger the recipient agent to process the request
    // In a real implementation, the agent would respond asynchronously
  }

  /**
   * Assess agreement between two semantic memories
   */
  private assessKnowledgeAgreement(
    memory1: SemanticMemory,
    memory2: SemanticMemory,
  ): number {
    // This would use more sophisticated semantic comparison
    // For now, just a simple text comparison

    // Check if concepts match
    const conceptMatch =
      memory1.concept.toLowerCase() === memory2.concept.toLowerCase() ? 1 : 0.5;

    // Check content similarity (very naive implementation)
    let contentSimilarity = 0;
    const content1 = memory1.content.toLowerCase();
    const content2 = memory2.content.toLowerCase();

    // Check if one contains the other
    if (content1.includes(content2) || content2.includes(content1)) {
      contentSimilarity = 0.8;
    } else {
      // Count matching words
      const words1 = new Set(content1.split(/\s+/));
      const words2 = new Set(content2.split(/\s+/));

      const intersection = new Set(
        [...words1].filter((word) => words2.has(word)),
      );
      const union = new Set([...words1, ...words2]);

      contentSimilarity = intersection.size / union.size;
    }

    // Weight concept match and content similarity
    return conceptMatch * 0.4 + contentSimilarity * 0.6;
  }
}
