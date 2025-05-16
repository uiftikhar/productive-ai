import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmModule } from '../langgraph/llm/llm.module';
import { EmbeddingService } from './embedding.service';
import { ChunkingService } from './chunking.service';
import { DocumentProcessorService } from './document-processor.service';
import { CacheModule } from '@nestjs/cache-manager';
import { PineconeModule } from '../pinecone/pinecone.module';
import { EMBEDDING_SERVICE, CHUNKING_SERVICE, DOCUMENT_PROCESSOR_SERVICE } from './constants/injection-tokens';

@Module({
  imports: [
    ConfigModule,
    LlmModule,
    PineconeModule,
    CacheModule.register({
      ttl: 3600, // 1 hour cache time-to-live
      max: 1000, // Maximum number of items in cache
    }),
  ],
  providers: [
    // Concrete implementations
    EmbeddingService,
    ChunkingService,
    DocumentProcessorService,
    
    // Token-based providers
    {
      provide: EMBEDDING_SERVICE,
      useExisting: EmbeddingService,
    },
    {
      provide: CHUNKING_SERVICE,
      useExisting: ChunkingService,
    },
    {
      provide: DOCUMENT_PROCESSOR_SERVICE,
      useExisting: DocumentProcessorService,
    },
  ],
  exports: [
    // Concrete implementations
    EmbeddingService,
    ChunkingService,
    DocumentProcessorService,
    
    // Token-based providers
    EMBEDDING_SERVICE,
    CHUNKING_SERVICE,
    DOCUMENT_PROCESSOR_SERVICE,
  ],
})
export class EmbeddingModule {} 