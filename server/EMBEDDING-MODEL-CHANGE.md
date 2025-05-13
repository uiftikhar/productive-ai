# Embedding Model Change

## Overview

This document outlines the changes made to the embedding model configuration to ensure compatibility between our OpenAI embeddings and Pinecone vector database.

## Changes Made

1. Updated the default embedding model in `LangChainConfig` from `text-embedding-3-large` to `llama-text-embed-v2`
2. Updated the Pinecone index configuration to use `llama-text-embed-v2` instead of `text-embedding-3-large`
3. Updated the dimension in Pinecone index configuration from 3072 to 4096 to match the `llama-text-embed-v2` model
4. Added `llama-text-embed-v2` to the supported embedding models in the `IndexConfig` interface
5. Created a fix script (`fix-dimensions.ts`) to handle dimension mismatches in existing indexes

## Reason for Change

Despite the Pinecone UI showing `text-embedding-3-large` as an available model, the API returned an error when attempting to use it:

```
[2025-05-13T10:59:48.466Z] [app] [ERROR] Failed to initialize user-context index {"error":"{\"error\":{\"code\":\"INVALID_ARGUMENT\",\"message\":\"Model text-embedding-3-large not found. Supported models: 'llama-text-embed-v2', 'multilingual-e5-large', 'pinecone-sparse-english-v0'\"},\"status\":400}"}
```

The error message indicated that only the following models are supported by the Pinecone API:
- `llama-text-embed-v2`
- `multilingual-e5-large`
- `pinecone-sparse-english-v0`

## Dimension Mismatch Issue

After updating the model configuration, we encountered dimension mismatches when upserting vectors:

```
Vector dimension 3072 does not match the dimension of the index 1024
```

This occurred because:
1. Existing Pinecone indexes were already created with 1024 dimensions (likely using `multilingual-e5-large`)
2. Our OpenAI connector was generating vectors with 3072 dimensions (from `text-embedding-3-large`)
3. The initialization code was trying to use 4096 dimensions (for `llama-text-embed-v2`)

### Fix Strategy

To resolve dimension mismatches, we created a `fix-dimensions.ts` script that:
1. Checks all existing indexes' dimensions
2. Identifies any dimension mismatches
3. When authorized (via `FORCE_DELETE_INDEXES=true`), deletes and recreates indexes with the correct dimensions
4. Logs detailed information about the indexes and their dimensions

## Impact

This change ensures that:

1. The embedding dimensions match between OpenAI and Pinecone (4096 dimensions)
2. Vector creation and retrieval work correctly across the system
3. All indexes are created successfully during initialization

## How to Use the Fix Script

Run the fix script to check and correct index dimensions:

```bash
# Check dimensions only (safe, no deletions)
npx ts-node server/src/pinecone/fix-dimensions.ts

# Check and fix dimensions (will delete and recreate indexes)
FORCE_DELETE_INDEXES=true npx ts-node server/src/pinecone/fix-dimensions.ts
```

**Warning**: Setting `FORCE_DELETE_INDEXES=true` will delete and recreate indexes that have dimension mismatches, which will delete all vectors stored in those indexes.

## Compatibility Note

`llama-text-embed-v2` is a high-quality embedding model that should provide similar or better performance compared to `text-embedding-3-large`. The main difference is the vector dimension (4096 vs 3072). 