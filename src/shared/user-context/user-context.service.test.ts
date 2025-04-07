import { PineconeConnectionService } from '../../pinecone/pinecone-connection.service.ts';
import { UserContextService, ContextType, ActionItemStatus, KnowledgeGapType, UserContextError, UserContextValidationError, UserContextNotFoundError } from './user-context.service.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';

// Mock the pinecone service
jest.mock('../../pinecone/pinecone-connection.service.ts');

// Mock Logger
class MockLogger implements Logger {
  debug = jest.fn();
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

describe('UserContextService', () => {
  let userContextService: UserContextService;
  let mockPineconeService: jest.Mocked<PineconeConnectionService>;
  let mockLogger: MockLogger;

  beforeEach(() => {
    jest.resetAllMocks();
    mockPineconeService = new PineconeConnectionService() as jest.Mocked<PineconeConnectionService>;
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
      expect(mockLogger.info).toHaveBeenCalledWith('Initializing UserContextService');
    });

    it('should handle index not existing', async () => {
      mockPineconeService.initialize = jest.fn().mockResolvedValue(undefined);
      mockPineconeService.getIndex = jest.fn().mockRejectedValue(new Error('Index not found'));
      
      await userContextService.initialize();
      
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('doesn\'t exist'));
    });
  });

  describe('executeWithRetry', () => {
    it('should retry failed operations', async () => {
      // This is a private method, so we need to expose it for testing
      const executeWithRetry = jest.spyOn(userContextService as any, 'executeWithRetry');
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValueOnce('success');
      
      // Call through executeWithRetry
      const result = await (userContextService as any).executeWithRetry(
        operation,
        'testOperation',
        2
      );
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Retrying UserContextService operation testOperation',
        expect.any(Object)
      );
    });

    it('should throw after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Persistent error'));
      
      await expect((userContextService as any).executeWithRetry(
        operation,
        'testOperation',
        2
      )).rejects.toThrow('Persistent error');
      
      expect(operation).toHaveBeenCalledTimes(3); // Initial attempt + 2 retries
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Max retries reached for UserContextService operation: testOperation',
        expect.any(Object)
      );
    });
  });

  describe('Meeting content methods', () => {
    it('should store meeting content', async () => {
      const mockContextId = 'meeting-123';
      jest.spyOn(userContextService as any, 'generateContextId').mockReturnValue(mockContextId);
      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});
      
      const result = await userContextService.storeMeetingContent(
        'user1',
        'meeting1',
        'Weekly Standup',
        'This is the meeting transcript...',
        [0.1, 0.2, 0.3],
        ['user1', 'user2'],
        1617184000000,
        1617187600000
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
            })
          })
        ]),
        'user1'
      );
    });
    
    it('should validate meeting ID is required', async () => {
      await expect(userContextService.storeMeetingContent(
        'user1',
        '', // Empty meeting ID
        'Weekly Standup',
        'Meeting content',
        [0.1, 0.2, 0.3]
      )).rejects.toThrow(UserContextValidationError);
    });
  });

  describe('Decision tracking methods', () => {
    it('should store a decision', async () => {
      const mockContextId = 'decision-123';
      jest.spyOn(userContextService as any, 'generateContextId').mockReturnValue(mockContextId);
      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});
      
      const result = await userContextService.storeDecision(
        'user1',
        'meeting1',
        'decision1',
        'We will use TypeScript for the project',
        'Use TypeScript',
        [0.1, 0.2, 0.3]
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
            })
          })
        ]),
        'user1'
      );
    });
  });

  describe('Action item methods', () => {
    it('should store an action item', async () => {
      const mockContextId = 'action-123';
      jest.spyOn(userContextService as any, 'generateContextId').mockReturnValue(mockContextId);
      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});
      
      const result = await userContextService.storeActionItem(
        'user1',
        'meeting1',
        'action1',
        'Setup TypeScript project',
        'john',
        1617250000000, // Due date
        [0.1, 0.2, 0.3]
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
            })
          })
        ]),
        'user1'
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
            }
          }
        ]
      });
      
      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});
      
      const result = await userContextService.updateActionItemStatus(
        'user1',
        'action1',
        ActionItemStatus.IN_PROGRESS
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
            })
          })
        ]),
        'user1'
      );
    });
    
    it('should throw when action item not found', async () => {
      mockPineconeService.queryVectors = jest.fn().mockResolvedValue({
        matches: [] // Empty result
      });
      
      await expect(userContextService.updateActionItemStatus(
        'user1',
        'non-existent-action',
        ActionItemStatus.IN_PROGRESS
      )).rejects.toThrow(UserContextNotFoundError);
    });
  });
  
  describe('Question tracking methods', () => {
    it('should store a question', async () => {
      const mockContextId = 'question-123';
      jest.spyOn(userContextService as any, 'generateContextId').mockReturnValue(mockContextId);
      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});
      
      const result = await userContextService.storeQuestion(
        'user1',
        'meeting1',
        'question1',
        'What is the timeline for the project?',
        [0.1, 0.2, 0.3],
        false
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
            })
          })
        ]),
        'user1'
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
            }
          }
        ]
      });
      
      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});
      
      const result = await userContextService.markQuestionAsAnswered(
        'user1',
        'question1',
        'answer-context-id'
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
            })
          })
        ]),
        'user1'
      );
    });
  });
  
  describe('Topic tracking methods', () => {
    it('should track a topic across meetings', async () => {
      const mockContextId = 'topic-123';
      jest.spyOn(userContextService as any, 'generateContextId').mockReturnValue(mockContextId);
      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});
      
      const result = await userContextService.trackTopicAcrossMeetings(
        'user1',
        'topic1',
        'Project Timeline',
        ['meeting1', 'meeting2'],
        [0.1, 0.2, 0.3]
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
            })
          })
        ]),
        'user1'
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
            }
          }
        ]
      });
      
      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});
      
      const result = await userContextService.updateTopicMeetings(
        'user1',
        'topic1',
        ['meeting3', 'meeting4']
      );
      
      expect(result).toEqual(expect.objectContaining({
        id: 'topic-record-id',
        metadata: expect.objectContaining({
          relatedMeetingIds: ['meeting1', 'meeting2', 'meeting3', 'meeting4'],
        })
      }));
      
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'topic-record-id',
            metadata: expect.objectContaining({
              relatedMeetingIds: ['meeting1', 'meeting2', 'meeting3', 'meeting4'],
            })
          })
        ]),
        'user1'
      );
    });
    
    it('should get topic evolution', async () => {
      // Mock query to find the topic
      mockPineconeService.queryVectors = jest.fn()
        .mockImplementationOnce(() => Promise.resolve({
          matches: [
            {
              id: 'topic-record-id',
              metadata: {
                topicId: 'topic1',
                topicName: 'Project Timeline',
                relatedMeetingIds: ['meeting1', 'meeting2'],
              }
            }
          ]
        }))
        .mockImplementationOnce(() => Promise.resolve({
          matches: [
            {
              id: 'meeting1-entry',
              metadata: {
                meetingId: 'meeting1',
                timestamp: 1617100000000,
              }
            },
            {
              id: 'meeting2-entry',
              metadata: {
                meetingId: 'meeting2',
                timestamp: 1617200000000,
              }
            }
          ]
        }));
      
      const result = await userContextService.getTopicEvolution(
        'user1',
        'topic1'
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
            }
          },
          {
            id: 'meeting2-entry',
            metadata: {
              meetingId: 'meeting2',
              timestamp: 1617200000000,
            }
          }
        ]
      });
    });
  });
}); 