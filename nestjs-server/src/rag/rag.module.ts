import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PineconeModule } from '../pinecone/pinecone.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { LlmModule } from '../langgraph/llm/llm.module';
import { CacheModule } from '@nestjs/cache-manager';
import { StateModule } from '../langgraph/state/state.module';
import { AdaptiveRagService } from './adaptive-rag.service';
import { RetrievalService } from './retrieval.service';
import { RagService } from './rag.service';
import { RAG_SERVICE, RETRIEVAL_SERVICE, ADAPTIVE_RAG_SERVICE } from './constants/injection-tokens';

@Module({
  imports: [
    ConfigModule,
    PineconeModule,
    EmbeddingModule,
    LlmModule,
    StateModule,
    CacheModule.register({
      ttl: 1800, // 30 minutes
      max: 100,
    }),
  ],
  providers: [
    // Service implementations
    RetrievalService,
    RagService,
    AdaptiveRagService,
    
    // Token-based providers for dependency injection
    {
      provide: RETRIEVAL_SERVICE,
      useExisting: RetrievalService
    },
    {
      provide: RAG_SERVICE,
      useExisting: RagService
    },
    {
      provide: ADAPTIVE_RAG_SERVICE,
      useExisting: AdaptiveRagService
    }
  ],
  exports: [
    // Export both concrete implementations and tokens
    RetrievalService,
    RagService,
    AdaptiveRagService,
    RETRIEVAL_SERVICE,
    RAG_SERVICE,
    ADAPTIVE_RAG_SERVICE,
  ],
})
export class RagModule {} 