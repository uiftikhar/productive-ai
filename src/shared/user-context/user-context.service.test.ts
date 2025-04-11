import { PineconeConnectionService } from '../../pinecone/pinecone-connection.service.ts';
import {
  UserContextService,
  ContextType,
  ActionItemStatus,
  KnowledgeGapType,
  UserContextError,
  UserContextValidationError,
  UserContextNotFoundError,
} from './user-context.service.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';

// Mock the pinecone service
jest.mock('../../pinecone/pinecone-connection.service.ts');

// Mock Logger
class MockLogger implements Logger {
  debug = jest.fn();
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
  setLogLevel = jest.fn();
}

describe('UserContextService', () => {
  let userContextService: UserContextService;
  let mockPineconeService: jest.Mocked<PineconeConnectionService>;
  let mockLogger: MockLogger;

  beforeEach(() => {
    jest.resetAllMocks();
    mockPineconeService =
      new PineconeConnectionService() as jest.Mocked<PineconeConnectionService>;
    mockLogger = new MockLogger();
    userContextService = new UserContextService({
      pineconeService: mockPineconeService,
      logger: mockLogger,
    });
  });

  describe('initialization', () => {
    it('should initialize correctly', async () => {
      mockPineconeService.initialize = jest.fn().mockResolvedValue(undefined);
      mockPineconeService.getIndex = jest.fn().mockResolvedValue({});

      await userContextService.initialize();

      expect(mockPineconeService.initialize).toHaveBeenCalled();
      expect(mockPineconeService.getIndex).toHaveBeenCalledWith('user-context');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing UserContextService',
      );
    });

    it('should handle index not existing', async () => {
      mockPineconeService.initialize = jest.fn().mockResolvedValue(undefined);
      mockPineconeService.getIndex = jest
        .fn()
        .mockRejectedValue(new Error('Index not found'));

      await userContextService.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("doesn't exist"),
      );
    });
  });

  describe('executeWithRetry', () => {
    it('should retry failed operations', async () => {
      // This is a private method, so we need to expose it for testing
      const executeWithRetry = jest.spyOn(
        userContextService as any,
        'executeWithRetry',
      );
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValueOnce('success');

      // Call through executeWithRetry
      const result = await (userContextService as any).executeWithRetry(
        operation,
        'testOperation',
        2,
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Retrying UserContextService operation testOperation',
        expect.any(Object),
      );
    });

    it('should throw after max retries', async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(new Error('Persistent error'));

      await expect(
        (userContextService as any).executeWithRetry(
          operation,
          'testOperation',
          2,
        ),
      ).rejects.toThrow('Persistent error');

      expect(operation).toHaveBeenCalledTimes(3); // Initial attempt + 2 retries
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Max retries reached for UserContextService operation: testOperation',
        expect.any(Object),
      );
    }, 15000); // Increase timeout to 15 seconds
  });

  describe('Meeting content methods', () => {
    it('should store meeting content', async () => {
      const mockContextId = 'meeting-123';
      jest
        .spyOn(userContextService as any, 'generateContextId')
        .mockReturnValue(mockContextId);
      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});

      const result = await userContextService.storeMeetingContent(
        'user1',
        'meeting1',
        'Weekly Standup',
        'This is the meeting transcript...',
        [0.1, 0.2, 0.3],
        ['user1', 'user2'],
        1617184000000,
        1617187600000,
      );

      expect(result).toBe(mockContextId);
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        expect.arrayContaining([
          expect.objectContaining({
            id: mockContextId,
            metadata: expect.objectContaining({
              contextType: ContextType.MEETING,
              meetingId: 'meeting1',
              meetingTitle: 'Weekly Standup',
              participantIds: ['user1', 'user2'],
            }),
          }),
        ]),
        'user1',
      );
    });

    it('should validate meeting ID is required', async () => {
      await expect(
        userContextService.storeMeetingContent(
          'user1',
          '', // Empty meeting ID
          'Weekly Standup',
          'Meeting content',
          [0.1, 0.2, 0.3],
        ),
      ).rejects.toThrow(UserContextValidationError);
    });
  });

  describe('Decision tracking methods', () => {
    it('should store a decision', async () => {
      const mockContextId = 'decision-123';
      jest
        .spyOn(userContextService as any, 'generateContextId')
        .mockReturnValue(mockContextId);
      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});

      const result = await userContextService.storeDecision(
        'user1',
        'meeting1',
        'decision1',
        'We will use TypeScript for the project',
        'Use TypeScript',
        [0.1, 0.2, 0.3],
      );

      expect(result).toBe(mockContextId);
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        expect.arrayContaining([
          expect.objectContaining({
            id: mockContextId,
            metadata: expect.objectContaining({
              contextType: ContextType.DECISION,
              meetingId: 'meeting1',
              decisionId: 'decision1',
              isDecision: true,
            }),
          }),
        ]),
        'user1',
      );
    });
  });

  describe('Action item methods', () => {
    it('should store an action item', async () => {
      const mockContextId = 'action-123';
      jest
        .spyOn(userContextService as any, 'generateContextId')
        .mockReturnValue(mockContextId);
      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});

      const result = await userContextService.storeActionItem(
        'user1',
        'meeting1',
        'action1',
        'Setup TypeScript project',
        'john',
        1617250000000, // Due date
        [0.1, 0.2, 0.3],
      );

      expect(result).toBe(mockContextId);
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        expect.arrayContaining([
          expect.objectContaining({
            id: mockContextId,
            metadata: expect.objectContaining({
              contextType: ContextType.ACTION_ITEM,
              meetingId: 'meeting1',
              actionItemId: 'action1',
              assigneeId: 'john',
              dueDate: 1617250000000,
              isActionItem: true,
              status: ActionItemStatus.PENDING,
            }),
          }),
        ]),
        'user1',
      );
    });

    it('should update action item status', async () => {
      // Mock query to find the action item
      mockPineconeService.queryVectors = jest.fn().mockResolvedValue({
        matches: [
          {
            id: 'action-record-id',
            values: [0.1, 0.2, 0.3],
            metadata: {
              actionItemId: 'action1',
              status: ActionItemStatus.PENDING,
              assigneeId: 'john',
            },
          },
        ],
      });

      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});

      const result = await userContextService.updateActionItemStatus(
        'user1',
        'action1',
        ActionItemStatus.IN_PROGRESS,
      );

      expect(result).toBe(true);
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'action-record-id',
            metadata: expect.objectContaining({
              status: ActionItemStatus.IN_PROGRESS,
              lastUpdatedAt: expect.any(Number),
            }),
          }),
        ]),
        'user1',
      );
    });

    it('should throw when action item not found', async () => {
      mockPineconeService.queryVectors = jest.fn().mockResolvedValue({
        matches: [], // Empty result
      });

      await expect(
        userContextService.updateActionItemStatus(
          'user1',
          'non-existent-action',
          ActionItemStatus.IN_PROGRESS,
        ),
      ).rejects.toThrow(UserContextNotFoundError);
    });
  });

  describe('Question tracking methods', () => {
    it('should store a question', async () => {
      const mockContextId = 'question-123';
      jest
        .spyOn(userContextService as any, 'generateContextId')
        .mockReturnValue(mockContextId);
      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});

      const result = await userContextService.storeQuestion(
        'user1',
        'meeting1',
        'question1',
        'What is the timeline for the project?',
        [0.1, 0.2, 0.3],
        false,
      );

      expect(result).toBe(mockContextId);
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        expect.arrayContaining([
          expect.objectContaining({
            id: mockContextId,
            metadata: expect.objectContaining({
              contextType: ContextType.QUESTION,
              meetingId: 'meeting1',
              questionId: 'question1',
              isQuestion: true,
              isAnswered: false,
            }),
          }),
        ]),
        'user1',
      );
    });

    it('should mark a question as answered', async () => {
      // Mock query to find the question
      mockPineconeService.queryVectors = jest.fn().mockResolvedValue({
        matches: [
          {
            id: 'question-record-id',
            values: [0.1, 0.2, 0.3],
            metadata: {
              questionId: 'question1',
              isAnswered: false,
            },
          },
        ],
      });

      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});

      const result = await userContextService.markQuestionAsAnswered(
        'user1',
        'question1',
        'answer-context-id',
      );

      expect(result).toBe(true);
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'question-record-id',
            metadata: expect.objectContaining({
              isAnswered: true,
              answerContextId: 'answer-context-id',
            }),
          }),
        ]),
        'user1',
      );
    });
  });

  describe('Topic tracking methods', () => {
    it('should track a topic across meetings', async () => {
      const mockContextId = 'topic-123';
      jest
        .spyOn(userContextService as any, 'generateContextId')
        .mockReturnValue(mockContextId);
      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});

      const result = await userContextService.trackTopicAcrossMeetings(
        'user1',
        'topic1',
        'Project Timeline',
        ['meeting1', 'meeting2'],
        [0.1, 0.2, 0.3],
      );

      expect(result).toBe(mockContextId);
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        expect.arrayContaining([
          expect.objectContaining({
            id: mockContextId,
            metadata: expect.objectContaining({
              contextType: ContextType.TOPIC,
              topicId: 'topic1',
              topicName: 'Project Timeline',
              relatedMeetingIds: ['meeting1', 'meeting2'],
            }),
          }),
        ]),
        'user1',
      );
    });

    it('should update topic meetings', async () => {
      // Mock query to find the topic
      mockPineconeService.queryVectors = jest.fn().mockResolvedValue({
        matches: [
          {
            id: 'topic-record-id',
            values: [0.1, 0.2, 0.3],
            metadata: {
              topicId: 'topic1',
              relatedMeetingIds: ['meeting1', 'meeting2'],
            },
          },
        ],
      });

      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});

      const result = await userContextService.updateTopicMeetings(
        'user1',
        'topic1',
        ['meeting3', 'meeting4'],
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: 'topic-record-id',
          metadata: expect.objectContaining({
            relatedMeetingIds: ['meeting1', 'meeting2', 'meeting3', 'meeting4'],
          }),
        }),
      );

      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'topic-record-id',
            metadata: expect.objectContaining({
              relatedMeetingIds: [
                'meeting1',
                'meeting2',
                'meeting3',
                'meeting4',
              ],
            }),
          }),
        ]),
        'user1',
      );
    });

    it('should get topic evolution', async () => {
      // Mock query to find the topic
      mockPineconeService.queryVectors = jest
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: [
              {
                id: 'topic-record-id',
                metadata: {
                  topicId: 'topic1',
                  topicName: 'Project Timeline',
                  relatedMeetingIds: ['meeting1', 'meeting2'],
                },
              },
            ],
          }),
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: [
              {
                id: 'meeting1-entry',
                metadata: {
                  meetingId: 'meeting1',
                  timestamp: 1617100000000,
                },
              },
              {
                id: 'meeting2-entry',
                metadata: {
                  meetingId: 'meeting2',
                  timestamp: 1617200000000,
                },
              },
            ],
          }),
        );

      const result = await userContextService.getTopicEvolution(
        'user1',
        'topic1',
      );

      expect(result).toEqual({
        topicInfo: {
          topicId: 'topic1',
          topicName: 'Project Timeline',
          relatedMeetingIds: ['meeting1', 'meeting2'],
        },
        timelineEntries: [
          {
            id: 'meeting1-entry',
            metadata: {
              meetingId: 'meeting1',
              timestamp: 1617100000000,
            },
          },
          {
            id: 'meeting2-entry',
            metadata: {
              meetingId: 'meeting2',
              timestamp: 1617200000000,
            },
          },
        ],
      });
    });
  });

  describe('Knowledge gap detection methods', () => {
    it('should detect missing information knowledge gaps', async () => {
      // Mock team 1 having context but team 2 having none
      mockPineconeService.queryVectors = jest
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: [
              {
                id: 'team1-context-1',
                values: [0.1, 0.2, 0.3],
                metadata: { participantIds: 'team1' },
              },
            ],
          }),
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: [], // Team 2 has no context on this topic
          }),
        );

      const result = await userContextService.detectKnowledgeGaps(
        'user1',
        ['team1', 'team2'],
        [[0.1, 0.2, 0.3]], // Topic embedding
        ['Project Architecture'], // Topic name
        0.7, // Threshold
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          gapType: KnowledgeGapType.MISSING_INFORMATION,
          topicName: 'Project Architecture',
          teamId1: 'team1',
          teamId2: 'team2',
          similarityScore: 0,
        }),
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Detected knowledge gaps',
        expect.any(Object),
      );
    });

    it('should detect misalignment knowledge gaps', async () => {
      // Mock two teams having different context (low similarity)
      mockPineconeService.queryVectors = jest
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: [
              {
                id: 'team1-context-1',
                values: [0.1, 0.2, 0.3],
                metadata: { participantIds: 'team1' },
              },
            ],
          }),
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: [
              {
                id: 'team2-context-1',
                values: [-0.1, -0.2, -0.3], // Very different embedding
                metadata: { participantIds: 'team2' },
              },
            ],
          }),
        );

      // Mock calculateCosineSimilarity to return a low value
      jest
        .spyOn(userContextService as any, 'calculateCosineSimilarity')
        .mockReturnValue(0.3);

      const result = await userContextService.detectKnowledgeGaps(
        'user1',
        ['team1', 'team2'],
        [[0.1, 0.2, 0.3]], // Topic embedding
        ['Project Architecture'], // Topic name
        0.7, // Threshold
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          gapType: KnowledgeGapType.MISALIGNMENT,
          topicName: 'Project Architecture',
          teamId1: 'team1',
          teamId2: 'team2',
          similarityScore: 0.3,
        }),
      );
    });

    it('should return empty array when no gaps detected', async () => {
      // Mock two teams having similar context (high similarity)
      mockPineconeService.queryVectors = jest
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: [
              {
                id: 'team1-context-1',
                values: [0.1, 0.2, 0.3],
                metadata: { participantIds: 'team1' },
              },
            ],
          }),
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: [
              {
                id: 'team2-context-1',
                values: [0.1, 0.2, 0.3], // Similar embedding
                metadata: { participantIds: 'team2' },
              },
            ],
          }),
        );

      // Mock calculateCosineSimilarity to return a high value
      jest
        .spyOn(userContextService as any, 'calculateCosineSimilarity')
        .mockReturnValue(0.9);

      const result = await userContextService.detectKnowledgeGaps(
        'user1',
        ['team1', 'team2'],
        [[0.1, 0.2, 0.3]], // Topic embedding
        ['Project Architecture'], // Topic name
        0.7, // Threshold
      );

      expect(result).toHaveLength(0);
    });

    it('should validate inputs correctly', async () => {
      // Test with less than 2 teams
      await expect(
        userContextService.detectKnowledgeGaps(
          'user1',
          ['team1'], // Only one team
          [[0.1, 0.2, 0.3]],
          ['Topic'],
        ),
      ).rejects.toThrow(UserContextValidationError);

      // Test with mismatched arrays
      await expect(
        userContextService.detectKnowledgeGaps(
          'user1',
          ['team1', 'team2'],
          [[0.1, 0.2, 0.3]], // One embedding
          ['Topic1', 'Topic2'], // Two names
        ),
      ).rejects.toThrow(UserContextValidationError);
    });

    it('should handle errors during knowledge gap detection', async () => {
      mockPineconeService.queryVectors = jest
        .fn()
        .mockRejectedValue(new Error('Query failed'));

      await expect(
        userContextService.detectKnowledgeGaps(
          'user1',
          ['team1', 'team2'],
          [[0.1, 0.2, 0.3]],
          ['Topic'],
          0.7,
        ),
      ).rejects.toThrow(UserContextError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error detecting knowledge gaps',
        expect.any(Object),
      );
    }, 15000); // Increased timeout to 15 seconds
  });

  describe('Unanswered question tracking', () => {
    it('should find unanswered questions for a meeting', async () => {
      mockPineconeService.queryVectors = jest.fn().mockResolvedValue({
        matches: [
          {
            id: 'question1',
            metadata: {
              questionId: 'q1',
              isAnswered: false,
              meetingId: 'meeting1',
            },
          },
        ],
      });

      const result = await userContextService.findUnansweredQuestions('user1', {
        meetingId: 'meeting1',
      });

      expect(result).toHaveLength(1);
      expect(result[0].metadata.questionId).toBe('q1');
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        [],
        expect.objectContaining({
          filter: expect.objectContaining({
            meetingId: 'meeting1',
            isAnswered: false,
          }),
        }),
        'user1',
      );
    });

    it('should find unanswered questions for a topic', async () => {
      // First mock the topic lookup to get related meetings
      mockPineconeService.queryVectors = jest
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: [
              {
                id: 'topic1',
                metadata: {
                  topicId: 'topic1',
                  relatedMeetingIds: ['meeting1', 'meeting2'],
                },
              },
            ],
          }),
        )
        // Then mock the questions lookup
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: [
              {
                id: 'question1',
                metadata: {
                  questionId: 'q1',
                  isAnswered: false,
                  meetingId: 'meeting1',
                },
              },
            ],
          }),
        );

      const result = await userContextService.findUnansweredQuestions('user1', {
        topicId: 'topic1',
      });

      expect(result).toHaveLength(1);
      // Verify that the second query used the meetings from the topic
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        [],
        expect.objectContaining({
          filter: expect.objectContaining({
            meetingId: { $in: ['meeting1', 'meeting2'] },
          }),
        }),
        'user1',
      );
    });
  });

  describe('Pre-meeting context generation', () => {
    it('should generate pre-meeting context', async () => {
      // Mock all the necessary queries
      mockPineconeService.queryVectors = jest
        .fn()
        // First agenda item topics
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: [{ id: 'topic1', metadata: { topicName: 'Topic 1' } }],
          }),
        )
        // First agenda item decisions
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: [
              { id: 'decision1', metadata: { decisionSummary: 'Decision 1' } },
            ],
          }),
        )
        // Action items
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: [
              {
                id: 'action1',
                metadata: {
                  actionItemId: 'a1',
                  status: ActionItemStatus.PENDING,
                },
              },
            ],
          }),
        )
        // Unanswered questions - this would be another queryVectors call via findUnansweredQuestions
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: [{ id: 'question1', metadata: { isAnswered: false } }],
          }),
        )
        // Recent meetings
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: [
              {
                id: 'meeting1',
                metadata: {
                  meetingId: 'prev-meeting',
                  meetingTitle: 'Previous Meeting',
                  participantIds: ['user1', 'user2'],
                },
              },
            ],
          }),
        );

      // Mock getUserContextStats for participant stats
      jest.spyOn(userContextService, 'getUserContextStats').mockResolvedValue({
        totalContextEntries: 10,
        categoryCounts: {},
        contextTypeCounts: {},
        documentCounts: {},
        conversationCounts: {},
      });

      const result = await userContextService.generatePreMeetingContext(
        'user1',
        'meeting-id',
        ['user1', 'user2'],
        [
          {
            agendaItemId: 'agenda1',
            title: 'Agenda Item 1',
            description: 'Discussion about project timeline',
            embeddings: [0.1, 0.2, 0.3],
          },
        ],
      );

      // Check that all the expected properties are present
      expect(result).toHaveProperty('relatedTopics');
      expect(result).toHaveProperty('previousDecisions');
      expect(result).toHaveProperty('openActionItems');
      expect(result).toHaveProperty('unansweredQuestions');
      expect(result).toHaveProperty('recentMeetings');
      expect(result).toHaveProperty('participantStats');

      // Check that the recent meetings were filtered correctly
      expect(result.recentMeetings).toHaveLength(1);
    });

    it('should validate inputs for pre-meeting context', async () => {
      // Test with missing meeting ID
      await expect(
        userContextService.generatePreMeetingContext(
          'user1',
          '', // Empty meeting ID
          ['user1'],
          [
            {
              agendaItemId: 'a1',
              title: 'Title',
              description: 'Desc',
              embeddings: [0.1],
            },
          ],
        ),
      ).rejects.toThrow(UserContextValidationError);

      // Test with empty agenda
      await expect(
        userContextService.generatePreMeetingContext(
          'user1',
          'meeting1',
          ['user1'],
          [], // Empty agenda
        ),
      ).rejects.toThrow(UserContextValidationError);
    });

    it('should handle errors during pre-meeting context generation', async () => {
      mockPineconeService.queryVectors = jest
        .fn()
        .mockRejectedValue(new Error('Query failed'));

      await expect(
        userContextService.generatePreMeetingContext(
          'user1',
          'meeting1',
          ['user1'],
          [
            {
              agendaItemId: 'a1',
              title: 'Title',
              description: 'Desc',
              embeddings: [0.1],
            },
          ],
        ),
      ).rejects.toThrow(UserContextError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error generating pre-meeting context',
        expect.any(Object),
      );
    }, 15000); // Increased timeout to 15 seconds
  });

  describe('External system integration', () => {
    it('should integrate action items with external systems', async () => {
      // Mock finding the action item
      mockPineconeService.queryVectors = jest.fn().mockResolvedValue({
        matches: [
          {
            id: 'action1',
            values: [0.1, 0.2, 0.3],
            metadata: {
              actionItemId: 'a1',
              status: ActionItemStatus.PENDING,
            },
          },
        ],
      });

      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});

      const result =
        await userContextService.integrateActionItemWithExternalSystem(
          'user1',
          'a1',
          'jira',
          'JIRA-123',
          { priority: 'high' },
        );

      expect(result).toBe('JIRA-123');
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        expect.arrayContaining([
          expect.objectContaining({
            metadata: expect.objectContaining({
              externalSystem: 'jira',
              externalSystemId: 'JIRA-123',
              externalSystemData: expect.any(String), // JSON string
            }),
          }),
        ]),
        'user1',
      );
    });

    it('should generate a new external ID if none provided', async () => {
      // Mock finding the action item
      mockPineconeService.queryVectors = jest.fn().mockResolvedValue({
        matches: [
          {
            id: 'action1',
            values: [0.1, 0.2, 0.3],
            metadata: {
              actionItemId: 'a1',
            },
          },
        ],
      });

      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});

      const result =
        await userContextService.integrateActionItemWithExternalSystem(
          'user1',
          'a1',
          'jira',
        );

      expect(result).toContain('ext-jira-');
    });

    it('should validate inputs for external system integration', async () => {
      await expect(
        userContextService.integrateActionItemWithExternalSystem(
          'user1',
          '', // Empty action item ID
          'jira',
        ),
      ).rejects.toThrow(UserContextValidationError);

      await expect(
        userContextService.integrateActionItemWithExternalSystem(
          'user1',
          'a1',
          '', // Empty external system
        ),
      ).rejects.toThrow(UserContextValidationError);
    });
  });

  describe('Advanced context retrieval with pagination', () => {
    it('should retrieve context with pagination', async () => {
      // Mock the count query
      mockPineconeService.queryVectors = jest
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: Array(25)
              .fill(0)
              .map((_, i) => ({ id: `item-${i}` })),
          }),
        )
        // Mock the actual retrieval query
        .mockImplementationOnce(() =>
          Promise.resolve({
            matches: Array(25)
              .fill(0)
              .map((_, i) => ({
                id: `item-${i}`,
                score: 0.9 - i * 0.01,
                metadata: {
                  timestamp: Date.now() - i * 86400 * 1000, // i days ago
                  viewCount: Math.floor(Math.random() * 10),
                },
              })),
          }),
        );

      const result = await userContextService.retrieveContextWithPagination(
        'user1',
        [0.1, 0.2, 0.3],
        {
          pageSize: 10,
          pageNumber: 2,
          contextTypes: [ContextType.DOCUMENT, ContextType.MEETING],
        },
      );

      expect(result.totalCount).toBe(25);
      expect(result.pageCount).toBe(3); // 25 items with page size 10 = 3 pages
      expect(result.currentPage).toBe(2);
      expect(result.results).toHaveLength(10); // Second page has 10 items

      // Verify filter was applied correctly
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        [0.1, 0.2, 0.3],
        expect.objectContaining({
          filter: expect.objectContaining({
            contextType: { $in: [ContextType.DOCUMENT, ContextType.MEETING] },
          }),
        }),
        'user1',
      );

      // Each result should have both original and enhanced scores
      expect(result.results[0]).toHaveProperty('originalScore');
      expect(result.results[0]).toHaveProperty('score');
    });

    it('should warn when page exceeds maximum query size', async () => {
      mockPineconeService.queryVectors = jest
        .fn()
        .mockImplementationOnce(() => Promise.resolve({ matches: [] }))
        .mockImplementationOnce(() => Promise.resolve({ matches: [] }));

      await userContextService.retrieveContextWithPagination(
        'user1',
        [0.1, 0.2, 0.3],
        {
          pageSize: 100,
          pageNumber: 11, // This would require topK=1100
        },
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Requested page exceeds maximum query size',
        expect.any(Object),
      );
    });
  });

  describe('Usage tracking methods', () => {
    it('should record context access', async () => {
      mockPineconeService.fetchVectors = jest.fn().mockResolvedValue({
        records: {
          context1: {
            id: 'context1',
            values: [0.1, 0.2, 0.3],
            metadata: {
              viewCount: 5,
            },
          },
        },
      });

      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});

      await userContextService.recordContextAccess('user1', 'context1');

      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'context1',
            metadata: expect.objectContaining({
              viewCount: 6, // Incremented
              lastAccessedAt: expect.any(Number),
            }),
          }),
        ]),
        'user1',
      );
    });

    it('should handle errors gracefully when recording access', async () => {
      mockPineconeService.fetchVectors = jest
        .fn()
        .mockRejectedValue(new Error('Fetch failed'));

      // Should not throw
      await userContextService.recordContextAccess('user1', 'context1');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to record context access',
        expect.any(Object),
      );
    });

    it('should provide relevance feedback', async () => {
      mockPineconeService.fetchVectors = jest.fn().mockResolvedValue({
        records: {
          context1: {
            id: 'context1',
            values: [0.1, 0.2, 0.3],
            metadata: {},
          },
        },
      });

      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});

      await userContextService.provideRelevanceFeedback(
        'user1',
        'context1',
        0.8,
      );

      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'context1',
            metadata: expect.objectContaining({
              explicitRelevanceFeedback: 0.8,
              lastUpdatedAt: expect.any(Number),
            }),
          }),
        ]),
        'user1',
      );
    });

    it('should validate relevance feedback value', async () => {
      await expect(
        userContextService.provideRelevanceFeedback(
          'user1',
          'context1',
          1.5, // Out of range
        ),
      ).rejects.toThrow(UserContextValidationError);
    });
  });

  describe('Helper methods', () => {
    it('should calculate cosine similarity correctly', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      const vec3 = [1, 0, 0]; // Same as vec1

      const similarity1_2 = (
        userContextService as any
      ).calculateCosineSimilarity(vec1, vec2);
      const similarity1_3 = (
        userContextService as any
      ).calculateCosineSimilarity(vec1, vec3);

      expect(similarity1_2).toBe(0); // Orthogonal vectors have 0 similarity
      expect(similarity1_3).toBe(1); // Identical vectors have similarity 1
    });

    it('should remove duplicates by property', () => {
      const items = [
        { id: 'a', value: 1 },
        { id: 'b', value: 2 },
        { id: 'a', value: 3 }, // Duplicate id
        { id: 'c', value: 4 },
      ];

      const uniqueItems = (
        userContextService as any
      ).removeDuplicatesByProperty(items, 'id');

      expect(uniqueItems).toHaveLength(3);
      expect(uniqueItems.map((item: any) => item.id).sort()).toEqual([
        'a',
        'b',
        'c',
      ]);
      // Should keep the first occurrence
      expect(uniqueItems.find((item: any) => item.id === 'a').value).toBe(1);
    });
  });
});
