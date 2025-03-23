import type { Memory } from 'mem0ai';

import { mem0Client } from './mem0-client.ts';

/**
 * Upsert (i.e. add) a memory record.
 * For mem0, we simulate upsert by adding a new memory entry that contains the provided text,
 * metadata, and the embedding (included as part of the metadata).
 *
 * @param recordId Unique identifier for the memory (e.g., a user ID).
 * @param embedding A vector (e.g. 3072-dimensional) representing the text.
 * @param metadata Additional metadata for this memory.
 * @param text The raw text to store.
 */
export async function upsertMemoryRecord(
  recordId: string,
  embedding: number[],
  metadata: Record<string, string | number | boolean>,
  text: string,
): Promise<void> {
  // Use the mem0 client to add this record.
  // We include the embedding inside the metadata so that later we can try to query based on it.
  const result = await mem0Client.add(text, {
    user_id: recordId,
    metadata: {
      ...metadata,
      embedding, // embed the vector inside metadata
    },
  });
  console.log(`Record "${recordId}" upserted successfully:`, result);
}

/**
 * Query the memory store for similar records.
 * This function uses mem0Client.search.
 * (Note: mem0’s SearchOptions type does not define an 'embedding' field, so we cast our options as any.)
 *
 * @param queryEmbedding A vector representing the query.
 * @param topK Number of similar records to retrieve.
 * @returns An array of Memory records.
 */
export async function queryMemory(
  queryText: string,
  queryEmbedding: number[],
  topK: number = 3,
  userId: string,
): Promise<Memory[]> {
  // Here we call mem0Client.search with an empty query string and pass our embedding as a custom option.
  const results = await mem0Client.search(queryText, {
    top_k: topK,
    // This custom property may not be defined in the type definitions.
    user_id: userId,
    ...{ embedding: queryEmbedding },
  });
  console.log('Query results:', results);
  return results;
}
