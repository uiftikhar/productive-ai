/**
 * Meeting Context Service
 * Handles meeting-specific context operations like tracking decisions, action items, and questions
 */

import { RecordMetadata } from '@pinecone-database/pinecone';
import { BaseContextService } from './base-context.service.ts';
import { MetadataValidationService } from './metadata-validation.service.ts';
import { 
  BaseContextMetadata, 
  ContextType,
  USER_CONTEXT_INDEX,
  ActionItemStatus,
  UserContextNotFoundError,
  UserContextValidationError,
} from '../types/context.types.ts';

/**
 * Service for managing meeting-related context operations
 */
export class MeetingContextService extends BaseContextService {
  private metadataValidator: MetadataValidationService;

  constructor(options: any = {}) {
    super(options);
    this.metadataValidator = new MetadataValidationService();
  }

  /**
   * Store meeting content in the context database
   * @param userId User identifier
   * @param meetingId Unique meeting identifier
   * @param meetingTitle Title of the meeting
   * @param content The meeting content/transcript
   * @param embeddings Vector embeddings for the content
   * @param participantIds IDs of meeting participants
   * @param meetingStartTime When the meeting started
   * @param meetingEndTime When the meeting ended
   * @param metadata Additional metadata about the meeting
   * @returns The ID of the stored meeting content
   */
  async storeMeetingContent(
    userId: string,
    meetingId: string,
    meetingTitle: string,
    content: string,
    embeddings: number[],
    participantIds: string[] = [],
    meetingStartTime?: number,
    meetingEndTime?: number,
    metadata: Partial<BaseContextMetadata> = {},
  ): Promise<string> {
    if (!meetingId) {
      throw new UserContextValidationError('Meeting ID is required');
    }

    const timestamp = Date.now();

    return this.storeUserContext(userId, content, embeddings, {
      contextType: ContextType.MEETING,
      meetingId,
      meetingTitle,
      participantIds,
      meetingStartTime: meetingStartTime || timestamp,
      meetingEndTime: meetingEndTime,
      timestamp,
      ...metadata,
    });
  }

  /**
   * Store a meeting agenda item in the context database
   * @param userId User identifier
   * @param meetingId Meeting identifier
   * @param agendaItemId Unique agenda item identifier
   * @param agendaItemTitle Title of the agenda item
   * @param content The agenda item content
   * @param embeddings Vector embeddings for the content
   * @param metadata Additional metadata about the agenda item
   * @returns The ID of the stored agenda item
   */
  async storeAgendaItem(
    userId: string,
    meetingId: string,
    agendaItemId: string,
    agendaItemTitle: string,
    content: string,
    embeddings: number[],
    metadata: Partial<BaseContextMetadata> = {},
  ): Promise<string> {
    if (!meetingId || !agendaItemId) {
      throw new UserContextValidationError('Meeting ID and Agenda Item ID are required');
    }

    return this.storeUserContext(userId, content, embeddings, {
      contextType: ContextType.AGENDA_ITEM,
      meetingId,
      agendaItemId,
      agendaItemTitle,
      timestamp: Date.now(),
      ...metadata,
    });
  }

  /**
   * Store a decision made in a meeting
   * @param userId User identifier
   * @param meetingId Meeting identifier
   * @param decisionId Unique decision identifier
   * @param decision The decision text
   * @param decisionSummary A summary of the decision
   * @param embeddings Vector embeddings for the decision
   * @param metadata Additional metadata about the decision
   * @returns The ID of the stored decision
   */
  async storeDecision(
    userId: string,
    meetingId: string,
    decisionId: string,
    decision: string,
    decisionSummary: string | null,
    embeddings: number[],
    metadata: Partial<BaseContextMetadata> = {},
  ): Promise<string> {
    if (!meetingId || !decisionId) {
      throw new UserContextValidationError('Meeting ID and Decision ID are required');
    }

    return this.storeUserContext(userId, decision, embeddings, {
      contextType: ContextType.DECISION,
      meetingId,
      decisionId,
      decisionSummary: decisionSummary || undefined,
      isDecision: true,
      timestamp: Date.now(),
      ...metadata,
    });
  }

  /**
   * Store an action item assigned in a meeting
   * @param userId User identifier
   * @param meetingId Meeting identifier
   * @param actionItemId Unique action item identifier
   * @param actionItem The action item text
   * @param assigneeId User ID of the assignee
   * @param dueDate Due date timestamp
   * @param embeddings Vector embeddings for the action item
   * @param metadata Additional metadata about the action item
   * @returns The ID of the stored action item
   */
  async storeActionItem(
    userId: string,
    meetingId: string,
    actionItemId: string,
    actionItem: string,
    assigneeId: string,
    dueDate: number | null,
    embeddings: number[],
    metadata: Partial<BaseContextMetadata> = {},
  ): Promise<string> {
    if (!meetingId || !actionItemId) {
      throw new UserContextValidationError('Meeting ID and Action Item ID are required');
    }

    return this.storeUserContext(userId, actionItem, embeddings, {
      contextType: ContextType.ACTION_ITEM,
      meetingId,
      actionItemId,
      assigneeId,
      dueDate: dueDate || undefined,
      status: ActionItemStatus.PENDING,
      isActionItem: true,
      timestamp: Date.now(),
      ...metadata,
    });
  }

  /**
   * Update the status of an action item
   * @param userId User identifier
   * @param actionItemId Action item identifier
   * @param status New status for the action item
   * @returns True if successfully updated
   */
  async updateActionItemStatus(
    userId: string,
    actionItemId: string,
    status: ActionItemStatus,
  ): Promise<boolean> {
    // Find the action item
    const result = await this.executeWithRetry(
      () => this.pineconeService.queryVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [], // Empty vector for metadata-only query
        {
          topK: 1,
          filter: {
            contextType: ContextType.ACTION_ITEM,
            actionItemId,
          },
          includeValues: true,
          includeMetadata: true,
        },
        userId,
      ),
      `findActionItem:${userId}:${actionItemId}`,
    );

    if (!result.matches || result.matches.length === 0) {
      throw new UserContextNotFoundError(actionItemId, userId);
    }

    const actionItem = result.matches[0];
    const values = this.ensureNumberArray(actionItem.values);

    // Update the status
    await this.executeWithRetry(
      () => this.pineconeService.upsertVectors(
        USER_CONTEXT_INDEX,
        [
          {
            id: actionItem.id,
            values,
            metadata: this.prepareMetadataForStorage({
              ...actionItem.metadata,
              status,
              lastUpdatedAt: Date.now(),
            }),
          },
        ],
        userId,
      ),
      `updateActionItemStatus:${userId}:${actionItemId}`,
    );

    return true;
  }

  /**
   * Store a question asked in a meeting
   * @param userId User identifier
   * @param meetingId Meeting identifier
   * @param questionId Unique question identifier
   * @param question The question text
   * @param embeddings Vector embeddings for the question
   * @param isAnswered Whether the question has been answered
   * @param answerContextId ID of the context that contains the answer
   * @param metadata Additional metadata about the question
   * @returns The ID of the stored question
   */
  async storeQuestion(
    userId: string,
    meetingId: string,
    questionId: string,
    question: string,
    embeddings: number[],
    isAnswered: boolean = false,
    answerContextId?: string,
    metadata: Partial<BaseContextMetadata> = {},
  ): Promise<string> {
    if (!meetingId || !questionId) {
      throw new UserContextValidationError('Meeting ID and Question ID are required');
    }

    return this.storeUserContext(userId, question, embeddings, {
      contextType: ContextType.QUESTION,
      meetingId,
      questionId,
      isQuestion: true,
      isAnswered,
      answerContextId,
      timestamp: Date.now(),
      ...metadata,
    });
  }

  /**
   * Mark a question as answered
   * @param userId User identifier
   * @param questionId Question identifier
   * @param answerContextId ID of the context that contains the answer
   * @returns True if successfully updated
   */
  async markQuestionAsAnswered(
    userId: string,
    questionId: string,
    answerContextId: string,
  ): Promise<boolean> {
    // Find the question
    const result = await this.executeWithRetry(
      () => this.pineconeService.queryVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [], // Empty vector for metadata-only query
        {
          topK: 1,
          filter: {
            contextType: ContextType.QUESTION,
            questionId,
          },
          includeValues: true,
          includeMetadata: true,
        },
        userId,
      ),
      `findQuestion:${userId}:${questionId}`,
    );

    if (!result.matches || result.matches.length === 0) {
      throw new UserContextNotFoundError(questionId, userId);
    }

    const question = result.matches[0];
    const values = this.ensureNumberArray(question.values);

    // Update the question
    await this.executeWithRetry(
      () => this.pineconeService.upsertVectors(
        USER_CONTEXT_INDEX,
        [
          {
            id: question.id,
            values,
            metadata: this.prepareMetadataForStorage({
              ...question.metadata,
              isAnswered: true,
              answerContextId,
              lastUpdatedAt: Date.now(),
            }),
          },
        ],
        userId,
      ),
      `markQuestionAsAnswered:${userId}:${questionId}`,
    );

    return true;
  }

  /**
   * Find unanswered questions
   * @param userId User identifier
   * @param options Options for filtering unanswered questions
   * @returns List of unanswered questions
   */
  async findUnansweredQuestions(
    userId: string,
    options: {
      meetingId?: string;
      topicId?: string;
      timeRangeStart?: number;
      timeRangeEnd?: number;
    } = {},
  ): Promise<any[]> {
    const filter: Record<string, any> = {
      contextType: ContextType.QUESTION,
      isAnswered: false,
    };

    if (options.meetingId) {
      filter.meetingId = options.meetingId;
    }

    if (options.topicId) {
      filter.topicId = options.topicId;
    }

    // Add time range filter if specified
    if (options.timeRangeStart || options.timeRangeEnd) {
      filter.timestamp = {};
      if (options.timeRangeStart) {
        filter.timestamp.$gte = options.timeRangeStart;
      }
      if (options.timeRangeEnd) {
        filter.timestamp.$lte = options.timeRangeEnd;
      }
    }

    const result = await this.executeWithRetry(
      () => this.pineconeService.queryVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [], // Empty vector for metadata-only query
        {
          topK: 1000,
          filter,
          includeValues: false,
          includeMetadata: true,
        },
        userId,
      ),
      `findUnansweredQuestions:${userId}`,
    );

    const questions = result.matches || [];

    return questions.map(q => ({
      id: q.id,
      questionId: q.metadata?.questionId,
      question: q.metadata?.content,
      meetingId: q.metadata?.meetingId,
      meetingTitle: q.metadata?.meetingTitle,
      timestamp: q.metadata?.timestamp,
      metadata: q.metadata,
    }));
  }
}
