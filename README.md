# Productive AI

A toolset for AI-powered productivity enhancements.

## Embedding Service

The Embedding Service provides semantic search capabilities by generating and comparing text embeddings.

### Features

- Generate embeddings for text content using OpenAI API
- Calculate similarity between text segments
- Split long texts into overlapping chunks for better search relevance
- Search within documents to find relevant information

### Usage

```typescript
import { EmbeddingServiceFactory } from './src/shared/services/embedding.factory';

// Get the embedding service with default settings
const embeddingService = EmbeddingServiceFactory.getService();

// Or with custom options
const customEmbeddingService = EmbeddingServiceFactory.getService({
  connector: myOpenAIConnector,
  logger: myCustomLogger
});

// Generate embedding for a single text
const embedding = await embeddingService.generateEmbedding('Some text to embed');

// Find similar content from a collection of embeddings
const embeddedContents = [
  { embedding: await embeddingService.generateEmbedding('Information about apples'), metadata: { text: 'Information about apples' } },
  { embedding: await embeddingService.generateEmbedding('Facts about oranges'), metadata: { text: 'Facts about oranges' } },
  { embedding: await embeddingService.generateEmbedding('Details about bananas'), metadata: { text: 'Details about bananas' } }
];

const queryEmbedding = await embeddingService.generateEmbedding('Tell me about fruits');
const results = embeddingService.findSimilarEmbeddings(queryEmbedding, embeddedContents);
console.log(results);
// Outputs array of objects with similarity scores and metadata sorted by relevance

// Combine multiple embeddings
const combinedEmbedding = embeddingService.combineEmbeddings([embedding1, embedding2, embedding3]);
```

### Configuration

The embedding service can be configured using the factory with these options:

| Option | Description |
|--------|-------------|
| connector | OpenAIConnector instance for interacting with the OpenAI API |
| logger | Custom logger implementing the Logger interface |
| useAdapter | Boolean flag to use adapter (useful for legacy code) |
| embeddingService | Provide a custom embedding service that implements IEmbeddingService |

Example with custom configuration:

```typescript
import { EmbeddingServiceFactory } from './src/shared/services/embedding.factory';
import { OpenAIConnector } from './src/agents/integrations/openai-connector';
import { ConsoleLogger } from './src/shared/logger/console-logger';

// Create a connector with custom settings
const connector = new OpenAIConnector({
  modelConfig: {
    model: 'text-embedding-3-large'
  },
  logger: new ConsoleLogger()
});

// Get an embedding service with the custom connector
const embeddingService = EmbeddingServiceFactory.getService({
  connector,
  logger: new ConsoleLogger()
});
```

## Additional Features 