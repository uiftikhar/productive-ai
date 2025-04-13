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
import { ConsoleLogger } from '../../logger/console-logger.ts';
import { Logger } from '../../logger/logger.interface.ts';

// Types for meeting data
export interface MeetingContent {
  meetingId: string;
  content: string;
  summary?: string;
  date: Date;
  title?: string;
  participants?: string[];
  embedding?: number[];
  participantIds?: string[];
  startTime?: number;
  endTime?: number;
}

export interface ActionItem {
  id: string;
  description: string;
  assignee?: string;
  deadline?: string | null;
  status: 'pending' | 'completed' | 'delayed';
}

export interface Decision {
  id: string;
  description: string;
  context?: string;
}

export interface Question {
  id: string;
  question: string;
  askedBy?: string;
  answer?: string;
  isAnswered: boolean;
  answerContextId?: string;
}

/**
 * Service for managing meeting-related context operations
 */
export class MeetingContextService extends BaseContextService {
  private metadataValidator: MetadataValidationService;
  private meetingContents: Record<string, Record<string, MeetingContent>> = {};
  private actionItems: Record<string, Record<string, ActionItem[]>> = {};
  private decisions: Record<string, Record<string, Decision[]>> = {};
  private questions: Record<string, Record<string, Question[]>> = {};

  protected logger: Logger;

  constructor(options: any = {}, logger?: Logger) {
    super(options);
    this.metadataValidator = new MetadataValidationService();
    this.logger = logger || new ConsoleLogger();
    this.logger?.info('MeetingContextService initialized');
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

    this.logger?.debug(
      `Storing meeting content for user ${userId}, meeting ${meetingId}`,
    );

    // Initialize user storage if needed
    if (!this.meetingContents[userId]) {
      this.meetingContents[userId] = {};
    }

    // Store or update meeting content
    this.meetingContents[userId][meetingId] = {
      meetingId,
      content,
      embedding: embeddings,
      participantIds,
      startTime: meetingStartTime || timestamp,
      endTime: meetingEndTime,
      title: meetingTitle,
      date: new Date(),
    };

    this.logger.debug(`Stored meeting content for meeting ${meetingId}`);

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
      throw new UserContextValidationError(
        'Meeting ID and Agenda Item ID are required',
      );
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
      throw new UserContextValidationError(
        'Meeting ID and Decision ID are required',
      );
    }

    this.logger?.debug(
      `Storing decision for user ${userId}, meeting ${meetingId}`,
    );

    // Initialize storage if needed
    if (!this.decisions[userId]) {
      this.decisions[userId] = {};
    }

    if (!this.decisions[userId][meetingId]) {
      this.decisions[userId][meetingId] = [];
    }

    // Check if decision already exists
    const existingIndex = this.decisions[userId][meetingId].findIndex(
      (item) => item.id === decisionId,
    );

    if (existingIndex >= 0) {
      // Update existing decision
      this.decisions[userId][meetingId][existingIndex] = {
        id: decisionId,
        description: decision,
        context: decisionSummary || undefined,
      };
    } else {
      // Add new decision
      this.decisions[userId][meetingId].push({
        id: decisionId,
        description: decision,
        context: decisionSummary || undefined,
      });
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
      throw new UserContextValidationError(
        'Meeting ID and Action Item ID are required',
      );
    }

    this.logger?.debug(
      `Storing action item for user ${userId}, meeting ${meetingId}`,
    );

    // Initialize storage if needed
    if (!this.actionItems[userId]) {
      this.actionItems[userId] = {};
    }

    if (!this.actionItems[userId][meetingId]) {
      this.actionItems[userId][meetingId] = [];
    }

    // Check if action item already exists
    const existingIndex = this.actionItems[userId][meetingId].findIndex(
      (item) => item.id === actionItemId,
    );

    if (existingIndex >= 0) {
      // Update existing action item
      this.actionItems[userId][meetingId][existingIndex] = {
        id: actionItemId,
        description: actionItem,
        assignee: assigneeId,
        deadline: dueDate ? dueDate.toString() : undefined,
        status: 'pending',
      };
    } else {
      // Add new action item
      this.actionItems[userId][meetingId].push({
        id: actionItemId,
        description: actionItem,
        assignee: assigneeId,
        deadline: dueDate ? dueDate.toString() : undefined,
        status: 'pending',
      });
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
      throw new UserContextValidationError(
        'Meeting ID and Question ID are required',
      );
    }

    this.logger?.debug(
      `Storing question for user ${userId}, meeting ${meetingId}`,
    );

    // Initialize storage if needed
    if (!this.questions[userId]) {
      this.questions[userId] = {};
    }

    if (!this.questions[userId][meetingId]) {
      this.questions[userId][meetingId] = [];
    }

    // Check if question already exists
    const existingIndex = this.questions[userId][meetingId].findIndex(
      (item) => item.id === questionId,
    );

    if (existingIndex >= 0) {
      // Update existing question
      this.questions[userId][meetingId][existingIndex] = {
        id: questionId,
        question,
        isAnswered,
        answerContextId,
        answer: isAnswered ? undefined : '',
      };
    } else {
      // Add new question
      this.questions[userId][meetingId].push({
        id: questionId,
        question,
        isAnswered,
        answerContextId,
        answer: isAnswered ? undefined : '',
      });
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
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
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
      () =>
        this.pineconeService.upsertVectors(
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
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
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

    return questions.map((q) => ({
      id: q.id,
      questionId: q.metadata?.questionId,
      question: q.metadata?.content,
      meetingId: q.metadata?.meetingId,
      meetingTitle: q.metadata?.meetingTitle,
      timestamp: q.metadata?.timestamp,
      metadata: q.metadata,
    }));
  }

  /**
   * Retrieves meeting content by meeting ID
   */
  async getMeetingContent(
    userId: string,
    meetingId: string,
  ): Promise<MeetingContent | null> {
    this.logger?.debug(
      `Retrieving meeting content for user ${userId}, meeting ${meetingId}`,
    );

    if (
      !this.meetingContents[userId] ||
      !this.meetingContents[userId][meetingId]
    ) {
      return null;
    }

    return this.meetingContents[userId][meetingId];
  }

  /**
   * Retrieves all decisions for a meeting
   */
  async getMeetingDecisions(
    userId: string,
    meetingId: string,
  ): Promise<Decision[]> {
    this.logger?.debug(
      `Retrieving decisions for user ${userId}, meeting ${meetingId}`,
    );

    if (!this.decisions[userId] || !this.decisions[userId][meetingId]) {
      return [];
    }

    return this.decisions[userId][meetingId];
  }

  /**
   * Retrieves all action items for a meeting
   */
  async getMeetingActionItems(
    userId: string,
    meetingId: string,
  ): Promise<ActionItem[]> {
    this.logger?.debug(
      `Retrieving action items for user ${userId}, meeting ${meetingId}`,
    );

    if (!this.actionItems[userId] || !this.actionItems[userId][meetingId]) {
      return [];
    }

    return this.actionItems[userId][meetingId];
  }

  /**
   * Retrieves all questions for a meeting
   */
  async getMeetingQuestions(
    userId: string,
    meetingId: string,
  ): Promise<Question[]> {
    this.logger?.debug(
      `Retrieving questions for user ${userId}, meeting ${meetingId}`,
    );

    if (!this.questions[userId] || !this.questions[userId][meetingId]) {
      return [];
    }

    return this.questions[userId][meetingId];
  }

  /**
   * Updates the completion status of an action item
   */
  async updateActionItemStatus(
    userId: string,
    meetingId: string,
    actionItemId: string,
    isCompleted: boolean,
  ): Promise<boolean> {
    if (!this.actionItems[userId] || !this.actionItems[userId][meetingId]) {
      return false;
    }

    const actionItem = this.actionItems[userId][meetingId].find(
      (item) => item.id === actionItemId,
    );

    if (actionItem) {
      actionItem.status = isCompleted ? 'completed' : 'pending';
      this.logger.debug(
        `Updated action item ${actionItemId} completion status to ${isCompleted}`,
      );
      return true;
    }

    return false;
  }

  /**
   * Updates a question with an answer
   */
  async updateQuestionAnswer(
    userId: string,
    meetingId: string,
    questionId: string,
    answer: string,
  ): Promise<boolean> {
    const question = this.questions[userId][meetingId].find(
      (q) => q.id === questionId,
    );

    if (question) {
      question.answer = answer;
      question.isAnswered = true;
      this.logger.debug(`Updated question ${questionId} with an answer`);
      return true;
    }

    return false;
  }

  /**
   * Gets the most recent meetings for a user
   */
  async getRecentMeetings(
    userId: string,
    limit: number = 10,
  ): Promise<MeetingContent[]> {
    this.logger?.debug(`Retrieving recent meetings for user ${userId}`);

    if (!this.meetingContents[userId]) {
      return [];
    }

    // Get all meetings for the user and sort by date (most recent first)
    const meetings = Object.values(this.meetingContents[userId])
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, limit);

    return meetings;
  }

  /**
   * Gets upcoming action items for a user
   */
  async getUpcomingActionItems(
    userId: string,
    limit: number = 10,
  ): Promise<ActionItem[]> {
    if (!this.actionItems[userId]) {
      return [];
    }

    const now = Date.now();

    const allMeetingItems = Object.values(this.actionItems[userId]);
    const pendingItems: ActionItem[] = [];

    for (const meetingItems of allMeetingItems) {
      for (const item of meetingItems) {
        if (item.status === 'pending' && item.deadline) {
          const deadlineTime = new Date(item.deadline).getTime();
          if (!isNaN(deadlineTime) && deadlineTime > now) {
            pendingItems.push(item);
          }
        }
      }
    }

    pendingItems.sort((a: ActionItem, b: ActionItem) => {
      const aTime = new Date(a.deadline || '').getTime();
      const bTime = new Date(b.deadline || '').getTime();
      return aTime - bTime;
    });

    return pendingItems.slice(0, limit);
  }

  /**
   * Searches meeting content using semantic search
   */
  async searchMeetingContent(
    userId: string,
    query: string,
    embedding: number[],
    limit: number = 5,
  ): Promise<MeetingContent[]> {
    if (!this.meetingContents[userId]) {
      return [];
    }

    const userContents = Object.values(this.meetingContents[userId]);
    return userContents.slice(0, limit);
  }
}
