import { v4 as uuidv4 } from 'uuid';

import { AgentMessagingService } from './agent-messaging.service';
import { AgentRegistryService } from './agent-registry.service';
import { DialogueManagementService } from './dialogue-management.service';

import {
  MessageIntent,
  NaturalAgentMessage,
  CommunicationModality,
} from '../interfaces/message-protocol.interface';

import {
  RequestPattern,
  StructuredRequest,
  DialogueType,
} from '../interfaces/dialogue-system.interface';

/**
 * Service for generating and sending structured requests between agents
 */
export class RequestFormulationService {
  constructor(
    private readonly messaging: AgentMessagingService,
    private readonly dialogueManagement: DialogueManagementService,
    private readonly agentRegistry: AgentRegistryService,
  ) {}

  /**
   * Create a structured information request
   */
  async createInformationRequest(
    senderId: string,
    recipientId: string,
    topic: string,
    specificQuestions: string[],
    context?: any,
    urgency: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    deadline?: number,
    responseFormat?: any,
  ): Promise<NaturalAgentMessage> {
    const request: StructuredRequest = {
      id: uuidv4(),
      pattern: RequestPattern.INFORMATION_REQUEST,
      content: {
        topic,
        questions: specificQuestions,
      },
      context,
      urgency,
      deadline,
      responseFormat,
      validation: {
        required: ['topic', 'answers'],
      },
    };

    return this.sendRequest(
      senderId,
      recipientId,
      request,
      MessageIntent.ASK,
      `Information request: ${topic}`,
    );
  }

  /**
   * Create a structured action request
   */
  async createActionRequest(
    senderId: string,
    recipientId: string,
    actionType: string,
    parameters: Record<string, any>,
    context?: any,
    urgency: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    deadline?: number,
    fallbackOptions?: any[],
  ): Promise<NaturalAgentMessage> {
    const request: StructuredRequest = {
      id: uuidv4(),
      pattern: RequestPattern.ACTION_REQUEST,
      content: {
        actionType,
        parameters,
      },
      context,
      urgency,
      deadline,
      fallbackOptions,
      validation: {
        required: ['status', 'result'],
      },
    };

    return this.sendRequest(
      senderId,
      recipientId,
      request,
      MessageIntent.REQUEST,
      `Action request: ${actionType}`,
    );
  }

  /**
   * Create a clarification request
   */
  async createClarificationRequest(
    senderId: string,
    recipientId: string,
    originalMessageId: string,
    clarificationPoints: string[],
    context?: any,
    urgency: 'low' | 'medium' | 'high' | 'critical' = 'medium',
  ): Promise<NaturalAgentMessage> {
    const request: StructuredRequest = {
      id: uuidv4(),
      pattern: RequestPattern.CLARIFICATION_REQUEST,
      content: {
        originalMessageId,
        clarificationPoints,
      },
      context,
      urgency,
      validation: {
        required: ['clarifications'],
      },
    };

    return this.sendRequest(
      senderId,
      recipientId,
      request,
      MessageIntent.CLARIFY,
      `Clarification request`,
      [originalMessageId],
    );
  }

  /**
   * Create a proposal request
   */
  async createProposalRequest(
    senderId: string,
    recipientId: string,
    topic: string,
    requirements: any[],
    constraints?: any[],
    context?: any,
    deadline?: number,
  ): Promise<NaturalAgentMessage> {
    const request: StructuredRequest = {
      id: uuidv4(),
      pattern: RequestPattern.PROPOSAL_REQUEST,
      content: {
        topic,
        requirements,
        constraints,
      },
      context,
      urgency: 'medium',
      deadline,
      validation: {
        required: ['proposal'],
      },
    };

    // Start a negotiation dialogue
    const dialogue = await this.dialogueManagement.initiateDialogue(
      senderId,
      [recipientId],
      DialogueType.NEGOTIATION,
      topic,
    );

    return this.sendRequest(
      senderId,
      recipientId,
      request,
      MessageIntent.REQUEST,
      topic,
      [],
      dialogue.conversationId,
    );
  }

  /**
   * Create a feedback request
   */
  async createFeedbackRequest(
    senderId: string,
    recipientId: string,
    artifact: any,
    aspectsForFeedback: string[],
    context?: any,
  ): Promise<NaturalAgentMessage> {
    const request: StructuredRequest = {
      id: uuidv4(),
      pattern: RequestPattern.FEEDBACK_REQUEST,
      content: {
        artifact,
        aspectsForFeedback,
      },
      context,
      urgency: 'medium',
      validation: {
        required: ['feedback', 'rating'],
      },
    };

    return this.sendRequest(
      senderId,
      recipientId,
      request,
      MessageIntent.REQUEST,
      `Feedback request`,
    );
  }

  /**
   * Create a coordination request
   */
  async createCoordinationRequest(
    senderId: string,
    recipientId: string,
    activity: string,
    timing: any,
    participants: string[],
    resources?: any[],
    context?: any,
  ): Promise<NaturalAgentMessage> {
    const request: StructuredRequest = {
      id: uuidv4(),
      pattern: RequestPattern.COORDINATION_REQUEST,
      content: {
        activity,
        timing,
        participants,
        resources,
      },
      context,
      urgency: 'medium',
      validation: {
        required: ['availability', 'confirmation'],
      },
    };

    return this.sendRequest(
      senderId,
      recipientId,
      request,
      MessageIntent.REQUEST,
      `Coordination request: ${activity}`,
    );
  }

  /**
   * Extract request pattern from natural language
   * This would ideally use an LLM for more sophisticated extraction
   */
  extractRequestPattern(text: string): RequestPattern {
    const lowercaseText = text.toLowerCase();

    if (
      lowercaseText.includes('what') ||
      lowercaseText.includes('who') ||
      lowercaseText.includes('when') ||
      lowercaseText.includes('where') ||
      lowercaseText.includes('why') ||
      lowercaseText.includes('how')
    ) {
      return RequestPattern.INFORMATION_REQUEST;
    }

    if (
      lowercaseText.includes('can you') ||
      lowercaseText.includes('please') ||
      lowercaseText.includes('do this') ||
      lowercaseText.includes('perform')
    ) {
      return RequestPattern.ACTION_REQUEST;
    }

    if (
      lowercaseText.includes('clarify') ||
      lowercaseText.includes('what do you mean') ||
      lowercaseText.includes('explain')
    ) {
      return RequestPattern.CLARIFICATION_REQUEST;
    }

    if (
      lowercaseText.includes('propose') ||
      lowercaseText.includes('suggest') ||
      lowercaseText.includes('offer')
    ) {
      return RequestPattern.PROPOSAL_REQUEST;
    }

    if (
      lowercaseText.includes('feedback') ||
      lowercaseText.includes('review') ||
      lowercaseText.includes('what do you think')
    ) {
      return RequestPattern.FEEDBACK_REQUEST;
    }

    if (
      lowercaseText.includes('meet') ||
      lowercaseText.includes('coordinate') ||
      lowercaseText.includes('schedule') ||
      lowercaseText.includes('together')
    ) {
      return RequestPattern.COORDINATION_REQUEST;
    }

    // Default to information request
    return RequestPattern.INFORMATION_REQUEST;
  }

  /**
   * Convert natural language message to structured request
   * In a real implementation, this would use an LLM
   */
  async naturalLanguageToRequest(
    message: NaturalAgentMessage,
  ): Promise<StructuredRequest | null> {
    if (typeof message.content !== 'string') {
      return null; // Can only process text content
    }

    const pattern = this.extractRequestPattern(message.content);

    // This is a simplistic implementation
    // A real implementation would use more sophisticated NLP/LLM techniques
    const request: StructuredRequest = {
      id: uuidv4(),
      pattern,
      content: {
        rawText: message.content,
        // Extract entities and parameters based on pattern
        // This would be much more sophisticated with an LLM
      },
      urgency: message.priority >= 2 ? 'high' : 'medium',
      validation: {
        required: [],
      },
    };

    return request;
  }

  // Private helper methods

  /**
   * Send a structured request message
   */
  private async sendRequest(
    senderId: string,
    recipientId: string,
    request: StructuredRequest,
    intent: MessageIntent,
    topic: string,
    referencedMessageIds: string[] = [],
    conversationId?: string,
  ): Promise<NaturalAgentMessage> {
    const sender = await this.agentRegistry.getAgent(senderId);
    const recipient = await this.agentRegistry.getAgent(recipientId);

    // Create conversation if needed
    if (!conversationId) {
      const conversation = this.messaging.createConversation(
        [senderId, recipientId],
        topic,
      );
      conversationId = conversation.conversationId;
    }

    // Create message with the structured request
    const message: NaturalAgentMessage = {
      id: uuidv4(),
      conversationId,
      senderId,
      senderName: sender?.name,
      recipientId,
      recipientName: recipient?.name,
      intent,
      modality: CommunicationModality.STRUCTURED_DATA,
      content: request,
      timestamp: Date.now(),
      priority: this.mapUrgencyToPriority(request.urgency),
      referencedMessageIds,
      expectations: {
        responseRequired: true,
        responseType: [
          MessageIntent.INFORM,
          MessageIntent.AGREE,
          MessageIntent.DISAGREE,
        ],
        responseDeadline: request.deadline,
      },
    };

    // Send the message
    await this.messaging.sendMessage(message);

    return message;
  }

  /**
   * Map request urgency to message priority
   */
  private mapUrgencyToPriority(
    urgency: 'low' | 'medium' | 'high' | 'critical',
  ): number {
    switch (urgency) {
      case 'critical':
        return 3;
      case 'high':
        return 2;
      case 'medium':
        return 1;
      case 'low':
      default:
        return 0;
    }
  }
}
