import { Test } from '@nestjs/testing';
import { EmbeddingService } from './embedding.service';
import { ChunkingService } from './chunking.service';
import { DocumentProcessorService } from './document-processor.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LlmService } from '../langgraph/llm/llm.service';
import { PineconeService } from '../pinecone/pinecone.service';
import { PineconeConfigService } from '../pinecone/pinecone-config.service';
import { PineconeConnectionService } from '../pinecone/pinecone-connection.service';
import { PineconeIndexService } from '../pinecone/pinecone-index.service';
import { CacheModule } from '@nestjs/cache-manager';

/**
 * Test script to verify the embedding implementation
 */
async function testEmbeddings() {
  // Create a test module
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot(),
      CacheModule.register(),
    ],
    providers: [
      EmbeddingService,
      ChunkingService,
      {
        provide: LlmService,
        useFactory: (configService: ConfigService) => new LlmService(configService),
        inject: [ConfigService],
      },
      {
        provide: PineconeService,
        useValue: {
          storeVectors: jest.fn().mockResolvedValue(undefined),
          querySimilar: jest.fn().mockResolvedValue([]),
          deleteVectorsByFilter: jest.fn().mockResolvedValue(undefined),
        },
      },
      {
        provide: DocumentProcessorService,
        useFactory: (embeddingService: EmbeddingService, chunkingService: ChunkingService, pineconeService: PineconeService) => 
          new DocumentProcessorService(embeddingService, chunkingService, pineconeService),
        inject: [EmbeddingService, ChunkingService, PineconeService],
      },
    ],
  }).compile();

  const embeddingService = moduleRef.get<EmbeddingService>(EmbeddingService);
  const chunkingService = moduleRef.get<ChunkingService>(ChunkingService);
  const documentProcessorService = moduleRef.get<DocumentProcessorService>(DocumentProcessorService);

  console.log('Testing embedding generation...');
  
  const testText = 'This is a test text for generating embeddings.';
  try {
    const embedding = await embeddingService.generateEmbedding(testText);
    
    console.log(`Generated embedding of dimension: ${embedding.length}`);
    console.log(`First few values: ${embedding.slice(0, 5).join(', ')}`);
  } catch (error) {
    console.error('Error generating embedding:', error.message);
  }
  
  console.log('\nTesting text chunking...');
  
  const longText = 'This is a long text. ' + 'It has multiple sentences. '.repeat(10);
  
  const chunks = chunkingService.smartChunk(longText, {
    splitBy: 'sentence',
    chunkSize: 3,
  });
  
  console.log(`Split into ${chunks.length} chunks`);
  console.log('First chunk: ', chunks[0]);
  
  console.log('\nTesting different chunking strategies...');
  
  const tokenChunks = chunkingService.chunkByTokens(longText, { chunkSize: 10 });
  console.log(`Token chunks: ${tokenChunks.length}`);
  
  const sentenceChunks = chunkingService.chunkBySentences(longText, { chunkSize: 2 });
  console.log(`Sentence chunks: ${sentenceChunks.length}`);
  
  const paragraphText = 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.\n\nParagraph 4.\n\nParagraph 5.';
  const paragraphChunks = chunkingService.chunkByParagraphs(paragraphText, { maxParagraphsPerChunk: 2 });
  console.log(`Paragraph chunks: ${paragraphChunks.length}`);
}

// Run the test if this file is executed directly
if (require.main === module) {
  testEmbeddings()
    .then(() => {
      console.log('Tests completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Tests failed:', error);
      process.exit(1);
    });
}

export { testEmbeddings }; 