import { MeetingContextService } from '../meeting-context.service';
import { BaseContextService } from '../base-context.service';
import { MetadataValidationService } from '../metadata-validation.service';
import { ContextType, ActionItemStatus } from '../../types/context.types';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';

// Mock dependencies
jest.mock('../base-context.service');
jest.mock('../metadata-validation.service');
jest.mock('../../../../shared/logger/console-logger');

describe('MeetingContextService', () => {
  let service: MeetingContextService;
  let mockPineconeService: any;
  let mockRetryCounter = 0;
  
  beforeEach(() => {
    mockRetryCounter = 0;
    
    // Mock the parent class behavior
    (BaseContextService.prototype as any).executeWithRetry = jest.fn().mockImplementation((fn) => {
      mockRetryCounter++;
      return fn();
    });
    
    (BaseContextService.prototype as any).storeUserContext = jest.fn().mockImplementation(
      (userId, content, embeddings, metadata) => `meeting-context-${Math.floor(Math.random() * 1000)}`
    );
    
    // Create service instance with mocked dependencies
    service = new MeetingContextService({});
    
    // Set up pinecone service mock
    mockPineconeService = {
      queryVectors: jest.fn(),
      upsertVectors: jest.fn().mockResolvedValue({ success: true }),
      deleteVectors: jest.fn().mockResolvedValue({ success: true }),
      fetchVectors: jest.fn()
    };
    (service as any).pineconeService = mockPineconeService;
    
    // Mock utility method
    (service as any).ensureNumberArray = jest.fn().mockImplementation(arr => Array.isArray(arr) ? arr : [0.1, 0.2, 0.3]);
    (service as any).prepareMetadataForStorage = jest.fn().mockImplementation(metadata => metadata);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('storeMeetingContent', () => {
    test('should store meeting content with required parameters', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = 'meeting-456';
      const meetingTitle = 'Weekly Team Sync';
      const content = 'Meeting transcript content';
      const embeddings = [0.1, 0.2, 0.3];
      const participantIds = ['user-1', 'user-2'];
      
      // Act
      const result = await service.storeMeetingContent(
        userId, 
        meetingId, 
        meetingTitle, 
        content, 
        embeddings, 
        participantIds
      );
      
      // Assert
      expect(result).toMatch(/^meeting-context-\d+$/);
      expect(BaseContextService.prototype.storeUserContext).toHaveBeenCalledWith(
        userId,
        content,
        embeddings,
        expect.objectContaining({
          contextType: ContextType.MEETING,
          meetingId,
          meetingTitle,
          participantIds
        })
      );
      
      // Check that meeting was stored in internal cache
      expect((service as any).meetingContents[userId][meetingId]).toBeDefined();
      expect((service as any).meetingContents[userId][meetingId].content).toBe(content);
    });
    
    test('should throw error when meeting ID is not provided', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = '';  // Empty meeting ID
      const meetingTitle = 'Weekly Team Sync';
      const content = 'Meeting transcript content';
      const embeddings = [0.1, 0.2, 0.3];
      
      // Act & Assert
      await expect(service.storeMeetingContent(
        userId, 
        meetingId, 
        meetingTitle, 
        content, 
        embeddings
      )).rejects.toThrow('Meeting ID is required');
    });
    
    test('should store with start and end time when provided', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = 'meeting-456';
      const meetingTitle = 'Weekly Team Sync';
      const content = 'Meeting transcript content';
      const embeddings = [0.1, 0.2, 0.3];
      const startTime = Date.now() - 3600000; // 1 hour ago
      const endTime = Date.now();
      
      // Act
      await service.storeMeetingContent(
        userId, 
        meetingId, 
        meetingTitle, 
        content, 
        embeddings, 
        [], 
        startTime, 
        endTime
      );
      
      // Assert
      expect(BaseContextService.prototype.storeUserContext).toHaveBeenCalledWith(
        userId,
        content,
        embeddings,
        expect.objectContaining({
          meetingStartTime: startTime,
          meetingEndTime: endTime
        })
      );
    });
  });

  describe('storeDecision', () => {
    test('should store decision with required parameters', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = 'meeting-456';
      const decisionId = 'decision-789';
      const decision = 'The team decided to launch the product next week';
      const summary = 'Product launch next week';
      const embeddings = [0.1, 0.2, 0.3];
      
      // Act
      const result = await service.storeDecision(
        userId,
        meetingId,
        decisionId,
        decision,
        summary,
        embeddings
      );
      
      // Assert
      expect(result).toMatch(/^meeting-context-\d+$/);
      expect(BaseContextService.prototype.storeUserContext).toHaveBeenCalledWith(
        userId,
        decision,
        embeddings,
        expect.objectContaining({
          contextType: ContextType.DECISION,
          meetingId,
          decisionId,
          decisionSummary: summary,
          isDecision: true
        })
      );
      
      // Check that decision was stored in internal cache
      expect((service as any).decisions[userId][meetingId]).toBeDefined();
      expect((service as any).decisions[userId][meetingId][0].description).toBe(decision);
    });
    
    test('should throw error when meeting ID or decision ID is not provided', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = 'meeting-456';
      const decisionId = '';  // Empty decision ID
      const decision = 'Decision content';
      const embeddings = [0.1, 0.2, 0.3];
      
      // Act & Assert
      await expect(service.storeDecision(
        userId,
        meetingId,
        decisionId,
        decision,
        null,
        embeddings
      )).rejects.toThrow('Meeting ID and Decision ID are required');
    });
    
    test('should update existing decision if ID already exists', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = 'meeting-456';
      const decisionId = 'decision-789';
      const originalDecision = 'Original decision';
      const updatedDecision = 'Updated decision';
      const embeddings = [0.1, 0.2, 0.3];
      
      // First store the original decision
      await service.storeDecision(
        userId,
        meetingId,
        decisionId,
        originalDecision,
        null,
        embeddings
      );
      
      // Now update it
      await service.storeDecision(
        userId,
        meetingId,
        decisionId,
        updatedDecision,
        null,
        embeddings
      );
      
      // Assert
      expect((service as any).decisions[userId][meetingId].length).toBe(1); // Still only one decision
      expect((service as any).decisions[userId][meetingId][0].description).toBe(updatedDecision);
    });
  });

  describe('storeActionItem', () => {
    test('should store action item with required parameters', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = 'meeting-456';
      const actionItemId = 'action-789';
      const actionItem = 'Update the documentation';
      const assigneeId = 'user-456';
      const dueDate = Date.now() + 86400000; // Tomorrow
      const embeddings = [0.1, 0.2, 0.3];
      
      // Act
      const result = await service.storeActionItem(
        userId,
        meetingId,
        actionItemId,
        actionItem,
        assigneeId,
        dueDate,
        embeddings
      );
      
      // Assert
      expect(result).toMatch(/^meeting-context-\d+$/);
      expect(BaseContextService.prototype.storeUserContext).toHaveBeenCalledWith(
        userId,
        actionItem,
        embeddings,
        expect.objectContaining({
          contextType: ContextType.ACTION_ITEM,
          meetingId,
          actionItemId,
          assigneeId,
          dueDate,
          status: ActionItemStatus.PENDING,
          isActionItem: true
        })
      );
      
      // Check that action item was stored in internal cache
      expect((service as any).actionItems[userId][meetingId]).toBeDefined();
      expect((service as any).actionItems[userId][meetingId][0].description).toBe(actionItem);
      expect((service as any).actionItems[userId][meetingId][0].assignee).toBe(assigneeId);
    });
    
    test('should throw error when meeting ID or action item ID is not provided', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = '';  // Empty meeting ID
      const actionItemId = 'action-789';
      const actionItem = 'Action item content';
      const embeddings = [0.1, 0.2, 0.3];
      
      // Act & Assert
      await expect(service.storeActionItem(
        userId,
        meetingId,
        actionItemId,
        actionItem,
        'user-456',
        null,
        embeddings
      )).rejects.toThrow('Meeting ID and Action Item ID are required');
    });
  });

  describe('storeQuestion', () => {
    test('should store question with required parameters', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = 'meeting-456';
      const questionId = 'question-789';
      const question = 'When will the new feature be ready?';
      const embeddings = [0.1, 0.2, 0.3];
      
      // Act
      const result = await service.storeQuestion(
        userId,
        meetingId,
        questionId,
        question,
        embeddings
      );
      
      // Assert
      expect(result).toMatch(/^meeting-context-\d+$/);
      expect(BaseContextService.prototype.storeUserContext).toHaveBeenCalledWith(
        userId,
        question,
        embeddings,
        expect.objectContaining({
          contextType: ContextType.QUESTION,
          meetingId,
          questionId,
          isQuestion: true,
          isAnswered: false
        })
      );
      
      // Check that question was stored in internal cache
      expect((service as any).questions[userId][meetingId]).toBeDefined();
      expect((service as any).questions[userId][meetingId][0].question).toBe(question);
      expect((service as any).questions[userId][meetingId][0].isAnswered).toBe(false);
    });
    
    test('should store an answered question with answer context ID', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = 'meeting-456';
      const questionId = 'question-789';
      const question = 'What is the project deadline?';
      const embeddings = [0.1, 0.2, 0.3];
      const isAnswered = true;
      const answerContextId = 'context-123';
      
      // Act
      await service.storeQuestion(
        userId,
        meetingId,
        questionId,
        question,
        embeddings,
        isAnswered,
        answerContextId
      );
      
      // Assert
      expect((service as any).questions[userId][meetingId][0].isAnswered).toBe(true);
      expect((service as any).questions[userId][meetingId][0].answerContextId).toBe(answerContextId);
      
      expect(BaseContextService.prototype.storeUserContext).toHaveBeenCalledWith(
        userId,
        question,
        embeddings,
        expect.objectContaining({
          isAnswered: true,
          answerContextId
        })
      );
    });
  });

  describe('markQuestionAsAnswered', () => {
    test('should mark a question as answered', async () => {
      // Arrange
      const userId = 'user-123';
      const questionId = 'question-789';
      const answerContextId = 'context-456';
      
      // Mock finding the question
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [{
          id: 'id-123',
          values: [0.1, 0.2, 0.3],
          metadata: {
            questionId,
            isAnswered: false
          }
        }]
      });
      
      // Act
      const result = await service.markQuestionAsAnswered(
        userId,
        questionId,
        answerContextId
      );
      
      // Assert
      expect(result).toBe(true);
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        [{
          id: 'id-123',
          values: [0.1, 0.2, 0.3],
          metadata: expect.objectContaining({
            questionId,
            isAnswered: true,
            answerContextId
          })
        }],
        userId
      );
    });
    
    test('should throw error if question not found', async () => {
      // Arrange
      const userId = 'user-123';
      const questionId = 'question-789';
      
      // Mock empty result (question not found)
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: []
      });
      
      // Act & Assert
      await expect(service.markQuestionAsAnswered(
        userId,
        questionId,
        'context-456'
      )).rejects.toThrow();
    });
  });

  describe('findUnansweredQuestions', () => {
    test('should find unanswered questions with filters', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = 'meeting-456';
      
      const mockQuestions = [
        {
          id: 'question-1',
          metadata: {
            questionId: 'q1',
            content: 'First unanswered question',
            meetingId: 'meeting-456',
            meetingTitle: 'Team Sync',
            timestamp: 1000
          }
        },
        {
          id: 'question-2',
          metadata: {
            questionId: 'q2',
            content: 'Second unanswered question',
            meetingId: 'meeting-789',
            meetingTitle: 'Planning Session',
            timestamp: 2000
          }
        }
      ];
      
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockQuestions
      });
      
      // Act
      const result = await service.findUnansweredQuestions(userId, {
        meetingId
      });
      
      // Assert
      expect(result.length).toBe(2);
      expect(result[0].questionId).toBe('q1');
      expect(result[0].question).toBe('First unanswered question');
      
      // Check filter was correctly applied
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        [],
        expect.objectContaining({
          filter: {
            contextType: ContextType.QUESTION,
            isAnswered: false,
            meetingId
          }
        }),
        userId
      );
    });
    
    test('should apply time range filters when provided', async () => {
      // Arrange
      const userId = 'user-123';
      const timeRangeStart = 1000;
      const timeRangeEnd = 2000;
      
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: []
      });
      
      // Act
      await service.findUnansweredQuestions(userId, {
        timeRangeStart,
        timeRangeEnd
      });
      
      // Assert
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        [],
        expect.objectContaining({
          filter: {
            contextType: ContextType.QUESTION,
            isAnswered: false,
            timestamp: {
              $gte: timeRangeStart,
              $lte: timeRangeEnd
            }
          }
        }),
        userId
      );
    });
  });

  describe('getMeetingContent', () => {
    test('should retrieve meeting content by meetingId', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = 'meeting-456';
      const meetingContent = {
        meetingId,
        content: 'Meeting transcript',
        title: 'Weekly Sync',
        date: new Date(),
        participantIds: ['user-1', 'user-2']
      };
      
      // Set up mock data
      (service as any).meetingContents = {
        [userId]: {
          [meetingId]: meetingContent
        }
      };
      
      // Act
      const result = await service.getMeetingContent(userId, meetingId);
      
      // Assert
      expect(result).toEqual(meetingContent);
    });
    
    test('should return null if meeting not found', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = 'nonexistent-meeting';
      
      // Act
      const result = await service.getMeetingContent(userId, meetingId);
      
      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getMeetingDecisions', () => {
    test('should retrieve decisions for a meeting', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = 'meeting-456';
      const decisions = [
        {
          id: 'decision-1',
          description: 'First decision',
          context: 'Some context'
        },
        {
          id: 'decision-2',
          description: 'Second decision'
        }
      ];
      
      // Set up mock data
      (service as any).decisions = {
        [userId]: {
          [meetingId]: decisions
        }
      };
      
      // Act
      const result = await service.getMeetingDecisions(userId, meetingId);
      
      // Assert
      expect(result).toEqual(decisions);
    });
    
    test('should return empty array if no decisions found', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = 'meeting-456';
      
      // Act
      const result = await service.getMeetingDecisions(userId, meetingId);
      
      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('updateActionItemStatus', () => {
    test('should update action item status to completed', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = 'meeting-456';
      const actionItemId = 'action-789';
      
      // Set up mock data with a pending action item
      (service as any).actionItems = {
        [userId]: {
          [meetingId]: [
            {
              id: actionItemId,
              description: 'Action item',
              status: 'pending'
            }
          ]
        }
      };
      
      // Act
      const result = await service.updateActionItemStatus(
        userId,
        meetingId,
        actionItemId,
        true // isCompleted
      );
      
      // Assert
      expect(result).toBe(true);
      expect((service as any).actionItems[userId][meetingId][0].status).toBe('completed');
    });
    
    test('should return false if action item not found', async () => {
      // Arrange
      const userId = 'user-123';
      const meetingId = 'meeting-456';
      const actionItemId = 'nonexistent-item';
      
      // Act
      const result = await service.updateActionItemStatus(
        userId,
        meetingId,
        actionItemId,
        true
      );
      
      // Assert
      expect(result).toBe(false);
    });
  });
}); 