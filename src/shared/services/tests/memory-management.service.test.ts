import { MemoryManagementService } from '../user-context/memory-management.service';
import { UserContextNotFoundError } from '../user-context/types/context.types';
import {
  MemoryType,
  EpisodicContext,
  SemanticStructure,
  ProceduralSteps,
} from '../user-context/types/memory.types';

// Mock dependencies
jest.mock('../user-context/base-context.service');

describe('MemoryManagementService', () => {
  let service: MemoryManagementService;
  let mockPineconeService: any;

  beforeEach(() => {
    // Create mocked service
    service = new MemoryManagementService({});

    // Mock pinecone service
    mockPineconeService = {
      fetchVectors: jest.fn(),
      upsertVectors: jest.fn().mockResolvedValue({ success: true }),
    };
    (service as any).pineconeService = mockPineconeService;

    // Mock utility methods
    (service as any).logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    (service as any).ensureNumberArray = jest
      .fn()
      .mockImplementation((arr) =>
        Array.isArray(arr) ? arr : [0.1, 0.2, 0.3],
      );
    (service as any).prepareMetadataForStorage = jest
      .fn()
      .mockImplementation((metadata) => metadata);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addEpisodicMemoryContext', () => {
    test('should add episodic memory context to an existing context item', async () => {
      // Arrange
      const userId = 'user-123';
      const contextId = 'context-456';
      const episodicContext: EpisodicContext = {
        episodeType: 'meeting',
        timestamp: 1620000000000,
        participants: ['user-1', 'user-2', 'user-3'],
        outcomes: ['Project timeline approved', 'Action items assigned'],
      };

      // Mock existing context
      mockPineconeService.fetchVectors.mockResolvedValue({
        records: {
          [contextId]: {
            values: [0.1, 0.2, 0.3],
            metadata: {
              content: 'Original content',
              timestamp: 1620000000000,
            },
          },
        },
      });

      // Act
      await service.addEpisodicMemoryContext(
        userId,
        contextId,
        episodicContext,
      );

      // Assert
      expect(mockPineconeService.fetchVectors).toHaveBeenCalledWith(
        'user-context',
        [contextId],
        userId,
      );

      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        [
          {
            id: contextId,
            values: [0.1, 0.2, 0.3],
            metadata: expect.objectContaining({
              content: 'Original content',
              timestamp: 1620000000000,
              memoryType: MemoryType.EPISODIC,
              episodicContext,
              lastUpdatedAt: expect.any(Number),
            }),
          },
        ],
        userId,
      );

      expect((service as any).logger.debug).toHaveBeenCalledWith(
        'Added episodic memory context',
        expect.objectContaining({
          userId,
          contextId,
          episodeType: 'meeting',
        }),
      );
    });

    test('should throw error if context not found', async () => {
      // Arrange
      const userId = 'user-123';
      const contextId = 'nonexistent-context';
      const episodicContext: EpisodicContext = {
        episodeType: 'meeting',
        timestamp: 1620000000000,
      };

      // Mock missing context
      mockPineconeService.fetchVectors.mockResolvedValue({
        records: {},
      });

      // Act & Assert
      await expect(
        service.addEpisodicMemoryContext(userId, contextId, episodicContext),
      ).rejects.toThrow(UserContextNotFoundError);

      expect(mockPineconeService.upsertVectors).not.toHaveBeenCalled();
    });
  });

  describe('addSemanticMemoryStructure', () => {
    test('should add semantic memory structure to an existing context item', async () => {
      // Arrange
      const userId = 'user-123';
      const contextId = 'context-456';
      const semanticStructure: SemanticStructure = {
        concept: 'Project Management',
        definition:
          'The practice of organizing and managing resources to deliver projects',
        specificity: 0.8,
        relatedConcepts: [
          {
            concept: 'Agile',
            relationshipType: 'methodology',
            strength: 0.9,
          },
          {
            concept: 'Scrum',
            relationshipType: 'framework',
            strength: 0.8,
          },
          {
            concept: 'Kanban',
            relationshipType: 'visualization',
            strength: 0.7,
          },
        ],
        domain: 'Business',
      };

      // Mock existing context
      mockPineconeService.fetchVectors.mockResolvedValue({
        records: {
          [contextId]: {
            values: [0.4, 0.5, 0.6],
            metadata: {
              content: 'Original semantic content',
              timestamp: 1630000000000,
            },
          },
        },
      });

      // Act
      await service.addSemanticMemoryStructure(
        userId,
        contextId,
        semanticStructure,
      );

      // Assert
      expect(mockPineconeService.fetchVectors).toHaveBeenCalledWith(
        'user-context',
        [contextId],
        userId,
      );

      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        [
          {
            id: contextId,
            values: [0.4, 0.5, 0.6],
            metadata: expect.objectContaining({
              content: 'Original semantic content',
              timestamp: 1630000000000,
              memoryType: MemoryType.SEMANTIC,
              semanticStructure,
              lastUpdatedAt: expect.any(Number),
            }),
          },
        ],
        userId,
      );

      expect((service as any).logger.debug).toHaveBeenCalledWith(
        'Added semantic memory structure',
        expect.objectContaining({
          userId,
          contextId,
          concept: 'Project Management',
        }),
      );
    });

    test('should throw error if context not found for semantic memory', async () => {
      // Arrange
      const userId = 'user-123';
      const contextId = 'nonexistent-context';
      const semanticStructure: SemanticStructure = {
        concept: 'Project Management',
        definition: 'The practice of organizing and managing resources',
        specificity: 0.7,
      };

      // Mock missing context
      mockPineconeService.fetchVectors.mockResolvedValue({
        records: {},
      });

      // Act & Assert
      await expect(
        service.addSemanticMemoryStructure(
          userId,
          contextId,
          semanticStructure,
        ),
      ).rejects.toThrow(UserContextNotFoundError);

      expect(mockPineconeService.upsertVectors).not.toHaveBeenCalled();
    });
  });

  describe('addProceduralMemorySteps', () => {
    test('should add procedural memory steps to an existing context item', async () => {
      // Arrange
      const userId = 'user-123';
      const contextId = 'context-456';
      const proceduralSteps: ProceduralSteps = {
        procedure: 'Setting up a new project repository',
        steps: [
          {
            order: 1,
            description: 'Create a new repository on GitHub',
            isRequired: true,
          },
          {
            order: 2,
            description: 'Clone the repository locally',
            isRequired: true,
          },
          {
            order: 3,
            description: 'Initialize project structure',
            isRequired: true,
          },
        ],
        triggers: ['New project', 'Code migration'],
        outcomes: ['Ready repository', 'Initial project structure'],
      };

      // Mock existing context
      mockPineconeService.fetchVectors.mockResolvedValue({
        records: {
          [contextId]: {
            values: [0.7, 0.8, 0.9],
            metadata: {
              content: 'Original procedural content',
              timestamp: 1640000000000,
            },
          },
        },
      });

      // Act
      await service.addProceduralMemorySteps(
        userId,
        contextId,
        proceduralSteps,
      );

      // Assert
      expect(mockPineconeService.fetchVectors).toHaveBeenCalledWith(
        'user-context',
        [contextId],
        userId,
      );

      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        [
          {
            id: contextId,
            values: [0.7, 0.8, 0.9],
            metadata: expect.objectContaining({
              content: 'Original procedural content',
              timestamp: 1640000000000,
              memoryType: MemoryType.PROCEDURAL,
              proceduralSteps,
              lastUpdatedAt: expect.any(Number),
            }),
          },
        ],
        userId,
      );

      expect((service as any).logger.debug).toHaveBeenCalledWith(
        'Added procedural memory steps',
        expect.objectContaining({
          userId,
          contextId,
          procedure: 'Setting up a new project repository',
        }),
      );
    });
  });

  describe('reinforceMemory', () => {
    test('should increase memory strength when reinforced', async () => {
      // Arrange
      const userId = 'user-123';
      const contextId = 'context-456';
      const currentStrength = 0.5;
      const reinforcementStrength = 0.2;

      // Mock existing context with current memory strength
      mockPineconeService.fetchVectors.mockResolvedValue({
        records: {
          [contextId]: {
            values: [0.1, 0.2, 0.3],
            metadata: {
              content: 'Memory content',
              memoryStrength: currentStrength,
            },
          },
        },
      });

      // Act
      await service.reinforceMemory(userId, contextId, reinforcementStrength);

      // Calculate expected new strength (using the formula from the service implementation)
      const expectedNewStrength =
        currentStrength + reinforcementStrength * (1 - currentStrength);

      // Assert
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        [
          {
            id: contextId,
            values: [0.1, 0.2, 0.3],
            metadata: expect.objectContaining({
              content: 'Memory content',
              memoryStrength: expectedNewStrength,
              lastReinforcementTime: expect.any(Number),
              lastUpdatedAt: expect.any(Number),
            }),
          },
        ],
        userId,
      );

      expect((service as any).logger.debug).toHaveBeenCalledWith(
        'Reinforced memory',
        expect.objectContaining({
          userId,
          contextId,
          oldStrength: currentStrength,
          newStrength: expectedNewStrength,
        }),
      );
    });

    test('should cap memory strength at 1.0 when heavily reinforced', async () => {
      // Arrange
      const userId = 'user-123';
      const contextId = 'context-456';
      const currentStrength = 0.9; // Already high
      const reinforcementStrength = 0.5; // Strong reinforcement

      // Mock existing context with current memory strength
      mockPineconeService.fetchVectors.mockResolvedValue({
        records: {
          [contextId]: {
            values: [0.1, 0.2, 0.3],
            metadata: {
              content: 'Memory content',
              memoryStrength: currentStrength,
            },
          },
        },
      });

      // Act
      await service.reinforceMemory(userId, contextId, reinforcementStrength);

      // Assert - strength should be capped at 1.0
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        [
          {
            id: contextId,
            values: [0.1, 0.2, 0.3],
            metadata: expect.objectContaining({
              memoryStrength: 1.0,
            }),
          },
        ],
        userId,
      );
    });

    test('should use default strength of 0.5 if not previously set', async () => {
      // Arrange
      const userId = 'user-123';
      const contextId = 'context-456';
      const reinforcementStrength = 0.1;

      // Mock existing context without memory strength
      mockPineconeService.fetchVectors.mockResolvedValue({
        records: {
          [contextId]: {
            values: [0.1, 0.2, 0.3],
            metadata: {
              content: 'Memory content',
              // No memoryStrength field
            },
          },
        },
      });

      // Act
      await service.reinforceMemory(userId, contextId, reinforcementStrength);

      // Calculate expected new strength (starting from default 0.5)
      const expectedNewStrength = 0.5 + reinforcementStrength * (1 - 0.5);

      // Assert
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        [
          {
            id: contextId,
            values: [0.1, 0.2, 0.3],
            metadata: expect.objectContaining({
              memoryStrength: expectedNewStrength,
            }),
          },
        ],
        userId,
      );
    });
  });

  describe('connectMemories', () => {
    test('should connect two memories bidirectionally', async () => {
      // Arrange
      const userId = 'user-123';
      const sourceContextId = 'context-source';
      const targetContextId = 'context-target';
      const connectionStrength = 0.75;

      // Mock existing contexts
      mockPineconeService.fetchVectors.mockResolvedValue({
        records: {
          [sourceContextId]: {
            values: [0.1, 0.2, 0.3],
            metadata: {
              content: 'Source memory',
              // No existing connections
            },
          },
          [targetContextId]: {
            values: [0.4, 0.5, 0.6],
            metadata: {
              content: 'Target memory',
              // No existing connections
            },
          },
        },
      });

      // Act
      await service.connectMemories(
        userId,
        sourceContextId,
        targetContextId,
        connectionStrength,
      );

      // Assert
      // First call should update source memory
      expect(mockPineconeService.upsertVectors).toHaveBeenNthCalledWith(
        1,
        'user-context',
        [
          {
            id: sourceContextId,
            values: [0.1, 0.2, 0.3],
            metadata: expect.objectContaining({
              content: 'Source memory',
              memoryConnections: [targetContextId],
              [`memoryConnectionStrength:${targetContextId}`]:
                connectionStrength,
              lastUpdatedAt: expect.any(Number),
            }),
          },
        ],
        userId,
      );

      // Second call should update target memory
      expect(mockPineconeService.upsertVectors).toHaveBeenNthCalledWith(
        2,
        'user-context',
        [
          {
            id: targetContextId,
            values: [0.4, 0.5, 0.6],
            metadata: expect.objectContaining({
              content: 'Target memory',
              memoryConnections: [sourceContextId],
              [`memoryConnectionStrength:${sourceContextId}`]:
                connectionStrength,
              lastUpdatedAt: expect.any(Number),
            }),
          },
        ],
        userId,
      );

      expect((service as any).logger.debug).toHaveBeenCalledWith(
        'Connected memories',
        expect.objectContaining({
          userId,
          sourceContextId,
          targetContextId,
          connectionStrength,
        }),
      );
    });

    test('should append to existing memory connections', async () => {
      // Arrange
      const userId = 'user-123';
      const sourceContextId = 'context-source';
      const targetContextId = 'context-target';
      const existingConnectionId = 'context-existing';
      const connectionStrength = 0.6;

      // Mock contexts with existing connections
      mockPineconeService.fetchVectors.mockResolvedValue({
        records: {
          [sourceContextId]: {
            values: [0.1, 0.2, 0.3],
            metadata: {
              content: 'Source memory',
              memoryConnections: [existingConnectionId],
            },
          },
          [targetContextId]: {
            values: [0.4, 0.5, 0.6],
            metadata: {
              content: 'Target memory',
              // No existing connections
            },
          },
        },
      });

      // Act
      await service.connectMemories(
        userId,
        sourceContextId,
        targetContextId,
        connectionStrength,
      );

      // Assert
      // First call should append to existing connections
      expect(mockPineconeService.upsertVectors).toHaveBeenNthCalledWith(
        1,
        'user-context',
        [
          {
            id: sourceContextId,
            values: [0.1, 0.2, 0.3],
            metadata: expect.objectContaining({
              memoryConnections: [existingConnectionId, targetContextId],
            }),
          },
        ],
        userId,
      );
    });

    test('should throw error if source context not found', async () => {
      // Arrange
      const userId = 'user-123';
      const sourceContextId = 'nonexistent-source';
      const targetContextId = 'context-target';

      // Mock only target context exists
      mockPineconeService.fetchVectors.mockResolvedValue({
        records: {
          [targetContextId]: {
            values: [0.4, 0.5, 0.6],
            metadata: {
              content: 'Target memory',
            },
          },
          // No source context
        },
      });

      // Act & Assert
      await expect(
        service.connectMemories(userId, sourceContextId, targetContextId),
      ).rejects.toThrow(UserContextNotFoundError);

      expect(mockPineconeService.upsertVectors).not.toHaveBeenCalled();
    });

    test('should throw error if target context not found', async () => {
      // Arrange
      const userId = 'user-123';
      const sourceContextId = 'context-source';
      const targetContextId = 'nonexistent-target';

      // Mock only source context exists
      mockPineconeService.fetchVectors.mockResolvedValue({
        records: {
          [sourceContextId]: {
            values: [0.1, 0.2, 0.3],
            metadata: {
              content: 'Source memory',
            },
          },
          // No target context
        },
      });

      // Act & Assert
      await expect(
        service.connectMemories(userId, sourceContextId, targetContextId),
      ).rejects.toThrow(UserContextNotFoundError);

      expect(mockPineconeService.upsertVectors).not.toHaveBeenCalled();
    });
  });

  describe('findConnectedMemories', () => {
    test('should find directly connected memories (depth 1)', async () => {
      // Arrange
      const userId = 'user-123';
      const startContextId = 'context-start';
      const connectedId1 = 'context-1';
      const connectedId2 = 'context-2';

      // Mock starting context
      mockPineconeService.fetchVectors.mockImplementation(
        (index: string, ids: string[], uid: string) => {
          if (ids.includes(startContextId)) {
            return Promise.resolve({
              records: {
                [startContextId]: {
                  values: [0.1, 0.2, 0.3],
                  metadata: {
                    content: 'Start memory',
                    memoryType: MemoryType.EPISODIC,
                    memoryStrength: 0.8,
                    memoryConnections: [connectedId1, connectedId2],
                    [`memoryConnectionStrength:${connectedId1}`]: 0.7,
                    [`memoryConnectionStrength:${connectedId2}`]: 0.5,
                  },
                },
              },
            });
          } else if (ids.includes(connectedId1) || ids.includes(connectedId2)) {
            const records: Record<string, any> = {};

            if (ids.includes(connectedId1)) {
              records[connectedId1] = {
                values: [0.4, 0.5, 0.6],
                metadata: {
                  content: 'Connected memory 1',
                  memoryType: MemoryType.SEMANTIC,
                  memoryStrength: 0.6,
                },
              };
            }

            if (ids.includes(connectedId2)) {
              records[connectedId2] = {
                values: [0.7, 0.8, 0.9],
                metadata: {
                  content: 'Connected memory 2',
                  memoryType: MemoryType.PROCEDURAL,
                  memoryStrength: 0.9,
                },
              };
            }

            return Promise.resolve({ records });
          }

          return Promise.resolve({ records: {} });
        },
      );

      // Act
      const result = await service.findConnectedMemories(
        userId,
        startContextId,
        1,
        0.3,
      );

      // Assert
      expect(result.nodes.length).toBe(3); // Start + 2 connections
      expect(result.edges.length).toBe(2); // 2 connections

      // Check nodes
      const startNode = result.nodes.find((n) => n.id === startContextId);
      expect(startNode).toBeDefined();
      expect(startNode!.type).toBe(MemoryType.EPISODIC);
      expect(startNode!.strength).toBe(0.8);

      const node1 = result.nodes.find((n) => n.id === connectedId1);
      expect(node1).toBeDefined();
      expect(node1!.type).toBe(MemoryType.SEMANTIC);

      const node2 = result.nodes.find((n) => n.id === connectedId2);
      expect(node2).toBeDefined();
      expect(node2!.type).toBe(MemoryType.PROCEDURAL);

      // Check edges
      const edge1 = result.edges.find(
        (e) => e.source === startContextId && e.target === connectedId1,
      );
      expect(edge1).toBeDefined();
      expect(edge1!.strength).toBe(0.7);

      const edge2 = result.edges.find(
        (e) => e.source === startContextId && e.target === connectedId2,
      );
      expect(edge2).toBeDefined();
      expect(edge2!.strength).toBe(0.5);
    });

    test('should filter out memories below minimum strength', async () => {
      // Arrange
      const userId = 'user-123';
      const startContextId = 'context-start';
      const strongConnection = 'context-strong';
      const weakConnection = 'context-weak';

      // Mock starting context with strong and weak connections
      mockPineconeService.fetchVectors.mockImplementation(
        (index: string, ids: string[], uid: string) => {
          if (ids.includes(startContextId)) {
            return Promise.resolve({
              records: {
                [startContextId]: {
                  values: [0.1, 0.2, 0.3],
                  metadata: {
                    content: 'Start memory',
                    memoryConnections: [strongConnection, weakConnection],
                    [`memoryConnectionStrength:${strongConnection}`]: 0.8, // Above threshold
                    [`memoryConnectionStrength:${weakConnection}`]: 0.2, // Below threshold
                  },
                },
              },
            });
          } else if (
            ids.includes(strongConnection) ||
            ids.includes(weakConnection)
          ) {
            const records: Record<string, any> = {};

            if (ids.includes(strongConnection)) {
              records[strongConnection] = {
                values: [0.4, 0.5, 0.6],
                metadata: {
                  content: 'Strong connection',
                },
              };
            }

            if (ids.includes(weakConnection)) {
              records[weakConnection] = {
                values: [0.7, 0.8, 0.9],
                metadata: {
                  content: 'Weak connection',
                },
              };
            }

            return Promise.resolve({ records });
          }

          return Promise.resolve({ records: {} });
        },
      );

      // Act - with threshold of 0.5
      const result = await service.findConnectedMemories(
        userId,
        startContextId,
        1,
        0.5,
      );

      // Assert
      expect(result.nodes.length).toBe(2); // Start + strong connection only
      expect(result.edges.length).toBe(1); // Only strong connection

      // Check the edges include only the strong connection
      expect(result.edges[0].source).toBe(startContextId);
      expect(result.edges[0].target).toBe(strongConnection);
      expect(result.edges[0].strength).toBe(0.8);
    });

    test('should throw error if starting context not found', async () => {
      // Arrange
      const userId = 'user-123';
      const nonexistentId = 'nonexistent-context';

      // Mock empty result
      mockPineconeService.fetchVectors.mockResolvedValue({
        records: {},
      });

      // Act & Assert
      await expect(
        service.findConnectedMemories(userId, nonexistentId),
      ).rejects.toThrow(UserContextNotFoundError);
    });
  });
});
