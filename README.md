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
import { EmbeddingService } from './src/shared/embeddings/embedding.service';

// Initialize the service with your API key
const embeddingService = new EmbeddingService({
  openAIApiKey: 'your-api-key', // Optional: defaults to OPENAI_API_KEY env variable
  model: 'text-embedding-ada-002', // Optional: defaults to text-embedding-ada-002
  dimensions: 1536, // Optional: defaults to 1536
});

// Generate embedding for a single text
const embedding = await embeddingService.generateEmbedding('Some text to embed');

// Find similar content from a collection
const contents = [
  'Information about apples',
  'Facts about oranges',
  'Details about bananas'
];

const results = await embeddingService.findSimilarContent('Tell me about fruits', contents);
console.log(results);
// Outputs array of SearchResult objects sorted by relevance score

// Search within a long document
const longText = "Very long document content...";
const relevantChunks = await embeddingService.searchInLongText('specific topic', longText);
```

### Configuration

The embedding service can be configured with the following options:

| Option | Description | Default |
|--------|-------------|---------|
| openAIApiKey | OpenAI API key | OPENAI_API_KEY env variable |
| model | Embedding model name | text-embedding-ada-002 |
| dimensions | Embedding dimensions | 1536 |
| apiBaseUrl | Custom API base URL | OPENAI_API_BASE_URL env variable |

## Additional Features 