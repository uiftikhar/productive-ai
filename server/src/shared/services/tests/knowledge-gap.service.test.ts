import { BaseContextService } from '../user-context/base-context.service';
import {
  ContextType,
  KnowledgeGapType,
} from '../user-context/types/context.types';
import { ConsoleLogger } from '../../logger/console-logger';
import { IEmbeddingService } from '../embedding.interface';
import { KnowledgeGapService } from '../user-context/knowledge-gap.service';

// Mock dependencies
jest.mock('../user-context/base-context.service');
jest.mock('../embedding.interface');
jest.mock('../../logger/console-logger');

describe('KnowledgeGapService', () => {
  let service: KnowledgeGapService;
  let mockPineconeService: any;
  let mockEmbeddingService: jest.Mocked<IEmbeddingService>;
  let mockRetryCounter = 0;

  beforeEach(() => {
    mockRetryCounter = 0;

    // Mock the parent class behavior
    (BaseContextService.prototype as any).executeWithRetry = jest
      .fn()
      .mockImplementation((fn, opName) => {
        mockRetryCounter++;
        return fn();
      });

    (BaseContextService.prototype as any).generateContextId = jest
      .fn()
      .mockImplementation(
        (userId, prefix) =>
          `${prefix}test-id-${Math.floor(Math.random() * 1000)}`,
      );

    (BaseContextService.prototype as any).prepareMetadataForStorage = jest
      .fn()
      .mockImplementation((metadata) => metadata);

    // Create embedding service mock
    mockEmbeddingService = {
      generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      calculateCosineSimilarity: jest.fn(),
      findSimilarEmbeddings: jest.fn(),
      combineEmbeddings: jest.fn(),
      // Optional methods
      embedText: jest.fn(),
      embedBatch: jest.fn(),
      getModelName: jest.fn(),
      getDimensions: jest.fn(),
      getCost: jest.fn(),
    };

    // Create service instance with mocked dependencies
    service = new KnowledgeGapService({
      logger: new ConsoleLogger(),
      embeddingService: mockEmbeddingService,
    });

    // Mock calculateCosineSimilarity from the BaseContextService
    (service as any).calculateCosineSimilarity = jest
      .fn()
      .mockImplementation((vec1, vec2) => 0.75);

    // Mock ensureNumberArray
    (service as any).ensureNumberArray = jest
      .fn()
      .mockImplementation((arr) =>
        Array.isArray(arr) ? arr : [0.1, 0.2, 0.3],
      );

    // Set up pinecone service mock
    mockPineconeService = {
      queryVectors: jest.fn(),
      upsertVectors: jest.fn().mockResolvedValue({ success: true }),
      deleteVectors: jest.fn().mockResolvedValue({ success: true }),
      fetchVectors: jest.fn(),
    };
    (service as any).pineconeService = mockPineconeService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detectUnansweredQuestionGaps', () => {
    test('should detect unanswered questions as knowledge gaps', async () => {
      // Arrange
      const userId = 'user-123';
      const mockMatches = [
        {
          id: 'question-1',
          metadata: {
            timestamp: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days old
            content: 'What is the status of Project X?',
            participantIds: ['user-1', 'user-2', 'user-3', 'user-4'],
          },
        },
        {
          id: 'question-2',
          metadata: {
            timestamp: Date.now() - 15 * 24 * 60 * 60 * 1000, // 15 days old
            content: 'When will feature Y be released?',
            topicIds: ['topic-1', 'topic-2'],
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.detectUnansweredQuestionGaps(userId);

      // Assert
      expect(result.length).toBe(2);
      expect(result[0].gapType).toBe(KnowledgeGapType.UNANSWERED_QUESTION);
      expect(result[0].relatedContextIds).toContain('question-1');
      expect(result[0].title).toContain('What is the status of Project X?');
      expect(result[0].confidence).toBeGreaterThan(0.7); // Base confidence + age boost

      // Check that query was made with correct filter
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        [],
        expect.objectContaining({
          filter: {
            contextType: ContextType.QUESTION,
            isQuestion: true,
            isAnswered: false,
            timestamp: { $lt: expect.any(Number) },
          },
        }),
        userId,
      );
    });

    test('should return empty array when no unanswered questions found', async () => {
      // Arrange
      const userId = 'user-123';
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [],
      });

      // Act
      const result = await service.detectUnansweredQuestionGaps(userId);

      // Assert
      expect(result).toEqual([]);
    });

    test('should respect minConfidence option', async () => {
      // Arrange
      const userId = 'user-123';
      // Set up a question with a confidence value that will be filtered out
      const mockMatches = [
        {
          id: 'question-1',
          metadata: {
            timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days old (minimum age)
            content: 'Low confidence question?',
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Force low confidence by mocking age
      (service as any).calculateCosineSimilarity = jest
        .fn()
        .mockReturnValue(0.5);

      // Act
      const result = await service.detectUnansweredQuestionGaps(userId, {
        minConfidence: 0.8,
      });

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('detectTeamMisalignments', () => {
    test('should detect misalignment between teams', async () => {
      // Arrange
      const userId = 'user-123';
      const teamIds = ['team-1', 'team-2'];

      // Mock topics for team 1
      const team1Topics = [
        {
          id: 'topic-1-team-1',
          metadata: {
            topicId: 'topic-1',
            topicName: 'Feature X',
          },
          values: [0.1, 0.2, 0.3],
        },
      ];

      // Mock topics for team 2 with different understanding
      const team2Topics = [
        {
          id: 'topic-1-team-2',
          metadata: {
            topicId: 'topic-1',
            topicName: 'Feature X',
          },
          values: [0.5, 0.6, 0.7], // Different embedding = different understanding
        },
      ];

      // Return different topics for each team query
      mockPineconeService.queryVectors.mockImplementation(
        (index: string, vector: number[], options: any, uid: string) => {
          if (options.filter.teamId === 'team-1') {
            return Promise.resolve({ matches: team1Topics });
          } else {
            return Promise.resolve({ matches: team2Topics });
          }
        },
      );

      // Set up to detect low similarity (more misalignment)
      (service as any).calculateCosineSimilarity = jest
        .fn()
        .mockReturnValue(0.4);

      // Act
      const result = await service.detectTeamMisalignments(userId, teamIds);

      // Assert
      expect(result.length).toBe(1);
      expect(result[0].gapType).toBe(KnowledgeGapType.MISALIGNMENT);
      expect(result[0].title).toContain('Team Misalignment');
      expect(result[0].teamIds).toEqual(['team-1', 'team-2']);
      expect(result[0].confidence).toBeCloseTo(0.6); // 1 - 0.4 similarity
    });

    test('should throw error if less than two team IDs provided', async () => {
      // Arrange
      const userId = 'user-123';
      const teamIds = ['team-1']; // Only one team

      // Act & Assert
      await expect(
        service.detectTeamMisalignments(userId, teamIds),
      ).rejects.toThrow('At least two team IDs are needed');
    });

    test('should return empty array when no misalignments detected', async () => {
      // Arrange
      const userId = 'user-123';
      const teamIds = ['team-1', 'team-2'];

      // Mock similar understanding (high similarity)
      (service as any).calculateCosineSimilarity = jest
        .fn()
        .mockReturnValue(0.9);

      // Same topics for both teams
      const teamTopics = [
        {
          id: 'topic-1',
          metadata: {
            topicId: 'topic-1',
            topicName: 'Feature X',
          },
          values: [0.1, 0.2, 0.3],
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: teamTopics,
      });

      // Act
      const result = await service.detectTeamMisalignments(userId, teamIds, {
        threshold: 0.7,
      });

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('detectMissingInformation', () => {
    test('should detect topics with incomplete information', async () => {
      // Arrange
      const userId = 'user-123';
      const mockMatches = [
        {
          id: 'topic-1',
          metadata: {
            contextType: ContextType.TOPIC,
            topicName: 'Incomplete Topic',
            completeness: 0.3, // Very incomplete
          },
        },
        {
          id: 'question-1',
          metadata: {
            contextType: ContextType.QUESTION,
            isQuestion: true,
            isAnswered: true,
            isPartialAnswer: true,
            content: 'Question with partial answer',
            partialAnswer: 'Partial information...',
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.detectMissingInformation(userId);

      // Assert
      expect(result.length).toBe(2);
      expect(result[0].gapType).toBe(KnowledgeGapType.MISSING_INFORMATION);
      expect(result[0].title).toContain('Incomplete Topic');
      expect(result[0].confidence).toBeCloseTo(0.7); // 1 - 0.3 completeness

      expect(result[1].title).toContain('Incomplete Answer');
      expect(result[1].description).toContain(
        'Question: Question with partial answer',
      );
    });

    test('should return empty array when no missing information found', async () => {
      // Arrange
      const userId = 'user-123';
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [],
      });

      // Act
      const result = await service.detectMissingInformation(userId);

      // Assert
      expect(result).toEqual([]);
    });

    test('should filter results by minConfidence', async () => {
      // Arrange
      const userId = 'user-123';
      const mockMatches = [
        {
          id: 'topic-1',
          metadata: {
            contextType: ContextType.TOPIC,
            topicName: 'Almost Complete Topic',
            completeness: 0.65, // Confidence will be 0.35
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.detectMissingInformation(userId, {
        minConfidence: 0.5,
      });

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('storeKnowledgeGap', () => {
    test('should store a knowledge gap with embeddings', async () => {
      // Arrange
      const userId = 'user-123';
      const gap = {
        id: 'kg-test-123',
        userId: 'user-123',
        timestamp: Date.now(),
        gapType: KnowledgeGapType.UNANSWERED_QUESTION,
        confidence: 0.85,
        title: 'Unanswered Question Gap',
        description: 'This is an important question that needs answering',
        relatedContextIds: ['ctx-1', 'ctx-2'],
        suggestedActions: ['Action 1', 'Action 2'],
        status: 'open' as const,
        priority: 'high' as const,
        topicIds: ['topic-1'],
      };

      // Mock embedding generation
      mockEmbeddingService.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

      // Act
      const result = await service.storeKnowledgeGap(userId, gap);

      // Assert
      expect(result).toBe('kg-test-123');

      // Check embedding was generated from title and description
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
        `${gap.title}\n${gap.description}`,
      );

      // Check vector was stored
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        [
          {
            id: 'kg-test-123',
            values: [0.1, 0.2, 0.3],
            metadata: expect.objectContaining({
              userId,
              contextType: ContextType.KNOWLEDGE_GAP,
              gapType: KnowledgeGapType.UNANSWERED_QUESTION,
              title: gap.title,
              confidence: 0.85,
            }),
          },
        ],
        userId,
      );
    });

    test('should generate an ID if not provided', async () => {
      // Arrange
      const userId = 'user-123';
      const gap: any = {
        userId: 'user-123',
        timestamp: Date.now(),
        gapType: KnowledgeGapType.MISALIGNMENT,
        confidence: 0.8,
        title: 'Gap without ID',
        description: 'Testing gap without ID',
        relatedContextIds: [],
        status: 'open' as const,
        priority: 'medium' as const,
      };

      // Mock ID generation
      (BaseContextService.prototype as any).generateContextId.mockReturnValue(
        'kg-generated-id',
      );

      // Act
      const result = await service.storeKnowledgeGap(userId, gap);

      // Assert
      expect(result).toBe('kg-generated-id');
      expect(
        (BaseContextService.prototype as any).generateContextId,
      ).toHaveBeenCalledWith(userId, 'kg-');
    });

    test('should throw error if embedding generation fails', async () => {
      // Arrange
      const userId = 'user-123';
      const gap: any = {
        id: 'kg-test-123',
        userId: 'user-123',
        timestamp: Date.now(),
        gapType: KnowledgeGapType.UNANSWERED_QUESTION,
        confidence: 0.85,
        title: 'Test Gap',
        description: 'Test description',
        relatedContextIds: [],
        status: 'open' as const,
        priority: 'medium' as const,
      };

      // Create a spy that will throw when storeKnowledgeGap is called
      const errorSpy = jest.spyOn(service as any, 'executeWithRetry');
      errorSpy.mockImplementation((...args: any[]) => {
        const [fn, opName] = args;
        if (
          typeof opName === 'string' &&
          opName.includes('createGapEmbedding')
        ) {
          return null; // This will trigger the error in storeKnowledgeGap
        }
        // For all other calls, execute the function normally
        return typeof fn === 'function' ? fn() : undefined;
      });

      // Act & Assert
      await expect(service.storeKnowledgeGap(userId, gap)).rejects.toThrow(
        'Failed to create embedding for knowledge gap',
      );

      // Reset the spy to avoid affecting other tests
      errorSpy.mockRestore();
    });
  });

  describe('updateKnowledgeGapStatus', () => {
    test('should update status and notes of a knowledge gap', async () => {
      // Arrange
      const userId = 'user-123';
      const gapId = 'kg-test-123';
      const newStatus = 'closed' as const;
      const notes = 'This gap has been resolved';

      // Mock fetching the gap
      mockPineconeService.fetchVectors.mockResolvedValue({
        records: {
          'kg-test-123': {
            values: [0.1, 0.2, 0.3],
            metadata: {
              title: 'Original Gap',
              gapStatus: 'open',
            },
          },
        },
      });

      // Act
      const result = await service.updateKnowledgeGapStatus(
        userId,
        gapId,
        newStatus,
        notes,
      );

      // Assert
      expect(result).toBe(true);

      // Check vector was updated with new status and notes
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        [
          {
            id: gapId,
            values: [0.1, 0.2, 0.3],
            metadata: expect.objectContaining({
              title: 'Original Gap',
              gapStatus: 'closed',
              resolutionNotes: notes,
              lastUpdatedAt: expect.any(Number),
            }),
          },
        ],
        userId,
      );
    });

    test('should throw error if gap not found', async () => {
      // Arrange
      const userId = 'user-123';
      const gapId = 'kg-nonexistent';

      // Mock empty result (gap not found)
      mockPineconeService.fetchVectors.mockResolvedValue({
        records: {},
      });

      // Act & Assert
      await expect(
        service.updateKnowledgeGapStatus(userId, gapId, 'addressed'),
      ).rejects.toThrow(`Knowledge gap ${gapId} not found`);
    });
  });

  describe('getKnowledgeGaps', () => {
    test('should retrieve knowledge gaps with filtering', async () => {
      // Arrange
      const userId = 'user-123';
      const mockMatches = [
        {
          id: 'kg-1',
          metadata: {
            gapStatus: 'open',
            gapType: KnowledgeGapType.UNANSWERED_QUESTION,
            title: 'Open Gap',
            description: 'Description 1',
            priority: 'high',
            timestamp: 1000,
            relatedContextIds: ['ctx-1'],
            suggestedActions: ['Action 1'],
            topicIds: ['topic-1'],
            teamIds: ['team-1'],
            confidence: 0.8,
          },
        },
        {
          id: 'kg-2',
          metadata: {
            gapStatus: 'closed',
            gapType: KnowledgeGapType.MISALIGNMENT,
            title: 'Closed Gap',
            description: 'Description 2',
            priority: 'medium',
            timestamp: 2000,
            relatedContextIds: ['ctx-2'],
            assignedTo: 'user-456',
            resolutionNotes: 'Resolved',
            confidence: 0.7,
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.getKnowledgeGaps(userId, {
        status: 'open',
        priority: 'high',
      });

      // Assert
      expect(result.length).toBe(2);

      // Check the gaps are properly converted to KnowledgeGap objects
      expect(result[0]).toEqual({
        id: 'kg-1',
        userId,
        timestamp: 1000,
        gapType: KnowledgeGapType.UNANSWERED_QUESTION,
        confidence: 0.8,
        title: 'Open Gap',
        description: 'Description 1',
        relatedContextIds: ['ctx-1'],
        suggestedActions: ['Action 1'],
        status: 'open',
        priority: 'high',
        topicIds: ['topic-1'],
        teamIds: ['team-1'],
        assignedTo: undefined,
        resolutionNotes: undefined,
        meetingIds: [],
      });

      // Check filter was correctly applied
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        [],
        expect.objectContaining({
          filter: {
            contextType: ContextType.KNOWLEDGE_GAP,
            gapStatus: 'open',
            priority: 'high',
          },
        }),
        userId,
      );
    });

    test('should return empty array when no gaps found', async () => {
      // Arrange
      const userId = 'user-123';
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [],
      });

      // Act
      const result = await service.getKnowledgeGaps(userId);

      // Assert
      expect(result).toEqual([]);
    });

    test('should handle filtering by topic and team IDs', async () => {
      // Arrange
      const userId = 'user-123';
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [],
      });

      // Act
      await service.getKnowledgeGaps(userId, {
        topicId: 'topic-123',
        teamId: 'team-456',
      });

      // Assert
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        [],
        expect.objectContaining({
          filter: {
            contextType: ContextType.KNOWLEDGE_GAP,
            topicIds: 'topic-123',
            teamIds: 'team-456',
          },
        }),
        userId,
      );
    });
  });
});
