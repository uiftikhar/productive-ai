# Pinecone RecordMetadata Migration Guide

## Overview

This document outlines the migration path for properly using the `RecordMetadata` type with Pinecone vector database operations. The migration ensures type safety and consistency across the application when working with vector metadata.

## Current Implementation

The `RecordMetadata` type is currently defined in `src/pinecone/pinecone.type.ts` and used throughout the application for vector operations with Pinecone. The type defines the structure for metadata that can be attached to vectors in the Pinecone database.

## Files Affected

1. **src/pinecone/pinecone.type.ts**
   - Contains the definition of `RecordMetadata` type
   - Defines related interfaces like `VectorRecord` which uses `RecordMetadata`

2. **src/pinecone/pinecone-connection.service.ts**
   - Uses `RecordMetadata` in methods like:
     - `upsertVectors`
     - `queryVectors`
     - `fetchVectors`
     - `deleteVectors`
     - `deleteVectorsByFilter`

3. **Various context services**
   - `src/shared/user-context/services/document-context.service.ts`
   - `src/shared/user-context/services/base-context.service.ts`
   - Other services that interact with Pinecone

## Migration Steps

### 1. Type Definition Standardization

Ensure that all `RecordMetadata` usage follows the correct type definition:

```typescript
// Current definition
export type RecordMetadata = Record<string, any>;

// Recommended updated definition with stricter typing
export type RecordMetadata = Record<string, string | number | boolean | string[] | number[]>;
```

### 2. Metadata Schema Validation

Add runtime validation for metadata to ensure it conforms to Pinecone's requirements:

```typescript
import { z } from 'zod';

// Define a Zod schema for validating metadata
export const MetadataSchema = z.record(
  z.string(),
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number())
  ])
);

// Validation helper function
export function validateMetadata(metadata: RecordMetadata): boolean {
  try {
    MetadataSchema.parse(metadata);
    return true;
  } catch (error) {
    return false;
  }
}
```

### 3. Update Service Methods

Update the `PineconeConnectionService` methods to use the new validation:

```typescript
async upsertVectors(
  indexName: string,
  vectors: VectorRecord[],
  namespace?: string
): Promise<void> {
  // Validate metadata for each vector
  vectors.forEach(vector => {
    if (vector.metadata && !validateMetadata(vector.metadata)) {
      throw new Error(`Invalid metadata format for vector ID: ${vector.id}`);
    }
  });
  
  // Rest of the method...
}
```

### 4. Type-Safe Query Filters

Implement type-safe query filters for metadata:

```typescript
// Define a type for metadata filters
export type MetadataFilter = {
  [key: string]: {
    $eq?: string | number | boolean;
    $ne?: string | number | boolean;
    $gt?: number;
    $gte?: number;
    $lt?: number;
    $lte?: number;
    $in?: Array<string | number>;
    $nin?: Array<string | number>;
  };
};

// Update queryVectors method to use typed filters
async queryVectors(
  indexName: string,
  queryVector: number[],
  options: QueryOptions & { filter?: MetadataFilter }
): Promise<QueryResponse> {
  // Method implementation...
}
```

## Best Practices

### 1. Strongly Typed Metadata

Define specific interfaces for different types of vector metadata instead of using the generic `RecordMetadata`:

```typescript
// Document metadata
export interface DocumentMetadata extends RecordMetadata {
  documentId: string;
  chunkIndex: number;
  contentType: string;
  createdAt: string;
  userId?: string;
}

// User profile metadata
export interface UserProfileMetadata extends RecordMetadata {
  userId: string;
  interestCategory: string;
  lastUpdated: string;
}
```

### 2. Consistent Access Patterns

Use consistent patterns when accessing and modifying metadata:

```typescript
// Helper function to create metadata
export function createDocumentMetadata(
  documentId: string,
  chunkIndex: number,
  contentType: string
): DocumentMetadata {
  return {
    documentId,
    chunkIndex,
    contentType,
    createdAt: new Date().toISOString()
  };
}

// Helper function to extract specific metadata type
export function isDocumentMetadata(
  metadata: RecordMetadata
): metadata is DocumentMetadata {
  return (
    'documentId' in metadata &&
    'chunkIndex' in metadata &&
    'contentType' in metadata
  );
}
```

### 3. Error Handling

Implement proper error handling for metadata operations:

```typescript
try {
  const results = await pineconeService.queryVectors(
    indexName,
    queryVector,
    {
      filter: { documentId: { $eq: 'doc123' } },
      topK: 10
    }
  );
  // Process results
} catch (error) {
  if (error.message.includes('Invalid metadata')) {
    // Handle metadata errors
    logger.error('Invalid metadata format in query', error);
  } else {
    // Handle other errors
    logger.error('Error querying vectors', error);
  }
}
```

## Testing Changes

1. **Unit Tests**: Update unit tests to verify metadata validation
2. **Integration Tests**: Create integration tests for Pinecone operations with different metadata
3. **Type Checking**: Run TypeScript compilation to ensure type safety

## Potential Issues

1. **Backward Compatibility**: The stricter typing may cause type errors in existing code
2. **Runtime Validation**: Added validation may impact performance for large batch operations
3. **Third-Party Dependencies**: Some third-party libraries may use incompatible metadata formats

## Next Steps

1. **Metadata Indexing Strategy**: Optimize which fields to index in Pinecone for query performance
2. **Caching Layer**: Implement a caching strategy for frequently accessed vectors
3. **Monitoring**: Add telemetry for tracking metadata usage patterns

## Reference

- [Pinecone Metadata Filtering Documentation](https://docs.pinecone.io/docs/metadata-filtering)
- [Pinecone TypeScript SDK](https://github.com/pinecone-io/pinecone-ts-client)

# RAG Service Consolidation Plan

## Current State Analysis

The codebase currently has multiple overlapping implementations of RAG (Retrieval Augmented Generation) functionality:

1. **MeetingRAGService** (`server/src/langgraph/agentic-meeting-analysis/services/meeting-rag.service.ts`)
   - Focused on transcript processing, chunking, embedding, and retrieval
   - Uses Pinecone for vector storage
   - Includes metrics tracking and reranking functionality
   - Relies on SemanticChunkingService for intelligent chunking

2. **RAGContextAgent** (`server/src/langgraph/agentic-meeting-analysis/agents/context/rag-context-agent.ts`)
   - An agent implementation that uses MeetingRAGService
   - Provides context-aware analysis capabilities
   - Formats retrieved context for LLM consumption
   - Implements agent interface methods

3. **ContextIntegrationAgent** (`server/src/langgraph/agentic-meeting-analysis/agents/context/context-integration-agent.ts`)
   - Uses RagPromptManager from shared services
   - Has more comprehensive context integration features
   - Includes organization context, initiative tracking, etc.
   - Also implements agent interface

4. **RagPromptManager** (`server/src/shared/services/rag-prompt-manager.service.ts`)
   - General-purpose RAG functionality
   - Supports multiple retrieval strategies
   - Includes template-based prompt management
   - Can track interactions for future retrieval

5. **SemanticChunkingService** (`server/src/langgraph/agentic-meeting-analysis/services/semantic-chunking.service.ts`)
   - Specialized in intelligent transcript chunking
   - Used by MeetingRAGService

## Consolidation Strategy

### 1. Core Services Layer

Create a unified RAG services layer with clear separation of concerns:

- **UnifiedRAGService**: A single entry point for all RAG operations
  - Combines the functionality of MeetingRAGService and RagPromptManager
  - Provides consistent interface for all agents and controllers
  - Eliminates duplicated code for vector operations

- **Advanced Chunking Service**:
  - Integrate SemanticChunkingService capabilities
  - Add support for more document types beyond transcripts
  - Maintain specialized transcript handling

- **Context Processing Pipeline**:
  - Extract context retrieval and processing from agents
  - Create reusable strategies for different types of context retrieval
  - Support cross-context queries (meetings, documents, etc.)

### 2. Agent Implementation Layer

- **ContextAwareAgent Base Class**:
  - Abstract base class for all context-aware agents
  - Common methods for context retrieval and processing
  - Standardize RAG integration patterns

- **Specialized Context Agents**:
  - RAGContextAgent for basic context integration
  - ContextIntegrationAgent for advanced features
  - Clear separation based on feature sets

### 3. Technical Implementation Steps

1. **Refactor MeetingRAGService**:
   - Extract core RAG functionality into UnifiedRAGService
   - Keep meeting-specific utilities as extension methods
   - Ensure backward compatibility for existing code

2. **Enhance RagPromptManager**:
   - Integrate with UnifiedRAGService
   - Deprecate overlapping methods
   - Add new methods for unified access

3. **Update Agent Implementations**:
   - Modify RAGContextAgent to use UnifiedRAGService
   - Update ContextIntegrationAgent to leverage the unified service
   - Ensure all changes maintain current functionality

4. **Standardize Configuration**:
   - Create consistent configuration objects
   - Support feature flags for enabling/disabling functionality
   - Share configuration between components

5. **Consolidate Pinecone Usage**:
   - Standardize index and namespace usage
   - Create migration tools for existing data
   - Implement clear patterns for multi-tenant usage

### 4. Improved Testing Strategy

- Create integration tests for the unified RAG pipeline
- Test with real meeting transcripts
- Verify vector embedding quality and retrieval accuracy
- Benchmark performance before and after consolidation

## Implementation Priorities

1. **Phase 1: Unify Core Services**
   - Create UnifiedRAGService
   - Migrate MeetingRAGService to use it
   - Update chunking service integration

2. **Phase 2: Update Agent Implementations**
   - Modify RAGContextAgent
   - Enhance ContextIntegrationAgent
   - Create common base class

3. **Phase 3: Optimize and Clean Up**
   - Remove duplicated code
   - Standardize error handling
   - Improve logging and metrics

4. **Phase 4: Documentation and Testing**
   - Document new architecture
   - Create usage examples
   - Comprehensive testing

## Architectural Benefits

- **Reduced Duplication**: Eliminate redundant implementations
- **Consistent Patterns**: Standardize RAG usage across the application
- **Better Separation of Concerns**: Clear responsibilities for each component
- **Easier Maintenance**: Less code to maintain, fewer places for bugs
- **Better Performance**: Shared connection pools and caching
- **Extensibility**: Easier to add new retrieval strategies or vector providers

## Detailed API Design

### UnifiedRAGService

```typescript
// Key methods
async processContent(content: any, metadata: ContentMetadata): Promise<number>;
async retrieveRelevantContext(query: string, options: RetrievalOptions): Promise<RetrievalResult[]>;
async generateContextAwarePrompt(query: string, promptTemplate: string, options: PromptOptions): Promise<PromptResult>;
```

### Context-Aware Agent Base Class

```typescript
// Key methods
protected async getRelevantContext(query: string, options?: object): Promise<ContextResult>;
protected async analyzeWithContext(query: string, context: ContextResult): Promise<AnalysisResult>;
protected formatContextForAnalysis(context: ContextResult): string;
```

## Timeline and Resources

- **Estimated Effort**: 2-3 weeks for full implementation
- **Key Stakeholders**: Meeting analysis team, RAG infrastructure team
- **Testing Requirements**: Comprehensive testing with real meeting data
- **Documentation**: Update all relevant documentation and examples

## Immediate Next Steps

1. Create UnifiedRAGService interface and implementation
2. Begin phased migration of MeetingRAGService
3. Update team on consolidation plan
4. Schedule detailed code reviews 