/**
 * RAG System - Central Module Exports
 * 
 * This file serves as the central entry point for the RAG system,
 * exporting all relevant interfaces, classes, and services.
 */

// Core RAG services
export { UnifiedRAGService } from './core/unified-rag.service';
export { AdvancedChunkingService } from './core/advanced-chunking.service';
export { RAGQueryAnalyzerService } from './core/rag-query-analyzer.service';

// Core RAG interfaces
export {
  UnifiedRAGService as IUnifiedRAGService,
  EmbeddingOptions,
  PromptEnhancementOptions,
  PromptWithContext,
  AnalysisOptions,
  QueryAnalysisResult
} from './core/unified-rag.service.interface';

export {
  ChunkingService,
  ChunkingOptions,
  ChunkingResult,
  ContentChunk,
  ChunkMetadata
} from './core/chunking.interface';

// Context providers and interfaces
export { MeetingContextProvider, MeetingContextOptions } from './context/meeting-context-provider';
export { DocumentContextProvider, DocumentContextOptions } from './context/document-context-provider';

export {
  ContextProvider,
  RetrievalOptions,
  RetrievalResult,
  ContextProcessingOptions,
  ProcessedContext,
  ContextStorageOptions
} from './context/context-provider.interface';

// Memory services
export { 
  ConversationMemoryService,
  ConversationEntry,
  MessageEntry,
  ConversationSearchOptions
} from './memory/conversation-memory.service';

// Agents
export { 
  ContextAwareBaseAgent, 
  ContextAwareAgentConfig 
} from './agents/context-aware-base-agent';

/**
 * Create and configure the unified RAG service with all necessary providers
 * @param options Configuration options
 * @returns Configured UnifiedRAGService instance
 */
export function createUnifiedRAGService(options: {
  logger?: any;
  openAiConnector?: any;
  pineconeConnector?: any;
  meetingContextNamespace?: string;
  documentContextNamespace?: string;
  conversationMemory?: any;
} = {}): any {
  // Import here to avoid circular dependencies
  const { UnifiedRAGService } = require('./core/unified-rag.service');
  const { AdvancedChunkingService } = require('./core/advanced-chunking.service');
  const { RAGQueryAnalyzerService } = require('./core/rag-query-analyzer.service');
  const { MeetingContextProvider } = require('./context/meeting-context-provider');
  const { DocumentContextProvider } = require('./context/document-context-provider');
  const { ConversationMemoryService } = require('./memory/conversation-memory.service');
  
  // Create basic services
  const logger = options.logger;
  const openAiConnector = options.openAiConnector;
  const pineconeConnector = options.pineconeConnector;
  
  // Create query analyzer and chunking services
  const chunkingService = new AdvancedChunkingService({ 
    logger, 
    openAiConnector 
  });
  
  const queryAnalyzer = new RAGQueryAnalyzerService({ 
    logger, 
    openAiConnector 
  });

  // Create or use conversation memory service
  const conversationMemory = options.conversationMemory || new ConversationMemoryService({
    logger,
    openAiConnector
  });
  
  // Create context providers
  const contextProviders: Record<string, any> = {};
  
  // Meeting context provider
  const meetingContextProvider = new MeetingContextProvider({
    logger,
    openAiConnector,
    pineconeConnector,
    defaultNamespace: options.meetingContextNamespace || 'meeting-transcripts'
  });
  
  // Document context provider
  const documentContextProvider = new DocumentContextProvider({
    logger,
    openAiConnector,
    pineconeConnector,
    defaultNamespace: options.documentContextNamespace || 'documents'
  });
  
  // Register providers for different content types
  contextProviders['meeting_transcript'] = meetingContextProvider;
  contextProviders['transcript'] = meetingContextProvider;
  contextProviders['document'] = documentContextProvider;
  contextProviders['pdf'] = documentContextProvider;
  contextProviders['text'] = documentContextProvider;
  contextProviders['markdown'] = documentContextProvider;
  contextProviders['conversation'] = documentContextProvider; // Use document provider for conversations
  
  // Create the unified service with all dependencies
  return new UnifiedRAGService({
    logger,
    openAiConnector,
    chunkingService,
    queryAnalyzer,
    contextProviders,
    conversationMemory
  });
}