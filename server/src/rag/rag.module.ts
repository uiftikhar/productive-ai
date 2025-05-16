/**
 * RAG Module
 * 
 * This module registers all RAG-related services and providers,
 * using token-based dependency injection to avoid circular dependencies.
 */
import { Module } from '@nestjs/common';
import { UnifiedRAGService } from './core/unified-rag.service';
import { AdvancedChunkingService } from './core/advanced-chunking.service';
import { RAGQueryAnalyzerService } from './core/rag-query-analyzer.service';
import { MeetingContextProvider } from './context/meeting-context-provider';
import { DocumentContextProvider } from './context/document-context-provider';
import { ConversationMemoryService } from './memory/conversation-memory.service';
import { 
  RAG_SERVICE,
  UNIFIED_RAG_SERVICE,
  CONTEXT_PROVIDER,
  RETRIEVAL_SERVICE,
  CHUNKING_SERVICE,
  RAG_QUERY_ANALYZER,
  CONVERSATION_MEMORY_SERVICE
} from './constants/injection-tokens';

/**
 * RAG Module with dependency injection
 */
@Module({
  providers: [
    // Core RAG Service - register both class and token
    UnifiedRAGService,
    {
      provide: RAG_SERVICE,
      useExisting: UnifiedRAGService
    },
    {
      provide: UNIFIED_RAG_SERVICE,
      useExisting: UnifiedRAGService
    },
    
    // Supporting services
    AdvancedChunkingService,
    {
      provide: CHUNKING_SERVICE,
      useExisting: AdvancedChunkingService
    },
    
    RAGQueryAnalyzerService,
    {
      provide: RAG_QUERY_ANALYZER,
      useExisting: RAGQueryAnalyzerService
    },
    
    // Context providers
    MeetingContextProvider,
    DocumentContextProvider,
    {
      provide: CONTEXT_PROVIDER,
      useFactory: (meetingProvider: MeetingContextProvider, documentProvider: DocumentContextProvider) => {
        return {
          meeting_transcript: meetingProvider,
          document: documentProvider
        };
      },
      inject: [MeetingContextProvider, DocumentContextProvider]
    },
    
    // Memory services
    ConversationMemoryService,
    {
      provide: CONVERSATION_MEMORY_SERVICE,
      useExisting: ConversationMemoryService
    }
  ],
  exports: [
    // Export both classes and tokens for flexibility
    UnifiedRAGService,
    RAG_SERVICE,
    UNIFIED_RAG_SERVICE,
    AdvancedChunkingService,
    CHUNKING_SERVICE,
    RAGQueryAnalyzerService,
    RAG_QUERY_ANALYZER,
    MeetingContextProvider,
    DocumentContextProvider,
    CONTEXT_PROVIDER,
    ConversationMemoryService,
    CONVERSATION_MEMORY_SERVICE
  ]
})
export class RagModule {} 