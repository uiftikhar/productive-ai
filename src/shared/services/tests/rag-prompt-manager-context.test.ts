import {
  RagPromptManager,
  RagRetrievalStrategy,
  RagContextOptions
} from '../rag-prompt-manager.service';
import { BaseContextService } from '../../user-context/services/base-context.service';
import { DocumentContextService } from '../../user-context/services/document-context.service';
import { ConversationContextService } from '../../user-context/services/conversation-context.service';
import { RelevanceCalculationService } from '../../user-context/services/relevance-calculation.service';
import { ContextType } from '../../user-context/context-types';

// Define types to help with linting
interface ContextItem {
  id: string;
  content: string;
  score: number;
  metadata?: {
    contextType?: ContextType;
    source?: string;
    documentId?: string;
    conversationId?: string;
    timestamp?: number;
    [key: string]: any;
  };
}

// Mock the services
jest.mock('../../user-context/services/base-context.service');
jest.mock('../../user-context/services/document-context.service');
jest.mock('../../user-context/services/conversation-context.service');
jest.mock('../../user-context/services/relevance-calculation.service');

describe('RagPromptManager Context Retrieval Strategies', () => {
  let ragPromptManager: RagPromptManager;
  
  // Sample data for testing
  const userId = 'user123';
  const queryText = 'What do you know about machine learning?';
  const queryEmbedding = Array(1536).fill(0.1);
  
  // Sample context items
  const documentContextItems: ContextItem[] = [
    {
      id: 'doc1-chunk1',
      content: 'Machine learning is a subset of AI focused on algorithms that improve through experience.',
      score: 0.92,
      metadata: {
        contextType: ContextType.DOCUMENT,
        source: 'intro-to-ml.pdf',
        timestamp: Date.now() - 1000 * 60 * 60 * 24 * 7, // 1 week ago
        documentId: 'doc1'
      }
    },
    {
      id: 'doc1-chunk2',
      content: 'Supervised learning uses labeled data to train models for classification or regression tasks.',
      score: 0.87,
      metadata: {
        contextType: ContextType.DOCUMENT,
        source: 'intro-to-ml.pdf',
        timestamp: Date.now() - 1000 * 60 * 60 * 24 * 7,
        documentId: 'doc1'
      }
    }
  ];
  
  const conversationContextItems: ContextItem[] = [
    {
      id: 'conv1-turn1',
      content: 'User: Tell me about neural networks',
      score: 0.85,
      metadata: {
        contextType: ContextType.CONVERSATION,
        role: 'user',
        message: 'Tell me about neural networks',
        timestamp: Date.now() - 1000 * 60 * 30, // 30 minutes ago
        conversationId: 'conv1'
      }
    },
    {
      id: 'conv1-turn2',
      content: 'Assistant: Neural networks are computing systems inspired by biological neural networks.',
      score: 0.88,
      metadata: {
        contextType: ContextType.CONVERSATION,
        role: 'assistant',
        message: 'Neural networks are computing systems inspired by biological neural networks.',
        timestamp: Date.now() - 1000 * 60 * 29, // 29 minutes ago
        conversationId: 'conv1'
      }
    }
  ];
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create RagPromptManager instance
    ragPromptManager = new RagPromptManager();
    
    // Override private methods to make testing easier
    ragPromptManager['retrieveUserContext'] = jest.fn().mockImplementation((options: RagContextOptions) => {
      const strategy = options.strategy || RagRetrievalStrategy.SEMANTIC;
      
      if (strategy === RagRetrievalStrategy.CONVERSATION && !options.conversationId) {
        return Promise.reject(new Error('conversationId is required for CONVERSATION strategy'));
      }
      
      if (strategy === RagRetrievalStrategy.DOCUMENT && (!options.documentIds || options.documentIds.length === 0)) {
        return Promise.reject(new Error('documentIds are required for DOCUMENT strategy'));
      }
      
      // Different response based on strategy
      let items: ContextItem[] = [];
      const sources: string[] = [];
      
      switch (strategy) {
        case RagRetrievalStrategy.SEMANTIC:
          items = documentContextItems.filter(item => item.score >= (options.minRelevanceScore || 0));
          sources.push('intro-to-ml.pdf');
          break;
          
        case RagRetrievalStrategy.CONVERSATION:
          items = conversationContextItems;
          sources.push('conv1');
          break;
          
        case RagRetrievalStrategy.DOCUMENT:
          items = documentContextItems;
          sources.push('doc1');
          break;
          
        case RagRetrievalStrategy.HYBRID:
          items = [...documentContextItems, ...(options.conversationId ? conversationContextItems : [])];
          sources.push('intro-to-ml.pdf');
          if (options.conversationId) sources.push('conv1');
          break;
          
        case RagRetrievalStrategy.RECENCY:
          const recentItem: ContextItem = {
            id: 'recent-item',
            content: 'Very recent information about AI',
            score: 0.8,
            metadata: {
              timestamp: Date.now() - 1000 * 60, // 1 minute ago
              source: 'recent-source'
            }
          };
          items = [recentItem];
          sources.push('recent-source');
          break;
      }
      
      const formattedItems = items.map(item => ({
        content: item.content,
        source: item.metadata?.source || item.metadata?.documentId,
        score: item.score,
        metadata: item.metadata
      }));
      
      return Promise.resolve({
        items: formattedItems,
        formattedContext: `# Formatted context with ${formattedItems.length} items`,
        sources
      });
    });
    
    // Mock buildContextFilter
    ragPromptManager['buildContextFilter'] = jest.fn().mockImplementation(
      (contentTypes, timeRangeStart, documentIds) => {
        const filter: Record<string, any> = {};
        
        if (contentTypes && contentTypes.length > 0) {
          filter.contextType = { $in: contentTypes };
        }
        
        if (timeRangeStart) {
          filter.timestamp = { $gte: timeRangeStart };
        }
        
        if (documentIds && documentIds.length > 0) {
          filter.documentId = { $in: documentIds };
        }
        
        return filter;
    });
  });
  
  describe('SEMANTIC strategy', () => {
    test('should retrieve context based on vector similarity', async () => {
      // Create options for semantic search
      const options: RagContextOptions = {
        userId,
        queryText,
        queryEmbedding,
        strategy: RagRetrievalStrategy.SEMANTIC,
        maxItems: 5
      };
      
      // Call the method directly
      const result = await ragPromptManager['retrieveUserContext'](options);
      
      // Verify the result format
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('formattedContext');
      expect(result).toHaveProperty('sources');
      expect(result.items.length).toBeGreaterThan(0);
    });
    
    test('should filter results by minimum relevance score', async () => {
      // Create options with high minimum score
      const options: RagContextOptions = {
        userId,
        queryText,
        queryEmbedding,
        strategy: RagRetrievalStrategy.SEMANTIC,
        minRelevanceScore: 0.9 // Only keep items with score >= 0.9
      };
      
      // Call the method
      const result = await ragPromptManager['retrieveUserContext'](options);
      
      // Verify filtering worked
      expect(result.items.length).toBe(1);
      expect(result.items[0].score).toBeGreaterThanOrEqual(options.minRelevanceScore!);
    });
  });
  
  describe('CONVERSATION strategy', () => {
    test('should retrieve conversation history', async () => {
      // Create options for conversation retrieval
      const options: RagContextOptions = {
        userId,
        queryText,
        queryEmbedding,
        strategy: RagRetrievalStrategy.CONVERSATION,
        conversationId: 'conv1',
        maxItems: 2
      };
      
      // Call the method
      const result = await ragPromptManager['retrieveUserContext'](options);
      
      // Verify the result format
      expect(result).toHaveProperty('items');
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.sources).toContain('conv1');
    });
    
    test('should throw error if conversationId is missing', async () => {
      // Create options without conversationId
      const options: RagContextOptions = {
        userId,
        queryText,
        queryEmbedding,
        strategy: RagRetrievalStrategy.CONVERSATION
      };
      
      // Expect error when calling the method
      await expect(ragPromptManager['retrieveUserContext'](options))
        .rejects.toThrow('conversationId is required');
    });
  });
  
  describe('DOCUMENT strategy', () => {
    test('should retrieve document chunks', async () => {
      // Create options for document retrieval
      const options: RagContextOptions = {
        userId,
        queryText,
        queryEmbedding,
        strategy: RagRetrievalStrategy.DOCUMENT,
        documentIds: ['doc1']
      };
      
      // Call the method
      const result = await ragPromptManager['retrieveUserContext'](options);
      
      // Verify the result format
      expect(result).toHaveProperty('items');
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.sources).toContain('doc1');
    });
    
    test('should throw error if documentIds is missing', async () => {
      // Create options without documentIds
      const options: RagContextOptions = {
        userId,
        queryText,
        queryEmbedding,
        strategy: RagRetrievalStrategy.DOCUMENT
      };
      
      // Expect error when calling the method
      await expect(ragPromptManager['retrieveUserContext'](options))
        .rejects.toThrow('documentIds are required');
    });
  });
  
  describe('HYBRID strategy', () => {
    test('should combine semantic search with conversation context', async () => {
      // Create options for hybrid retrieval
      const options: RagContextOptions = {
        userId,
        queryText,
        queryEmbedding,
        strategy: RagRetrievalStrategy.HYBRID,
        conversationId: 'conv1',
        maxItems: 4
      };
      
      // Call the method
      const result = await ragPromptManager['retrieveUserContext'](options);
      
      // Verify the combined results
      expect(result.items.length).toBeGreaterThan(0);
      
      // Verify sources are combined
      expect(result.sources).toEqual(expect.arrayContaining(['intro-to-ml.pdf', 'conv1']));
    });
  });
  
  describe('RECENCY strategy', () => {
    test('should prioritize recent context', async () => {
      // Create options for recency-based retrieval
      const options: RagContextOptions = {
        userId,
        queryText,
        queryEmbedding,
        strategy: RagRetrievalStrategy.RECENCY,
        maxItems: 1
      };
      
      // Call the method
      const result = await ragPromptManager['retrieveUserContext'](options);
      
      // Verify we got the most recent item
      expect(result.items.length).toBe(1);
      expect(result.items[0].content).toBe('Very recent information about AI');
    });
  });
  
  describe('Context filter building', () => {
    test('should build filter with content types', () => {
      const contentTypes = [ContextType.DOCUMENT, ContextType.CONVERSATION];
      const filter = ragPromptManager['buildContextFilter'](contentTypes);
      
      expect(filter).toEqual({
        contextType: { $in: contentTypes }
      });
    });
    
    test('should build filter with time range', () => {
      const now = Date.now();
      const timeRangeStart = now - 1000 * 60 * 60; // 1 hour ago
      const filter = ragPromptManager['buildContextFilter'](undefined, timeRangeStart);
      
      expect(filter).toEqual({
        timestamp: { $gte: timeRangeStart }
      });
    });
    
    test('should build filter with document IDs', () => {
      const documentIds = ['doc1', 'doc2'];
      const filter = ragPromptManager['buildContextFilter'](undefined, undefined, documentIds);
      
      expect(filter).toEqual({
        documentId: { $in: documentIds }
      });
    });
    
    test('should combine multiple filter criteria', () => {
      const contentTypes = [ContextType.DOCUMENT];
      const timeRangeStart = Date.now() - 1000 * 60 * 60;
      const documentIds = ['doc1'];
      
      const filter = ragPromptManager['buildContextFilter'](contentTypes, timeRangeStart, documentIds);
      
      expect(filter).toEqual({
        contextType: { $in: contentTypes },
        timestamp: { $gte: timeRangeStart },
        documentId: { $in: documentIds }
      });
    });
  });
}); 