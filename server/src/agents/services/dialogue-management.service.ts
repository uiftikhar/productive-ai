import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

import {
  MessageIntent,
  NaturalAgentMessage,
  ConversationContext,
  CommunicationModality,
} from '../interfaces/message-protocol.interface';

import {
  DialogueState,
  DialogueType,
  DialoguePhase,
  DialogueTemplate,
  DialogueTransition,
  DialogueEnabledConversation,
  ClarificationRequest,
  ClarificationType,
} from '../interfaces/dialogue-system.interface';

import { AgentMessagingService } from './agent-messaging.service';
import { AgentRegistryService } from './agent-registry.service';

/**
 * Service for managing structured dialogues between agents
 */
export class DialogueManagementService {
  private readonly dialogues: Map<string, DialogueState> = new Map();
  private readonly transitions: Map<string, DialogueTransition[]> = new Map();
  private readonly templates: Map<string, DialogueTemplate> = new Map();
  private readonly clarificationRequests: Map<string, ClarificationRequest> =
    new Map();
  private readonly enhancedConversations: Map<
    string,
    DialogueEnabledConversation
  > = new Map();
  private readonly eventEmitter: EventEmitter;

  constructor(
    private readonly messaging: AgentMessagingService,
    private readonly agentRegistry: AgentRegistryService,
  ) {
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);

    // Subscribe to all messages to track and analyze dialogues
    this.subscribeToMessages();

    // Initialize with default dialogue templates
    this.initializeDefaultTemplates();
  }

  /**
   * Start a new dialogue
   */
  async initiateDialogue(
    initiatorId: string,
    participants: string[],
    type: DialogueType,
    topic: string,
    initialMessage?: NaturalAgentMessage,
    templateId?: string,
  ): Promise<DialogueState> {
    const dialogueId = uuidv4();
    const conversationId =
      initialMessage?.conversationId ||
      this.createConversation(participants, topic).conversationId;
    const now = Date.now();

    // Create the dialogue state
    const dialogue: DialogueState = {
      dialogueId,
      conversationId,
      type,
      currentPhase: DialoguePhase.INITIATION,
      participants: [
        initiatorId,
        ...participants.filter((p) => p !== initiatorId),
      ],
      initiator: initiatorId,
      topic,
      startTime: now,
      lastUpdateTime: now,
      status: 'active',
      phaseHistory: [
        {
          phase: DialoguePhase.INITIATION,
          enteredAt: now,
        },
      ],
    };

    // Apply template if specified
    if (templateId && this.templates.has(templateId)) {
      const template = this.templates.get(templateId)!;
      dialogue.expectedOutcome = template.description;
      dialogue.successCriteria = template.successCriteria;
      dialogue.metadata = { templateId };
    }

    // Store the dialogue
    this.dialogues.set(dialogueId, dialogue);

    // Initialize transitions list
    this.transitions.set(dialogueId, []);

    // Update the conversation to be dialogue-enabled
    this.enhanceConversation(conversationId, dialogueId);

    // Send initial message if provided
    if (initialMessage) {
      await this.messaging.sendMessage(initialMessage);
    }

    // Emit event
    this.eventEmitter.emit('dialogue.created', dialogue);

    return dialogue;
  }

  /**
   * Get dialogue by ID
   */
  getDialogue(dialogueId: string): DialogueState | undefined {
    return this.dialogues.get(dialogueId);
  }

  /**
   * Get all dialogues for a conversation
   */
  getDialoguesForConversation(conversationId: string): DialogueState[] {
    const dialogues: DialogueState[] = [];

    for (const dialogue of this.dialogues.values()) {
      if (dialogue.conversationId === conversationId) {
        dialogues.push(dialogue);
      }
    }

    return dialogues;
  }

  /**
   * Update dialogue phase
   */
  updateDialoguePhase(
    dialogueId: string,
    newPhase: DialoguePhase,
    transitionReason: string,
    triggeredByMessage?: NaturalAgentMessage,
  ): DialogueState {
    const dialogue = this.dialogues.get(dialogueId);

    if (!dialogue) {
      throw new Error(`Dialogue with ID ${dialogueId} not found`);
    }

    const now = Date.now();
    const oldPhase = dialogue.currentPhase;

    // Update the current phase's exit time in history
    const currentPhaseRecord = dialogue.phaseHistory.find(
      (p) => p.phase === oldPhase && !p.exitedAt,
    );

    if (currentPhaseRecord) {
      currentPhaseRecord.exitedAt = now;
    }

    // Add new phase to history
    dialogue.phaseHistory.push({
      phase: newPhase,
      enteredAt: now,
    });

    // Update dialogue
    dialogue.currentPhase = newPhase;
    dialogue.lastUpdateTime = now;

    // Record transition
    if (triggeredByMessage) {
      const transition: DialogueTransition = {
        from: oldPhase,
        to: newPhase,
        triggeredBy: {
          agentId: triggeredByMessage.senderId,
          messageId: triggeredByMessage.id,
          intent: triggeredByMessage.intent,
        },
        timestamp: now,
        reason: transitionReason,
      };

      this.transitions.get(dialogueId)?.push(transition);
    }

    // Update in store
    this.dialogues.set(dialogueId, dialogue);

    // Emit event
    this.eventEmitter.emit('dialogue.phase.changed', {
      dialogueId,
      from: oldPhase,
      to: newPhase,
      timestamp: now,
    });

    return dialogue;
  }

  /**
   * Complete a dialogue
   */
  completeDialogue(
    dialogueId: string,
    outcome: 'completed' | 'abandoned',
    summary?: string,
  ): DialogueState {
    const dialogue = this.dialogues.get(dialogueId);

    if (!dialogue) {
      throw new Error(`Dialogue with ID ${dialogueId} not found`);
    }

    const now = Date.now();

    // Update the current phase's exit time
    const currentPhaseRecord = dialogue.phaseHistory.find(
      (p) => p.phase === dialogue.currentPhase && !p.exitedAt,
    );

    if (currentPhaseRecord) {
      currentPhaseRecord.exitedAt = now;
      currentPhaseRecord.summary = summary;
    }

    // Update dialogue status
    dialogue.status = outcome;
    dialogue.lastUpdateTime = now;

    // Store the updated dialogue
    this.dialogues.set(dialogueId, dialogue);

    // Update enhanced conversation
    const enhancedConversation = this.enhancedConversations.get(
      dialogue.conversationId,
    );
    if (enhancedConversation) {
      const activeIndex =
        enhancedConversation.activeDialogues.indexOf(dialogueId);
      if (activeIndex >= 0) {
        enhancedConversation.activeDialogues.splice(activeIndex, 1);
      }
      this.enhancedConversations.set(
        dialogue.conversationId,
        enhancedConversation,
      );
    }

    // Emit event
    this.eventEmitter.emit('dialogue.completed', {
      dialogueId,
      status: outcome,
      summary,
    });

    return dialogue;
  }

  /**
   * Create a clarification request
   */
  createClarificationRequest(
    messageId: string,
    type: ClarificationType,
    description: string,
    specificQuestions?: string[],
    options?: any[],
    priority: 'low' | 'medium' | 'high' = 'medium',
  ): ClarificationRequest {
    const request: ClarificationRequest = {
      id: uuidv4(),
      originalMessageId: messageId,
      type,
      description,
      specificQuestions,
      options,
      priority,
    };

    this.clarificationRequests.set(request.id, request);

    return request;
  }

  /**
   * Get all clarification requests related to a message
   */
  getClarificationRequestsForMessage(
    messageId: string,
  ): ClarificationRequest[] {
    const requests: ClarificationRequest[] = [];

    for (const request of this.clarificationRequests.values()) {
      if (request.originalMessageId === messageId) {
        requests.push(request);
      }
    }

    return requests;
  }

  /**
   * Send a clarification request message
   */
  async sendClarificationRequest(
    senderId: string,
    recipientId: string,
    clarificationRequest: ClarificationRequest,
    conversationId: string,
  ): Promise<NaturalAgentMessage> {
    const sender = await this.agentRegistry.getAgent(senderId);
    const recipient = await this.agentRegistry.getAgent(recipientId);

    // Create the message
    const message: NaturalAgentMessage = {
      id: uuidv4(),
      conversationId,
      senderId,
      senderName: sender?.name,
      recipientId,
      recipientName: recipient?.name,
      intent: MessageIntent.CLARIFY,
      modality: CommunicationModality.STRUCTURED_DATA,
      content: clarificationRequest,
      timestamp: Date.now(),
      priority: clarificationRequest.priority === 'high' ? 2 : 1,
      referencedMessageIds: [clarificationRequest.originalMessageId],
      expectations: {
        responseRequired: true,
        responseType: [MessageIntent.INFORM, MessageIntent.CLARIFY],
      },
    };

    // Send the message
    await this.messaging.sendMessage(message);

    return message;
  }

  /**
   * Register a new dialogue template
   */
  registerDialogueTemplate(template: DialogueTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Get a dialogue template by ID
   */
  getDialogueTemplate(templateId: string): DialogueTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Get all dialogue templates by type
   */
  getDialogueTemplatesByType(type: DialogueType): DialogueTemplate[] {
    const templates: DialogueTemplate[] = [];

    for (const template of this.templates.values()) {
      if (template.type === type) {
        templates.push(template);
      }
    }

    return templates;
  }

  /**
   * Get the enhanced conversation context
   */
  getEnhancedConversation(
    conversationId: string,
  ): DialogueEnabledConversation | undefined {
    return this.enhancedConversations.get(conversationId);
  }

  /**
   * Analyze a conversation for dialogue patterns
   */
  analyzeConversation(conversationId: string): any {
    const conversation = this.enhancedConversations.get(conversationId);

    if (!conversation) {
      throw new Error(
        `Conversation with ID ${conversationId} not found or not dialogue-enabled`,
      );
    }

    const messages = this.messaging.getConversationMessages(conversationId);
    const dialogues = this.getDialoguesForConversation(conversationId);

    // This would be implemented with more sophisticated analysis
    // For now, we'll do some basic analysis

    // Count message intents by participant
    const intentsByParticipant: Record<string, Record<string, number>> = {};

    for (const message of messages) {
      if (!intentsByParticipant[message.senderId]) {
        intentsByParticipant[message.senderId] = {};
      }

      const intentCount =
        intentsByParticipant[message.senderId][message.intent] || 0;
      intentsByParticipant[message.senderId][message.intent] = intentCount + 1;
    }

    // Find dominant participants (most messages)
    const messageCountByParticipant: Record<string, number> = {};

    for (const message of messages) {
      messageCountByParticipant[message.senderId] =
        (messageCountByParticipant[message.senderId] || 0) + 1;
    }

    const dominantParticipants = Object.entries(messageCountByParticipant)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([id]) => id);

    // Find unanswered questions
    const questionMessageIds = messages
      .filter(
        (m) =>
          m.intent === MessageIntent.ASK || m.intent === MessageIntent.CLARIFY,
      )
      .map((m) => m.id);

    const answeredMessageIds = messages
      .filter((m) => m.referencedMessageIds?.length)
      .flatMap((m) => m.referencedMessageIds || []);

    const unaddressedQuestions = questionMessageIds.filter(
      (id) => !answeredMessageIds.includes(id),
    );

    // Update the conversation analysis
    if (!conversation.analysis) {
      conversation.analysis = {
        dominantParticipants,
        topicEvolution: [
          {
            topic: conversation.topic || 'General',
            startTime: conversation.startTime,
          },
        ],
        unaddressedQuestions,
      };
    } else {
      conversation.analysis.dominantParticipants = dominantParticipants;
      conversation.analysis.unaddressedQuestions = unaddressedQuestions;
    }

    this.enhancedConversations.set(conversationId, conversation);

    return {
      dialogueCount: dialogues.length,
      activeDialogueCount: dialogues.filter((d) => d.status === 'active')
        .length,
      messageCount: messages.length,
      participantCount: conversation.participants.length,
      intentsByParticipant,
      dominantParticipants,
      unaddressedQuestionsCount: unaddressedQuestions.length,
    };
  }

  // Private helper methods

  private subscribeToMessages(): void {
    // This would ideally use a more sophisticated filtering mechanism
    this.messaging.subscribeToMessages('dialogue-manager', async (message) => {
      // Process the message for dialogue tracking
      await this.processMessage(message);
    });
  }

  private async processMessage(message: NaturalAgentMessage): Promise<void> {
    // Check if this message is part of a dialogue-enabled conversation
    if (!this.enhancedConversations.has(message.conversationId)) {
      // Check if there's a regular conversation we can enhance
      const conversation = this.messaging.getConversation(
        message.conversationId,
      );
      if (conversation) {
        this.enhanceConversation(message.conversationId);
      }
    }

    // Get the enhanced conversation
    const conversation = this.enhancedConversations.get(message.conversationId);
    if (!conversation) return;

    // Check for active dialogues in this conversation
    for (const dialogueId of conversation.activeDialogues) {
      const dialogue = this.dialogues.get(dialogueId);

      if (dialogue) {
        // Update the dialogue's last update time
        dialogue.lastUpdateTime = message.timestamp;
        this.dialogues.set(dialogueId, dialogue);

        // Check if this message should trigger a phase transition
        await this.checkForPhaseTransition(dialogue, message);
      }
    }
  }

  private async checkForPhaseTransition(
    dialogue: DialogueState,
    message: NaturalAgentMessage,
  ): Promise<void> {
    // This would be implemented with more sophisticated rules
    // For now, we'll use some basic transition rules

    // If template is defined, use it for transition logic
    if (dialogue.metadata?.templateId) {
      const template = this.templates.get(dialogue.metadata.templateId);
      if (template) {
        // Apply template-specific logic
        this.applyTemplateTransitionLogic(dialogue, message, template);
        return;
      }
    }

    // Default transition logic based on intent and current phase
    switch (dialogue.currentPhase) {
      case DialoguePhase.INITIATION:
        if (
          message.intent === MessageIntent.ACKNOWLEDGE ||
          message.intent === MessageIntent.AGREE
        ) {
          this.updateDialoguePhase(
            dialogue.dialogueId,
            DialoguePhase.EXPLORATION,
            'Acknowledged initiation',
            message,
          );
        }
        break;

      case DialoguePhase.EXPLORATION:
        if (
          message.intent === MessageIntent.PROPOSE ||
          message.intent === MessageIntent.SUGGEST
        ) {
          this.updateDialoguePhase(
            dialogue.dialogueId,
            DialoguePhase.PROPOSAL,
            'Proposal made',
            message,
          );
        }
        break;

      case DialoguePhase.PROPOSAL:
        if (
          message.intent === MessageIntent.COUNTER_PROPOSE ||
          message.intent === MessageIntent.DISAGREE
        ) {
          this.updateDialoguePhase(
            dialogue.dialogueId,
            DialoguePhase.NEGOTIATION,
            'Negotiation started',
            message,
          );
        } else if (
          message.intent === MessageIntent.AGREE ||
          message.intent === MessageIntent.ACCEPT
        ) {
          this.updateDialoguePhase(
            dialogue.dialogueId,
            DialoguePhase.RESOLUTION,
            'Proposal accepted',
            message,
          );
        }
        break;

      case DialoguePhase.NEGOTIATION:
        if (
          message.intent === MessageIntent.AGREE ||
          message.intent === MessageIntent.ACCEPT
        ) {
          this.updateDialoguePhase(
            dialogue.dialogueId,
            DialoguePhase.RESOLUTION,
            'Agreement reached in negotiation',
            message,
          );
        }
        break;

      case DialoguePhase.RESOLUTION:
        if (
          message.intent === MessageIntent.CONFIRM ||
          message.intent === MessageIntent.ACKNOWLEDGE
        ) {
          this.updateDialoguePhase(
            dialogue.dialogueId,
            DialoguePhase.CONFIRMATION,
            'Resolution confirmed',
            message,
          );
        }
        break;

      case DialoguePhase.CONFIRMATION:
        if (
          message.intent === MessageIntent.ACKNOWLEDGE ||
          message.intent === MessageIntent.THANK ||
          message.intent === MessageIntent.FAREWELL
        ) {
          this.updateDialoguePhase(
            dialogue.dialogueId,
            DialoguePhase.CONCLUSION,
            'Dialogue concluded',
            message,
          );

          // Auto-complete the dialogue
          this.completeDialogue(
            dialogue.dialogueId,
            'completed',
            'Successfully completed all phases of dialogue',
          );
        }
        break;
    }
  }

  private applyTemplateTransitionLogic(
    dialogue: DialogueState,
    message: NaturalAgentMessage,
    template: DialogueTemplate,
  ): void {
    // Get the current phase index in the template
    const currentPhaseIndex = template.phases.indexOf(dialogue.currentPhase);

    if (
      currentPhaseIndex < 0 ||
      currentPhaseIndex >= template.phases.length - 1
    ) {
      return; // Can't transition
    }

    // Get expected messages for this phase
    const expectedMessages = template.expectedMessages.filter(
      (m) => m.phase === dialogue.currentPhase,
    );

    // Check if this message matches expectations
    const matchesExpectation = expectedMessages.some((expected) => {
      const senderMatches =
        expected.sender === 'any' ||
        (expected.sender === 'initiator' &&
          message.senderId === dialogue.initiator) ||
        (expected.sender === 'responder' &&
          message.senderId !== dialogue.initiator);

      const intentMatches = expected.intents.includes(message.intent);

      return senderMatches && intentMatches;
    });

    if (matchesExpectation) {
      // Move to the next phase
      const nextPhase = template.phases[currentPhaseIndex + 1];

      this.updateDialoguePhase(
        dialogue.dialogueId,
        nextPhase,
        `Template transition: ${dialogue.currentPhase} → ${nextPhase}`,
        message,
      );
    }
  }

  private enhanceConversation(
    conversationId: string,
    dialogueId?: string,
  ): DialogueEnabledConversation {
    // Get the base conversation
    const baseConversation = this.messaging.getConversation(conversationId);

    if (!baseConversation) {
      throw new Error(`Conversation with ID ${conversationId} not found`);
    }

    // Check if already enhanced
    let enhancedConversation = this.enhancedConversations.get(conversationId);

    if (!enhancedConversation) {
      // Create enhanced conversation
      enhancedConversation = {
        ...baseConversation,
        activeDialogues: [],
        dialogueHistory: [],
      };
    }

    // Add dialogue if specified
    if (dialogueId) {
      if (!enhancedConversation.activeDialogues.includes(dialogueId)) {
        enhancedConversation.activeDialogues.push(dialogueId);
      }

      if (!enhancedConversation.dialogueHistory.includes(dialogueId)) {
        enhancedConversation.dialogueHistory.push(dialogueId);
      }
    }

    // Store the enhanced conversation
    this.enhancedConversations.set(conversationId, enhancedConversation);

    return enhancedConversation;
  }

  private createConversation(
    participants: string[],
    topic?: string,
  ): ConversationContext {
    return this.messaging.createConversation(participants, topic);
  }

  private initializeDefaultTemplates(): void {
    // Information exchange template
    this.registerDialogueTemplate({
      id: 'information-exchange',
      name: 'Information Exchange',
      type: DialogueType.INFORMATION_EXCHANGE,
      description: 'Standard information exchange between agents',
      phases: [
        DialoguePhase.INITIATION,
        DialoguePhase.EXPLORATION,
        DialoguePhase.RESOLUTION,
        DialoguePhase.CONCLUSION,
      ],
      expectedMessages: [
        {
          phase: DialoguePhase.INITIATION,
          sender: 'initiator',
          intents: [MessageIntent.ASK, MessageIntent.REQUEST],
          required: true,
          description: 'Initial request for information',
        },
        {
          phase: DialoguePhase.INITIATION,
          sender: 'responder',
          intents: [MessageIntent.ACKNOWLEDGE],
          required: false,
          description: 'Acknowledgment of request',
        },
        {
          phase: DialoguePhase.EXPLORATION,
          sender: 'responder',
          intents: [MessageIntent.INFORM, MessageIntent.CLARIFY],
          required: true,
          description: 'Providing requested information',
        },
        {
          phase: DialoguePhase.RESOLUTION,
          sender: 'initiator',
          intents: [MessageIntent.ACKNOWLEDGE, MessageIntent.THANK],
          required: true,
          description: 'Confirmation of information receipt',
        },
        {
          phase: DialoguePhase.CONCLUSION,
          sender: 'any',
          intents: [MessageIntent.ACKNOWLEDGE],
          required: false,
          description: 'Final acknowledgment',
        },
      ],
      successCriteria: {
        requiredPhases: [
          DialoguePhase.INITIATION,
          DialoguePhase.EXPLORATION,
          DialoguePhase.RESOLUTION,
        ],
        requiredIntents: [MessageIntent.ASK, MessageIntent.INFORM],
      },
      estimatedDuration: 60000, // 1 minute
    });

    // Negotiation template
    this.registerDialogueTemplate({
      id: 'negotiation',
      name: 'Negotiation',
      type: DialogueType.NEGOTIATION,
      description: 'Negotiation process between agents',
      phases: [
        DialoguePhase.INITIATION,
        DialoguePhase.PROPOSAL,
        DialoguePhase.NEGOTIATION,
        DialoguePhase.RESOLUTION,
        DialoguePhase.CONFIRMATION,
        DialoguePhase.CONCLUSION,
      ],
      expectedMessages: [
        {
          phase: DialoguePhase.INITIATION,
          sender: 'initiator',
          intents: [MessageIntent.PROPOSE],
          required: true,
          description: 'Initial proposal',
        },
        {
          phase: DialoguePhase.PROPOSAL,
          sender: 'responder',
          intents: [
            MessageIntent.ACCEPT,
            MessageIntent.REJECT,
            MessageIntent.COUNTER_PROPOSE,
          ],
          required: true,
          description: 'Response to proposal',
        },
        {
          phase: DialoguePhase.NEGOTIATION,
          sender: 'any',
          intents: [
            MessageIntent.COUNTER_PROPOSE,
            MessageIntent.ACCEPT,
            MessageIntent.REJECT,
          ],
          required: false,
          description: 'Negotiation back and forth',
        },
        {
          phase: DialoguePhase.RESOLUTION,
          sender: 'any',
          intents: [MessageIntent.ACCEPT, MessageIntent.AGREE],
          required: true,
          description: 'Agreement on terms',
        },
        {
          phase: DialoguePhase.CONFIRMATION,
          sender: 'any',
          intents: [MessageIntent.CONFIRM],
          required: true,
          description: 'Confirmation of agreement',
        },
        {
          phase: DialoguePhase.CONCLUSION,
          sender: 'any',
          intents: [MessageIntent.ACKNOWLEDGE, MessageIntent.THANK],
          required: false,
          description: 'Conclusion of negotiation',
        },
      ],
      successCriteria: {
        requiredPhases: [
          DialoguePhase.INITIATION,
          DialoguePhase.RESOLUTION,
          DialoguePhase.CONFIRMATION,
        ],
        requiredIntents: [
          MessageIntent.PROPOSE,
          MessageIntent.ACCEPT,
          MessageIntent.CONFIRM,
        ],
      },
      estimatedDuration: 300000, // 5 minutes
    });
  }
}
