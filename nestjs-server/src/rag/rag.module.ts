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
    RagService,
    RetrievalService,
    AdaptiveRagService,
  ],
  exports: [
    RagService,
    RetrievalService,
    AdaptiveRagService,
  ],
})
export class RagModule {} 