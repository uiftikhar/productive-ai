///<reference types="jest" />
// @ts-nocheck
/**
 * @jest-environment node
 */
import { jest } from '@jest/globals';
import { EmbeddingService } from '../../services/embedding.service.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { RagPromptManager, RagRetrievalStrategy } from '../../shared/services/rag-prompt-manager.service.ts';
import { UserContextService } from '../../shared/user-context/user-context.service.ts';
import { KnowledgeRetrievalAgent } from '../specialized/knowledge-retrieval-agent.ts';
import { ContextType } from '../../shared/user-context/context-types.ts';

// Tell TypeScript to ignore the issue with "NOTE" not being in ContextType
ContextType.NOTE = 'note';

// Add missing strategies
const EXTENDED_STRATEGIES = {
  ...RagRetrievalStrategy,
  METADATA: 'metadata',
  COMBINED: 'combined'
};

// Mock dependencies
jest.mock('../../shared/user-context/user-context.service');
jest.mock('../../shared/services/rag-prompt-manager.service');
jest.mock('../../shared/embedding/embedding.service');

// Disable TypeScript checking for mocked implementations
// @ts-ignore
describe('KnowledgeRetrievalAgent Integration Tests', () => {
  // Use any to avoid TypeScript checking mocked implementations
  let knowledgeRetrievalAgent: any;
  let userContextService: any;
  let ragPromptManager: any;
  let embeddingService: any;
  let logger: ConsoleLogger;
  
  // Sample context items for testing
  const sampleContextItems = [
    {
      id: 'context-1',
      content: 'Important project milestone reached ahead of schedule.',
      metadata: {
        contextType: ContextType.NOTE,
        userId: 'test-user-123',
        source: 'meeting-notes',
        createdAt: Date.now() - 86400000 // 1 day ago
      },
      score: 0.92
    },
    {
      id: 'context-2',
      content: 'Team identified potential risks in the deployment plan.',
      metadata: {
        contextType: ContextType.NOTE,
        userId: 'test-user-123',
        source: 'risk-assessment',
        createdAt: Date.now() - 43200000 // 12 hours ago
      },
      score: 0.85
    },
    {
      id: 'context-3',
      content: 'Action item: Investigate performance issues in module X.',
      metadata: {
        contextType: ContextType.ACTION_ITEM,
        userId: 'test-user-123',
        actionItemId: 'ai-123',
        status: 'pending',
        createdAt: Date.now() - 172800000 // 2 days ago
      },
      score: 0.78
    }
  ];
  
  // Sample vector results
  const sampleVectorResults = {
    matches: sampleContextItems.map(item => ({
      id: item.id,
      score: item.score,
      metadata: item.metadata,
      values: new Array(1536).fill(0).map((_, i) => i / 1536)
    })),
    namespace: 'test-namespace'
  };
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mocked UserContextService with type assertions
    userContextService = {} as any;
    userContextService.queryVectors = jest.fn().mockResolvedValue(sampleVectorResults);
    userContextService.fetchVectors = jest.fn().mockImplementation(async (userId: string, filter: any) => {
      return {
        records: sampleContextItems
          .filter(item => {
            if (filter.contextTypes && !filter.contextTypes.includes(item.metadata.contextType)) {
              return false;
            }
            return true;
          })
          .map(item => ({
            id: item.id,
            metadata: item.metadata,
            values: new Array(1536).fill(0).map((_, i) => i / 1536)
          }))
      };
    });
    
    // Setup mocked RagPromptManager with type assertions
    ragPromptManager = {} as any;
    ragPromptManager.formatContextItems = jest.fn().mockImplementation((items: any[]) => {
      return items.map((item: any) => ({
        content: item.content,
        source: item.metadata?.source || 'unknown',
        contextType: item.metadata?.contextType || 'unknown',
        score: item.score || 0
      }));
    });
    ragPromptManager.storeRagInteraction = jest.fn().mockResolvedValue('interaction-id');
    ragPromptManager.createRagPrompt = jest.fn().mockResolvedValue({
      messages: [],
      retrievedContext: { items: [], formattedContext: '', sources: [] }
    });
    
    // Setup mocked EmbeddingService with type assertions
    embeddingService = {} as any;
    embeddingService.embedText = jest.fn().mockResolvedValue(
      new Array(1536).fill(0).map((_, i) => i / 1536)
    );
    embeddingService.createEmbeddings = jest.fn().mockResolvedValue({
      embeddings: [new Array(1536).fill(0).map((_, i) => i / 1536)]
    });
    
    // Setup logger
    logger = new ConsoleLogger();
    logger.setLogLevel('error'); // Reduce noise in tests
    
    // Create the KnowledgeRetrievalAgent instance
    knowledgeRetrievalAgent = new KnowledgeRetrievalAgent({
      userContextService,
      ragPromptManager,
      embeddingService,
      logger
    });
  });
  
  test('Should retrieve knowledge using semantic search strategy', async () => {
    // Prepare request with semantic search strategy
    const request = {
      input: 'What are the current project risks?',
      parameters: {
        userId: 'test-user-123',
        strategy: EXTENDED_STRATEGIES.SEMANTIC,
        maxItems: 5,
        minRelevanceScore: 0.7
      }
    };
    
    // Execute the agent
    const response = await knowledgeRetrievalAgent.execute(request);
    
    // Test assertions
    expect(response).toBeDefined();
    expect(response.output).toBeDefined();
    if (response.artifacts) {
      expect(response.artifacts.contextItems).toBeDefined();
      expect(response.artifacts.contextItems.length).toBeGreaterThan(0);
    }
    
    // Verify that embeddings were generated for the query
    expect(embeddingService.embedText).toHaveBeenCalledWith(request.input);
    
    // Verify that semantic search was used
    expect(userContextService.queryVectors).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        userId: 'test-user-123',
        maxResults: 5,
        minScore: 0.7
      })
    );
    
    // Verify that the RAG interaction was stored
    expect(ragPromptManager.storeRagInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'test-user-123',
        query: request.input
      })
    );
  });
  
  test('Should retrieve knowledge using hybrid search strategy', async () => {
    // Prepare request with hybrid search strategy
    const request = {
      input: 'What action items are pending?',
      parameters: {
        userId: 'test-user-123',
        strategy: EXTENDED_STRATEGIES.HYBRID,
        maxItems: 10,
        minRelevanceScore: 0.6,
        contextTypes: [ContextType.ACTION_ITEM]
      }
    };
    
    // Execute the agent
    const response = await knowledgeRetrievalAgent.execute(request);
    
    // Test assertions
    expect(response).toBeDefined();
    expect(response.artifacts.contextItems).toBeDefined();
    
    // Check that only action items were retrieved
    const actionItems = response.artifacts.contextItems.filter(
      item => item.contextType === ContextType.ACTION_ITEM
    );
    expect(actionItems.length).toBe(response.artifacts.contextItems.length);
    
    // Verify the context filter was applied
    const filterCall = userContextService.fetchVectors.mock.calls[0];
    expect(filterCall).toBeDefined();
    expect(filterCall[1].contextTypes).toContain(ContextType.ACTION_ITEM);
  });
  
  test('Should retrieve knowledge using metadata filter strategy', async () => {
    // Prepare request with metadata filter strategy
    const request = {
      input: 'Find recent meeting notes',
      parameters: {
        userId: 'test-user-123',
        strategy: EXTENDED_STRATEGIES.METADATA,
        metadataFilters: {
          source: 'meeting-notes'
        },
        maxItems: 5
      }
    };
    
    // Execute the agent
    const response = await knowledgeRetrievalAgent.execute(request);
    
    // Test assertions
    expect(response).toBeDefined();
    expect(response.artifacts.contextItems).toBeDefined();
    
    // Verify the metadata filter was applied
    const filterCall = userContextService.fetchVectors.mock.calls[0];
    expect(filterCall).toBeDefined();
    expect(filterCall[1].metadataFilter).toMatchObject({
      source: 'meeting-notes'
    });
  });
  
  test('Should handle empty search results gracefully', async () => {
    // Mock empty results
    userContextService.queryVectors = jest.fn().mockResolvedValue({
      matches: [],
      namespace: 'test-namespace'
    });
    userContextService.fetchVectors = jest.fn().mockResolvedValue({
      records: []
    });
    
    // Prepare request
    const request = {
      input: 'Query with no results',
      parameters: {
        userId: 'test-user-123',
        strategy: EXTENDED_STRATEGIES.SEMANTIC,
        maxItems: 5,
        minRelevanceScore: 0.7
      }
    };
    
    // Execute the agent
    const response = await knowledgeRetrievalAgent.execute(request);
    
    // Test assertions
    expect(response).toBeDefined();
    expect(response.output).toContain('No relevant knowledge found');
    expect(response.artifacts.contextItems).toEqual([]);
    
    // Verify error handling
    expect(response.artifacts.noResults).toBeTruthy();
  });
  
  test('Should combine results from multiple retrieval strategies', async () => {
    // Prepare request with combined strategy
    const request = {
      input: 'Find information about project milestones and risks',
      parameters: {
        userId: 'test-user-123',
        strategy: EXTENDED_STRATEGIES.COMBINED,
        maxItems: 10,
        minRelevanceScore: 0.6,
        strategies: [
          {
            type: EXTENDED_STRATEGIES.SEMANTIC,
            weight: 0.7,
            parameters: {
              maxItems: 5
            }
          },
          {
            type: EXTENDED_STRATEGIES.METADATA,
            weight: 0.3,
            parameters: {
              metadataFilters: {
                source: 'risk-assessment'
              },
              maxItems: 5
            }
          }
        ]
      }
    };
    
    // Execute the agent
    const response = await knowledgeRetrievalAgent.execute(request);
    
    // Test assertions
    expect(response).toBeDefined();
    expect(response.artifacts.contextItems).toBeDefined();
    
    // Verify that both strategies were used
    expect(userContextService.queryVectors).toHaveBeenCalled();
    expect(userContextService.fetchVectors).toHaveBeenCalled();
    
    // Verify format of the combined results
    expect(ragPromptManager.formatContextItems).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.any(String),
          score: expect.any(Number)
        })
      ])
    );
  });
  
  test('Should handle errors during retrieval', async () => {
    // Mock an error during vector query
    userContextService.queryVectors = jest.fn().mockRejectedValue(
      new Error('Test vector query error')
    );
    
    // Prepare request
    const request = {
      input: 'Query that causes an error',
      parameters: {
        userId: 'test-user-123',
        strategy: EXTENDED_STRATEGIES.SEMANTIC,
        maxItems: 5,
        minRelevanceScore: 0.7
      }
    };
    
    // Execute the agent
    const response = await knowledgeRetrievalAgent.execute(request);
    
    // Test assertions
    expect(response).toBeDefined();
    expect(response.artifacts.error).toBeDefined();
    expect(response.artifacts.error).toContain('Test vector query error');
    
    // Should still return a valid output for the agent protocol
    expect(response.output).toBeDefined();
  });
}); 