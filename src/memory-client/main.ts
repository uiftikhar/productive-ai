import { computeEmbedding } from './compute-embedding';
import { queryMemory, upsertMemoryRecord } from './mem0-operations';

export async function main() {
  // Example text and metadata for upserting
  const text =
    'Apple Inc. is a leading tech company known for its innovative products.';
  const embedding = await computeEmbedding(text);

  // Upsert this memory record with a unique ID and some metadata
  await upsertMemoryRecord(
    'record-1',
    embedding,
    { category: 'tech', topic: 'Apple Inc.' },
    text,
  );

  // Query for similar memory records
  const queryText = 'Tell me about Apple and its innovations.';
  const queryEmbedding = await computeEmbedding(queryText);
  const results = await queryMemory(queryText, queryEmbedding, 3, 'record-1');

  console.log('Final query results:', results);
}
