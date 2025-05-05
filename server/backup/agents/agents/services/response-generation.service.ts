/**
 * @deprecated This service is deprecated as part of Phase 4: Emergent Workflow System.
 * Please use context-aware agent communication with dynamic task context instead.
 * See server/src/DEPRECATED-SERVICES.md for migration guidance.
 */

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
  StructuredResponse,
  DialoguePhase,
} from '../interfaces/dialogue-system.interface';

/**
 * Service for generating contextual responses to agent requests
 */
export class ResponseGenerationService {
  // Track outstanding requests
  private readonly outstandingRequests: Map<
    string,
    {
      messageId: string;
      requestId: string;
      senderId: string;
      recipientId: string;
      timestamp: number;
      deadline?: number;
      handled: boolean;
    }
  > = new Map();

  constructor(
    private readonly messaging: AgentMessagingService,
    private readonly dialogueManagement: DialogueManagementService,
    private readonly agentRegistry: AgentRegistryService,
  ) {
    // Subscribe to messages that might contain requests
    this.subscribeToMessages();
  }

  /**
   * Create and send a response to a structured request
   */
  async respondToRequest(
    originalMessage: NaturalAgentMessage,
    content: any,
    status: 'success' | 'partial' | 'failure' | 'pending' = 'success',
    completeness: number = 1.0,
    confidence: number = 0.9,
    followUpNeeded: boolean = false,
    suggestedActions?: any[],
  ): Promise<NaturalAgentMessage> {
    // Only handle structured data requests
    if (originalMessage.modality !== CommunicationModality.STRUCTURED_DATA) {
      throw new Error(
        'Cannot generate response: Original message is not a structured request',
      );
    }

    // Get the structured request
    const request = originalMessage.content as StructuredRequest;
    if (!request || !request.id || !request.pattern) {
      throw new Error(
        'Cannot generate response: Invalid structured request format',
      );
    }

    // Create structured response
    const response: StructuredResponse = {
      requestId: request.id,
      status,
      content,
      completeness,
      confidence,
      followUpNeeded,
      suggestedActions,
    };

    // Map request pattern to response intent
    const intent = this.mapRequestPatternToResponseIntent(
      request.pattern,
      status,
    );

    // Create and send the response message
    return this.createResponseMessage(
      originalMessage.recipientId!, // Response sender (original recipient)
      originalMessage.senderId, // Response recipient (original sender)
      response,
      intent,
      originalMessage.id,
      originalMessage.conversationId,
    );
  }

  /**
   * Create a simple response without requiring a structured request
   */
  async createSimpleResponse(
    originalMessage: NaturalAgentMessage,
    content: any,
    intent: MessageIntent = MessageIntent.INFORM,
  ): Promise<NaturalAgentMessage> {
    const sender = await this.agentRegistry.getAgent(
      originalMessage.recipientId!,
    );

    // Create message
    const message: NaturalAgentMessage = {
      id: uuidv4(),
      conversationId: originalMessage.conversationId,
      senderId: originalMessage.recipientId!,
      senderName: sender?.name,
      recipientId: originalMessage.senderId,
      recipientName: originalMessage.senderName,
      intent,
      modality:
        typeof content === 'string'
          ? CommunicationModality.TEXT
          : CommunicationModality.STRUCTURED_DATA,
      content,
      timestamp: Date.now(),
      priority: originalMessage.priority,
      referencedMessageIds: [originalMessage.id],
    };

    // Send message
    await this.messaging.sendMessage(message);

    return message;
  }

  /**
   * Handle a clarification response
   */
  async respondToClarification(
    clarificationMessage: NaturalAgentMessage,
    clarifications: Record<string, any>,
    missingClarifications?: string[],
  ): Promise<NaturalAgentMessage> {
    // Create response
    const response: StructuredResponse = {
      requestId: (clarificationMessage.content as any)?.id || uuidv4(),
      status: missingClarifications?.length ? 'partial' : 'success',
      content: {
        clarifications,
        missingClarifications,
      },
      completeness: missingClarifications?.length ? 0.5 : 1.0,
      confidence: 0.9,
      followUpNeeded: !!missingClarifications?.length,
    };

    // Send response
    return this.createResponseMessage(
      clarificationMessage.recipientId!,
      clarificationMessage.senderId,
      response,
      MessageIntent.CLARIFY,
      clarificationMessage.id,
      clarificationMessage.conversationId,
    );
  }

  /**
   * Generate a negotiation response
   */
  async generateNegotiationResponse(
    proposalMessage: NaturalAgentMessage,
    action: 'accept' | 'counter' | 'reject',
    content: any,
    reason?: string,
  ): Promise<NaturalAgentMessage> {
    // Determine the appropriate intent
    let intent: MessageIntent;
    let status: 'success' | 'partial' | 'failure';

    switch (action) {
      case 'accept':
        intent = MessageIntent.ACCEPT;
        status = 'success';
        break;
      case 'counter':
        intent = MessageIntent.COUNTER_PROPOSE;
        status = 'partial';
        break;
      case 'reject':
        intent = MessageIntent.REJECT;
        status = 'failure';
        break;
      default:
        intent = MessageIntent.INFORM;
        status = 'partial';
    }

    // Create response
    const response: StructuredResponse = {
      requestId: (proposalMessage.content as any)?.id || uuidv4(),
      status,
      content,
      completeness: action === 'accept' ? 1.0 : 0.5,
      confidence: 0.9,
      followUpNeeded: action === 'counter',
      metadata: {
        reason,
        negotiationAction: action,
      },
    };

    // Update dialogue state if in active dialogue
    const dialogues = this.dialogueManagement.getDialoguesForConversation(
      proposalMessage.conversationId,
    );

    const activeDialogue = dialogues.find((d) => d.status === 'active');
    if (activeDialogue) {
      // Determine new phase based on action
      let newPhase: DialoguePhase;

      switch (action) {
        case 'accept':
          newPhase = DialoguePhase.RESOLUTION;
          break;
        case 'counter':
          newPhase = DialoguePhase.NEGOTIATION;
          break;
        case 'reject':
          newPhase = DialoguePhase.CONCLUSION;
          break;
        default:
          newPhase = activeDialogue.currentPhase;
      }

      // Only update if phase would change
      if (newPhase !== activeDialogue.currentPhase) {
        const message = await this.createResponseMessage(
          proposalMessage.recipientId!,
          proposalMessage.senderId,
          response,
          intent,
          proposalMessage.id,
          proposalMessage.conversationId,
        );

        // Update dialogue phase
        await this.dialogueManagement.updateDialoguePhase(
          activeDialogue.dialogueId,
          newPhase,
          `Negotiation response: ${action}`,
          message,
        );

        // If rejected, complete the dialogue
        if (action === 'reject') {
          this.dialogueManagement.completeDialogue(
            activeDialogue.dialogueId,
            'completed',
            'Negotiation rejected',
          );
        }

        return message;
      }
    }

    // Send normal response if not in dialogue or no phase change
    return this.createResponseMessage(
      proposalMessage.recipientId!,
      proposalMessage.senderId,
      response,
      intent,
      proposalMessage.id,
      proposalMessage.conversationId,
    );
  }

  /**
   * Process an incoming message and detect if it contains an implicit request
   * This would use more sophisticated NLP/LLM techniques in a real implementation
   */
  async detectImplicitRequest(
    message: NaturalAgentMessage,
  ): Promise<RequestPattern | null> {
    // Only process text messages
    if (
      message.modality !== CommunicationModality.TEXT ||
      typeof message.content !== 'string'
    ) {
      return null;
    }

    const content = message.content as string;

    // Look for implicit requests in the text
    // This is a very simplistic implementation that would be replaced with NLP/LLM

    // Check for information requests
    if (
      content.match(
        /(?:i\s+(?:need|want|would\s+like)\s+to\s+know|i'm\s+curious|wondering|do\s+you\s+know|any\s+idea)/i,
      )
    ) {
      return RequestPattern.INFORMATION_REQUEST;
    }

    // Check for action requests
    if (
      content.match(
        /(?:i\s+(?:need|want|would\s+like)\s+you\s+to|could\s+you|would\s+you|i\s+hope\s+you\s+can|maybe\s+you\s+could)/i,
      )
    ) {
      return RequestPattern.ACTION_REQUEST;
    }

    // Check for clarification requests
    if (
      content.match(
        /(?:i'm\s+(?:confused|not\s+sure)|that\s+doesn't\s+make\s+sense|what\s+do\s+you\s+mean\s+by|could\s+you\s+explain)/i,
      )
    ) {
      return RequestPattern.CLARIFICATION_REQUEST;
    }

    // Check for feedback requests
    if (
      content.match(
        /(?:what\s+do\s+you\s+think|how\s+does\s+this\s+look|any\s+thoughts|your\s+opinion)/i,
      )
    ) {
      return RequestPattern.FEEDBACK_REQUEST;
    }

    return null;
  }

  // Private helper methods

  /**
   * Create and send a response message
   */
  private async createResponseMessage(
    senderId: string,
    recipientId: string,
    responseContent: StructuredResponse,
    intent: MessageIntent,
    referencedMessageId: string,
    conversationId: string,
  ): Promise<NaturalAgentMessage> {
    const sender = await this.agentRegistry.getAgent(senderId);
    const recipient = await this.agentRegistry.getAgent(recipientId);

    // Create message
    const message: NaturalAgentMessage = {
      id: uuidv4(),
      conversationId,
      senderId,
      senderName: sender?.name,
      recipientId,
      recipientName: recipient?.name,
      intent,
      modality: CommunicationModality.STRUCTURED_DATA,
      content: responseContent,
      timestamp: Date.now(),
      priority: 1, // Standard priority for responses
      referencedMessageIds: [referencedMessageId],
    };

    // Send message
    await this.messaging.sendMessage(message);

    // Mark request as handled
    this.markRequestHandled(referencedMessageId);

    return message;
  }

  /**
   * Subscribe to incoming requests
   */
  private subscribeToMessages(): void {
    this.messaging.subscribeToMessages(
      'response-generator',
      async (message) => {
        // Track potential requests
        if (this.isRequestMessage(message)) {
          this.trackRequest(message);
        }
      },
    );
  }

  /**
   * Check if a message contains a request
   */
  private isRequestMessage(message: NaturalAgentMessage): boolean {
    // Check intent
    const requestIntents = [
      MessageIntent.ASK,
      MessageIntent.REQUEST,
      MessageIntent.CLARIFY,
      MessageIntent.CONFIRM,
      MessageIntent.PROPOSE,
    ];

    if (!requestIntents.includes(message.intent)) {
      return false;
    }

    // Check if it has expectations
    if (message.expectations?.responseRequired) {
      return true;
    }

    // Check if content is a structured request
    if (message.modality === CommunicationModality.STRUCTURED_DATA) {
      const content = message.content as any;
      return content?.pattern !== undefined;
    }

    return false;
  }

  /**
   * Track an outstanding request
   */
  private trackRequest(message: NaturalAgentMessage): void {
    let requestId = '';

    // Try to get request ID
    if (message.modality === CommunicationModality.STRUCTURED_DATA) {
      const content = message.content as any;
      requestId = content?.id || '';
    }

    // Store request tracking info
    this.outstandingRequests.set(message.id, {
      messageId: message.id,
      requestId,
      senderId: message.senderId,
      recipientId: message.recipientId!,
      timestamp: message.timestamp,
      deadline: message.expectations?.responseDeadline,
      handled: false,
    });
  }

  /**
   * Mark a request as handled
   */
  private markRequestHandled(messageId: string): void {
    const request = this.outstandingRequests.get(messageId);

    if (request) {
      request.handled = true;
      this.outstandingRequests.set(messageId, request);
    }
  }

  /**
   * Map request pattern to appropriate response intent
   */
  private mapRequestPatternToResponseIntent(
    pattern: RequestPattern,
    status: 'success' | 'partial' | 'failure' | 'pending',
  ): MessageIntent {
    // If failed, always use INFORM intent
    if (status === 'failure') {
      return MessageIntent.INFORM;
    }

    switch (pattern) {
      case RequestPattern.INFORMATION_REQUEST:
        return MessageIntent.INFORM;

      case RequestPattern.ACTION_REQUEST:
        return status === 'success'
          ? MessageIntent.ACKNOWLEDGE
          : MessageIntent.INFORM;

      case RequestPattern.CLARIFICATION_REQUEST:
        return MessageIntent.CLARIFY;

      case RequestPattern.PROPOSAL_REQUEST:
        return MessageIntent.PROPOSE;

      case RequestPattern.FEEDBACK_REQUEST:
        return MessageIntent.FEEDBACK;

      case RequestPattern.ASSISTANCE_REQUEST:
        return status === 'success'
          ? MessageIntent.ACKNOWLEDGE
          : MessageIntent.INFORM;

      case RequestPattern.COORDINATION_REQUEST:
        return status === 'success'
          ? MessageIntent.AGREE
          : MessageIntent.DISAGREE;

      case RequestPattern.PERMISSION_REQUEST:
        return status === 'success'
          ? MessageIntent.AGREE
          : MessageIntent.DISAGREE;

      default:
        return MessageIntent.INFORM;
    }
  }

  /**
   * Get all outstanding requests
   */
  getOutstandingRequests(): Array<{
    messageId: string;
    requestId: string;
    senderId: string;
    recipientId: string;
    timestamp: number;
    deadline?: number;
    handled: boolean;
  }> {
    return Array.from(this.outstandingRequests.values());
  }

  /**
   * Get unhandled requests for a specific agent
   */
  getUnhandledRequestsForAgent(agentId: string): Array<{
    messageId: string;
    requestId: string;
    senderId: string;
    recipientId: string;
    timestamp: number;
    deadline?: number;
  }> {
    return Array.from(this.outstandingRequests.values())
      .filter((req) => req.recipientId === agentId && !req.handled)
      .map(({ handled, ...rest }) => rest);
  }
}
