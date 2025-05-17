import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { EmbeddingService } from './embedding.service';
import { ChunkingService } from './chunking.service';
import { DocumentProcessorService } from './document-processor.service';
import { PineconeModule } from '../pinecone/pinecone.module';
import { EMBEDDING_SERVICE, CHUNKING_SERVICE, DOCUMENT_PROCESSOR_SERVICE } from './constants/injection-tokens';
import { LlmModule } from '../langgraph/llm/llm.module';
import { DimensionAdapterService } from './dimension-adapter.service';

@Module({
  imports: [
    ConfigModule,
    LlmModule,
    PineconeModule,
    CacheModule.register({
      ttl: 60 * 60 * 1000, // 1 hour cache TTL
      max: 100, // Maximum number of items in cache
    }),
  ],
  providers: [
    EmbeddingService,
    ChunkingService,
    DocumentProcessorService,
    {
      provide: EMBEDDING_SERVICE,
      useClass: EmbeddingService,
    },
    {
      provide: CHUNKING_SERVICE,
      useExisting: ChunkingService,
    },
    {
      provide: DOCUMENT_PROCESSOR_SERVICE,
      useExisting: DocumentProcessorService,
    },
    DimensionAdapterService,
  ],
  exports: [
    EMBEDDING_SERVICE,
    CHUNKING_SERVICE,
    DOCUMENT_PROCESSOR_SERVICE,
    DimensionAdapterService,
  ],
})
export class EmbeddingModule {} 