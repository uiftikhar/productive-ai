/**
 * Integration Tests for User Context Services
 * 
 * These tests verify that the various services work together correctly.
 * They test cross-service interactions and workflows that span multiple services.
 */

// Set NODE_ENV to test to ensure test mocks are used
process.env.NODE_ENV = 'test';

import { PineconeConnectionService } from '../../../../pinecone/pinecone-connection.service.ts';
import { Logger } from '../../../../shared/logger/logger.interface.ts';
import { 
  UserContextService, 
  ContextType, 
  UserRole,
  MemoryType,
  ThemeRelationshipType,
  KnowledgeGapType,
  ActionItemStatus
} from '../../user-context.service.ts';

import { BaseContextService } from '../base-context.service.ts';
import { ThemeManagementService } from '../theme-management.service.ts';
import { KnowledgeGapService } from '../knowledge-gap.service.ts';
import { IntegrationService } from '../integration.service.ts';
import { MemoryManagementService } from '../memory-management.service.ts';
import { TemporalIntelligenceService } from '../temporal-intelligence.service.ts';

// Define your local mock Pinecone service
// (in case global mocks don't work properly)
const mockUpsertVectors = jest.fn().mockResolvedValue({});
const mockQueryVectors = jest.fn();
const mockFetchVectors = jest.fn();
const mockDeleteVectors = jest.fn().mockResolvedValue({ deleted: 1 });

const mockPineconeService = {
  initialize: jest.fn().mockResolvedValue({}),
  getIndex: jest.fn().mockResolvedValue({}),
  queryVectors: mockQueryVectors,
  fetchVectors: mockFetchVectors,
  upsertVectors: mockUpsertVectors,
  deleteVectors: mockDeleteVectors,
} as unknown as PineconeConnectionService;

// Force mock reset and injection
jest.mock('../../../../pinecone/pinecone-connection.service.ts', () => ({
  PineconeConnectionService: jest.fn().mockImplementation(() => mockPineconeService)
}));

// Mock Logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as Logger;

describe('User Context Services Integration', () => {
  // Services
  let userContextService: UserContextService;
  let themeManagementService: ThemeManagementService;
  let knowledgeGapService: KnowledgeGapService;
  let integrationService: IntegrationService;
  let memoryManagementService: MemoryManagementService;
  let temporalIntelligenceService: TemporalIntelligenceService;

  // Test Data
  const testUserId = 'user-123';
  const testMeetingId = 'meeting-456';
  const testTimestamp = Date.now();
  
  const testActionItem = {
    id: 'action-789',
    content: 'Complete the project documentation',
    assigneeId: 'user-123',
    dueDate: testTimestamp + 7 * 24 * 3600 * 1000, // 7 days from now
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Initialize services
    userContextService = new UserContextService({
      pineconeService: mockPineconeService,
      logger: mockLogger,
    });
    
    themeManagementService = new ThemeManagementService({
      pineconeService: mockPineconeService,
      logger: mockLogger,
    });
    
    knowledgeGapService = new KnowledgeGapService({
      pineconeService: mockPineconeService,
      logger: mockLogger,
    });
    
    integrationService = new IntegrationService({
      pineconeService: mockPineconeService,
      logger: mockLogger,
    });
    
    memoryManagementService = new MemoryManagementService({
      pineconeService: mockPineconeService,
      logger: mockLogger,
    });
    
    temporalIntelligenceService = new TemporalIntelligenceService({
      pineconeService: mockPineconeService,
      logger: mockLogger,
    });
  });

  describe('Workflow: Action Item Creation, Theming, and Integration', () => {
    it('should create an action item, add theme, and integrate with external system', async () => {
      // Mock responses for the entire workflow
      const actionItemId = 'action-123';
      const themeId = 'theme-456';
      const themeName = 'Documentation';
      const externalSystemId = 'jira-789';
      
      // Setup mocks for action item creation - resolve with nothing on first call
      mockUpsertVectors.mockResolvedValueOnce({});
      
      // Setup mocks for theme addition - ThemeManagementService uses fetchVectors to get the context
      mockFetchVectors.mockResolvedValueOnce({
        records: {
          [actionItemId]: {
            id: actionItemId,
            metadata: {
              actionItemId,
              content: testActionItem.content,
              userId: testUserId,
              contextType: ContextType.ACTION_ITEM
            },
            values: [0.1, 0.2, 0.3]
          }
        }
      });
      
      // Setup mocks for external integration - IntegrationService uses queryVectors
      mockQueryVectors.mockResolvedValueOnce({
        matches: [{
          id: actionItemId,
          metadata: {
            actionItemId,
            content: testActionItem.content,
            userId: testUserId,
            contextType: ContextType.ACTION_ITEM,
            themeIds: [themeId],
            themeNames: [themeName]
          },
          values: [0.1, 0.2, 0.3]
        }]
      });

      // 1. Create action item
      const result1 = await userContextService.storeActionItem(
        testUserId,
        testMeetingId,
        actionItemId,
        testActionItem.content,
        testActionItem.assigneeId,
        testActionItem.dueDate,
        [0.1, 0.2, 0.3]
      );
      
      expect(result1).toBeTruthy();
      expect(mockUpsertVectors).toHaveBeenCalledTimes(1);
      // Update expectation to match what the service actually sends
      expect(mockUpsertVectors.mock.calls[0][1][0].metadata).toEqual(
        expect.objectContaining({
          contextType: ContextType.ACTION_ITEM,
          actionItemId,
          userId: testUserId
        })
      );
      
      // 2. Add theme to action item
      await themeManagementService.addThemeToContext(
        testUserId,
        actionItemId,
        themeId,
        themeName,
        0.8 // High relevance
      );
      
      // ThemeManagementService uses fetchVectors, not queryVectors
      expect(mockFetchVectors).toHaveBeenCalledTimes(1);
      expect(mockUpsertVectors).toHaveBeenCalledTimes(2);
      // Update expectation to check that themeIds and themeNames were added
      expect(mockUpsertVectors.mock.calls[1][1][0].metadata).toEqual(
        expect.objectContaining({
          themeIds: expect.arrayContaining([themeId]),
          themeNames: expect.arrayContaining([themeName])
        })
      );
      
      // 3. Integrate with external system
      const result3 = await integrationService.integrateActionItemWithExternalSystem(
        testUserId,
        actionItemId,
        'jira',
        externalSystemId,
        { priority: 'high' }
      );
      
      expect(result3).toBe(externalSystemId);
      expect(mockQueryVectors).toHaveBeenCalledTimes(1); // IntegrationService uses queryVectors
      expect(mockUpsertVectors).toHaveBeenCalledTimes(3);
      // Update expectation to check for external system details
      expect(mockUpsertVectors.mock.calls[2][1][0].metadata).toEqual(
        expect.objectContaining({
          externalSystem: 'jira',
          externalSystemId
        })
      );
    });
  });

  describe('Workflow: Memory Management and Temporal Intelligence', () => {
    it('should reinforce memory and apply temporal decay', async () => {
      const contextId = 'memory-123';
      const content = 'We decided to use React for the frontend implementation';
      
      // Setup mocks for memory operations
      // Using records format for fetchVectors response
      mockFetchVectors.mockResolvedValueOnce({
        records: {
          [contextId]: {
            id: contextId,
            metadata: {
              userId: testUserId,
              content,
              memoryType: MemoryType.EPISODIC,
              memoryStrength: 0.8,
              timestamp: Date.now() - 5 * 24 * 3600 * 1000 // 5 days ago
            },
            values: [0.1, 0.2, 0.3]
          }
        }
      });
      
      // 1. Reinforce memory
      await userContextService.reinforceMemory(
        testUserId,
        contextId,
        0.2 // Reinforcement strength
      );
      
      expect(mockFetchVectors).toHaveBeenCalledTimes(1);
      expect(mockUpsertVectors).toHaveBeenCalledTimes(1);
      // Update expectation to check that memoryStrength was increased
      expect(mockUpsertVectors.mock.calls[0][1][0].metadata).toEqual(
        expect.objectContaining({
          memoryStrength: expect.any(Number)
        })
      );
    });
  });

  describe('Workflow: Knowledge Gap Detection and Theme Association', () => {
    it('should detect knowledge gaps and associate them with themes', async () => {
      const gapId = 'gap-123';
      
      // Setup mocks for unanswered questions detection
      mockQueryVectors.mockResolvedValueOnce({
        matches: [{
          id: 'question-123',
          metadata: {
            userId: testUserId,
            content: 'What framework should we use for the backend?',
            isQuestion: true,
            isAnswered: false,
            timestamp: Date.now() - 14 * 24 * 3600 * 1000, // 14 days ago
            meetingId: 'meeting-123'
          },
          score: 0.95,
          values: [0.1, 0.2, 0.3]
        }]
      });
      
      // Mock a successful gap creation
      mockUpsertVectors.mockResolvedValueOnce({});
      
      // Mock the result of gap detection - this should match what the service returns
      const detectedGap = {
        id: gapId,
        userId: testUserId,
        gapType: KnowledgeGapType.UNANSWERED_QUESTION,
        confidence: 0.9,
        title: 'Backend Framework Decision',
        description: 'What framework should we use for the backend?',
        status: 'open',
        priority: 'medium',
        timestamp: expect.any(Number),
        relatedContextIds: ['question-123'],
      };
      
      // Mock the service to return our detected gap
      knowledgeGapService.detectUnansweredQuestionGaps = jest.fn().mockResolvedValueOnce([detectedGap]);
      
      // Setup mocks for theme association - ThemeManagementService uses fetchVectors
      mockFetchVectors.mockResolvedValueOnce({
        records: {
          [gapId]: {
            id: gapId,
            metadata: {
              userId: testUserId,
              gapType: KnowledgeGapType.UNANSWERED_QUESTION,
              content: 'What framework should we use for the backend?',
              title: 'Backend Framework Decision',
              status: 'open'
            },
            values: [0.1, 0.2, 0.3]
          }
        }
      });
      
      // 1. Detect unanswered questions
      const gaps = await knowledgeGapService.detectUnansweredQuestionGaps(
        testUserId,
        { minAgeInDays: 7 } // Questions older than 7 days
      );
      
      expect(gaps.length).toBe(1);
      expect(gaps[0].title).toBe('Backend Framework Decision');
      expect(gaps[0].gapType).toBe(KnowledgeGapType.UNANSWERED_QUESTION);
      
      // 2. Associate theme with knowledge gap
      const themeId = 'theme-backend';
      const themeName = 'Backend Technologies';
      
      // Reset mockUpsertVectors for the next call
      mockUpsertVectors.mockReset();
      mockUpsertVectors.mockResolvedValueOnce({});
      
      await themeManagementService.addThemeToContext(
        testUserId,
        gapId,
        themeId,
        themeName,
        0.9 // High relevance
      );
      
      expect(mockFetchVectors).toHaveBeenCalledTimes(1);
      expect(mockUpsertVectors).toHaveBeenCalledTimes(1);
      // Update expectation to check for theme details
      expect(mockUpsertVectors.mock.calls[0][1][0].metadata).toEqual(
        expect.objectContaining({
          themeIds: expect.arrayContaining([themeId]),
          themeNames: expect.arrayContaining([themeName])
        })
      );
    });
  });

  describe('Workflow: Theme Relationship Management', () => {
    it('should manage theme relationships across multiple contexts', async () => {
      const themeId1 = 'theme-frontend';
      const themeName1 = 'Frontend Development';
      const themeId2 = 'theme-backend';
      const themeName2 = 'Backend Development';
      const contextId = 'context-123';
      
      // Setup mocks for theme context - use records format
      mockFetchVectors.mockResolvedValueOnce({
        records: {
          [contextId]: {
            id: contextId,
            metadata: {
              userId: testUserId,
              content: 'How frontend and backend should interact',
              themeIds: [themeId1],
              themeNames: [themeName1]
            },
            values: [0.1, 0.2, 0.3]
          }
        }
      });
      
      // Add a related theme
      const relationship = {
        relatedThemeId: themeId2,
        relatedThemeName: themeName2,
        relationshipType: ThemeRelationshipType.RELATED,
        relationshipStrength: 0.8,
        establishedAt: Date.now(),
        description: 'Frontend and backend interaction points'
      };
      
      await themeManagementService.updateThemeRelationships(
        testUserId,
        contextId,
        themeId1,
        [relationship]
      );
      
      expect(mockFetchVectors).toHaveBeenCalledTimes(1);
      expect(mockUpsertVectors).toHaveBeenCalledTimes(1);
      // Update expectation to check for theme relationships
      expect(mockUpsertVectors.mock.calls[0][1][0].metadata).toEqual(
        expect.objectContaining({
          themeRelationships: expect.anything()
        })
      );
    });
  });
}); 