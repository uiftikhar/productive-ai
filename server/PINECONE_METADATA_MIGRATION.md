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