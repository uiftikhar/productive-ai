# Embedding Service Migration Guide

## Overview

This guide details how to migrate existing code to use the standardized embedding service interface. The goal of this migration is to:

1. **Standardize interfaces** - Use a consistent API across the codebase
2. **Simplify implementation** - Provide a single canonical implementation
3. **Improve maintainability** - Make future updates easier by centralizing the embedding logic
4. **Ensure backward compatibility** - Support both new and legacy interface methods

## Background

Currently, our codebase has multiple embedding implementations with different interfaces:

1. **EmbeddingService** in `src/shared/services/embedding.service.ts` - Our canonical implementation with methods like `generateEmbedding`, `calculateCosineSimilarity`, etc.
2. **LangChain OpenAIEmbeddings** - Used directly in some parts of the code with methods like `embedText`, `embedBatch`, etc.

## Migration Steps

### Step 1: Import from the Factory

Replace direct imports of embedding implementations with imports from the factory:

```typescript
// BEFORE (DEPRECATED)
import { EmbeddingService } from '../shared/services/embedding.service';
// or
import { OpenAIEmbeddings } from '@langchain/openai';

// AFTER (RECOMMENDED)
import { EmbeddingServiceFactory } from '../shared/services/embedding.factory';
import { IEmbeddingService } from '../shared/services/embedding.interface';
```

### Step 2: Use the Factory to Get the Service

Replace direct instantiation with factory calls:

```typescript
// BEFORE (DEPRECATED)
const embeddingService = new EmbeddingService(connector, logger);
// or
const embeddings = new OpenAIEmbeddings();

// AFTER (RECOMMENDED)
const embeddingService = EmbeddingServiceFactory.getService({
  connector,
  logger
});
```

### Step 3: Use the Standardized Interface

The standardized interface supports both sets of methods:

```typescript
// Core methods (preferred)
const embedding = await embeddingService.generateEmbedding(text);
const similarity = embeddingService.calculateCosineSimilarity(embedding1, embedding2);
const similarItems = embeddingService.findSimilarEmbeddings(query, items);
const combined = embeddingService.combineEmbeddings(embeddings);

// Alternative methods (for backward compatibility)
const embedding = await embeddingService.embedText(text);
const batchEmbeddings = await embeddingService.embedBatch(texts);
const modelName = embeddingService.getModelName();
const dimensions = embeddingService.getDimensions();
```

## Interface Details

The standardized embedding service implements the `IEmbeddingService` interface, which includes:

### Core Methods

- `generateEmbedding(text: string): Promise<number[]>` - Generate embedding for text
- `calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number` - Calculate similarity between embeddings
- `findSimilarEmbeddings(queryEmbedding: number[], embeddingsWithMetadata: { embedding: number[]; metadata: any }[], limit?: number): { similarity: number; metadata: any }[]` - Find similar embeddings
- `combineEmbeddings(embeddings: number[][]): number[]` - Combine multiple embeddings

### Alternative Methods

- `embedText(text: string): Promise<number[]>` - Alternative to generateEmbedding
- `embedBatch(texts: string[]): Promise<number[][]>` - Generate embeddings for multiple texts
- `getModelName(): string` - Get the name of the embedding model
- `getDimensions(): number` - Get the dimensions of the embedding vectors
- `getCost(): number` - Get the cost per 1K tokens

## Testing

When writing tests, you can use the adapter directly or configure the factory:

```typescript
// Using the factory with test options
const testEmbeddingService = EmbeddingServiceFactory.getService({
  connector: mockOpenAIConnector,
  logger: mockLogger
});

// For mocking in tests
jest.mock('../../shared/services/embedding.factory');
(EmbeddingServiceFactory.getService as jest.Mock).mockReturnValue(mockEmbeddingService);
```

## Troubleshooting

### Missing Methods

If your code is using methods not included in the standardized interface, please update the interface in `src/shared/services/embedding.interface.ts` and both implementations (EmbeddingService and EmbeddingAdapter).

### Performance Considerations

The standard implementation includes automatic chunking for large texts, cosine similarity calculation, and other utilities. If you have specific performance needs, please consult with the team before creating custom implementations.

## Timeline

1. **Completed**: Migration to factory-based approach
2. **Upcoming**: Performance optimizations and caching
3. **Future**: Advanced configuration options and vector storage integration 