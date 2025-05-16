import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LangGraphModule } from '../langgraph/langgraph.module';
import { PineconeModule } from '../pinecone/pinecone.module';
import { CacheModule } from '@nestjs/cache-manager';
import { EmbeddingService } from './embedding.service';
import { ChunkingService } from './chunking.service';
import { DocumentProcessorService } from './document-processor.service';

@Module({
  imports: [
    ConfigModule,
    LangGraphModule,
    PineconeModule,
    CacheModule.register({
      ttl: 3600, // 1 hour cache time-to-live
      max: 1000, // Maximum number of items in cache
    }),
  ],
  providers: [
    EmbeddingService,
    ChunkingService ,
    DocumentProcessorService,
  ],
  exports: [
    EmbeddingService,
    ChunkingService,
    DocumentProcessorService,
  ],
})
export class EmbeddingModule {} 