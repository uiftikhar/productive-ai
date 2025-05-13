# Pinecone Filter Fix

## Issue Description

We encountered an error with Pinecone's query operation where it was rejecting requests with an empty filter object:

```
Error: You must enter a `filter` object with at least one key-value pair.
```

This occurred in several places in the codebase where we were using the `querySimilar` or `queryVectors` methods without ensuring that the filter object contained at least one key-value pair.

## Implementation Fix

Pinecone requires that all filter objects contain at least one key-value pair, even if you want to match all documents. We implemented the following fixes:

1. Updated the `RagPromptManager.retrieveUserContext()` method to ensure that all retrieval strategies (SEMANTIC, HYBRID, RECENCY, CUSTOM) include at least one filter condition.

2. Updated the `MeetingRAGService.createFilterObject()` method to always return a filter with at least one property.

3. When no specific filter is needed, we added a generic filter condition like `{ type: { $exists: true } }` or `{ chunkIndex: { $exists: true } }` which will match any document that has that field (which should be all documents in the index).

## Technical Details

### Pinecone Filter Requirement

Pinecone requires that filter objects always contain at least one key-value pair. This is different from some other vector databases that accept empty objects to indicate "match all documents."

### Fix Pattern

The pattern we implemented across the codebase is:

```typescript
// After creating the filter object
if (Object.keys(filter).length === 0) {
  // Add a default filter that will match all documents
  filter.someField = { $exists: true };
}
```

This ensures that we never send an empty filter object to Pinecone, while still maintaining the functionality of matching all documents when no specific filter is needed.

## Affected Services

- `RagPromptManager` in `server/src/shared/services/rag-prompt-manager.service.ts`
- `MeetingRAGService` in `server/src/langgraph/agentic-meeting-analysis/services/meeting-rag.service.ts`

## Testing

To test this fix, perform a meeting analysis which will trigger RAG queries and ensure no more filter-related errors appear in the logs. 