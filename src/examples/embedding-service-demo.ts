import {
  EmbeddingService,
  SearchResult,
} from '../shared/embeddings/embedding.service.ts';

// Simple console logger
const logger = {
  info: (message: string, ...meta: any[]) =>
    console.log(`[INFO] ${message}`, ...meta),
  debug: (message: string, ...meta: any[]) =>
    console.log(`[DEBUG] ${message}`, ...meta),
  warn: (message: string, ...meta: any[]) =>
    console.log(`[WARN] ${message}`, ...meta),
  error: (message: string, error?: any, ...meta: any[]) =>
    console.error(`[ERROR] ${message}`, error || '', ...meta),
  setLogLevel: (level: string) =>
    console.log(`[CONFIG] Setting log level to ${level}`),
};

async function runDemo() {
  logger.info('Starting Embedding Service Demo');

  // Initialize the embedding service
  const embeddingService = new EmbeddingService(
    {
      // Use environment variables for API key
    },
    logger,
  );

  // Sample documents
  const documents = [
    'Artificial intelligence (AI) is intelligence demonstrated by machines, as opposed to intelligence of humans and other animals.',
    'Machine learning is a field of study in artificial intelligence concerned with the development and study of statistical algorithms.',
    'Natural language processing (NLP) is a subfield of linguistics, computer science, and artificial intelligence.',
    'Computer vision is an interdisciplinary scientific field that deals with how computers can gain high-level understanding from digital images or videos.',
    'Robotics is an interdisciplinary branch of computer science and engineering that involves the design, construction, operation, and use of robots.',
  ];

  try {
    // 1. Generate embedding for a single document
    logger.info('Generating embedding for a single document...');
    const singleEmbedding = await embeddingService.generateEmbedding(
      documents[0],
    );
    logger.info(
      `Generated embedding with ${singleEmbedding.length} dimensions`,
    );
    logger.debug('First few values:', singleEmbedding.slice(0, 5));

    // 2. Search for similar documents
    logger.info('\nSearching for documents related to "AI and language"...');
    const searchResults = await embeddingService.findSimilarContent(
      'AI and language',
      documents,
    );

    logger.info('Search results (ranked by relevance):');
    searchResults.forEach((result: SearchResult, idx: number) => {
      logger.info(`${idx + 1}. Score: ${result.score.toFixed(4)}`);
      logger.info(`   Content: ${result.content}`);
    });

    // 3. Split and search in a long document
    logger.info('\nDemonstrating long document search...');
    const longDocument = documents.join(' ') + ' ' + documents.join(' '); // Just duplicate to make it longer

    logger.info('Splitting document into chunks...');
    const chunks = embeddingService.splitContentIntoChunks(
      longDocument,
      50,
      10,
    );
    logger.info(`Created ${chunks.length} chunks from the document`);

    logger.info('\nSearching in long document for "computer vision"...');
    const longDocResults = await embeddingService.searchInLongText(
      'computer vision',
      longDocument,
      2,
    );

    logger.info('Long document search results:');
    longDocResults.forEach((result: SearchResult, idx: number) => {
      logger.info(`${idx + 1}. Score: ${result.score.toFixed(4)}`);
      logger.info(`   Content: ${result.content}`);
    });
  } catch (error: any) {
    logger.error('Error during demo', error);
  }

  logger.info('\nEmbedding Service Demo completed');
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runDemo().catch((err) => {
    console.error('Unhandled error in demo:', err);
    process.exit(1);
  });
}
