import * as dotenv from 'dotenv';

import { Pinecone } from '@pinecone-database/pinecone';

dotenv.config();

// Initialize Pinecone client
const pc = new Pinecone({
  apiKey: process.env.PINECONE_CLIENT_API_KEY!,
});

// The index name you want to use
const indexName = process.env.PINECONE_INDEX_NAME || 'followup';
// Model to use for embeddings
const model = 'multilingual-e5-large';

// Create index if it doesn't already exist
async function createIndex() {
  const { indexes } = await pc.listIndexes();
  if (indexes && indexes.some((index) => index.name === indexName)) {
    console.log(`Index "${indexName}" already exists.`);
    return;
  }
  try {
    await pc.createIndex({
      name: indexName,
      dimension: 3072, // Must match your embedding model's dimension
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws', // adjust as needed
          region: 'us-east-1', // adjust as needed
        },
      },
    });
    console.log(`Index "${indexName}" created successfully.`);
  } catch (error: any) {
    if (error.response && error.response.data && error.response.data.error) {
      console.warn(`Index creation warning: ${error.response.data.error}`);
    } else {
      throw error;
    }
  }
}

// Generate embeddings using Pinecone Inference API
async function createVectorEmbeddings() {
  const data = [
    {
      id: 'vec1',
      text: 'Apple is a popular fruit known for its sweetness and crisp texture.',
    },
    {
      id: 'vec2',
      text: 'The tech company Apple is known for its innovative products like the iPhone.',
    },
    { id: 'vec3', text: 'Many people enjoy eating apples as a healthy snack.' },
    {
      id: 'vec4',
      text: 'Apple Inc. has revolutionized the tech industry with its sleek designs and user-friendly interfaces.',
    },
    {
      id: 'vec5',
      text: 'An apple a day keeps the doctor away, as the saying goes.',
    },
    {
      id: 'vec6',
      text: 'Apple Computer Company was founded on April 1, 1976, by Steve Jobs, Steve Wozniak, and Ronald Wayne as a partnership.',
    },
  ];

  // Generate embeddings from the text array.
  const embeddings = await pc.inference.embed(
    model,
    data.map((d) => d.text),
    { inputType: 'passage', truncate: 'END' },
  );

  // Log the first embedding vector (which is expected to be an object with a "values" property)
  console.log('Embedding for first item:', embeddings.data[0]);
}

// Upsert a vector into the index (using namespace 'ns1')
async function upsertData(
  id: string,
  vector: number[],
  metadata: Record<string, string | number | boolean>,
) {
  // Retrieve the index object
  const index = pc.Index(indexName);
  // Create an array of vector records; note that we pass the array directly.
  const records = [
    {
      id,
      values: vector,
      metadata,
    },
  ];
  // Upsert into a specific namespace, e.g., 'ns1'
  const response = await index.namespace('ns1').upsert(records);
  console.log('Upsert response:', response);
}

// Describe index stats
async function describeIndexStats() {
  const index = pc.Index(indexName);
  const stats = await index.describeIndexStats();
  console.log('Index stats:', stats);
}

// Query vector: note that we need to avoid naming collisions between the query function and the vector variable.
async function queryVector(queryEmbedding: number[], topK = 5) {
  const queryText = ['Tell me about the tech company known as Apple.'];
  const embeddingResponse = await pc.inference.embed(model, queryText, {
    inputType: 'query',
  });
  const index = pc.Index(indexName);

  // Basic query using the provided queryEmbedding
  // const payload = {
  //   topK,
  //   vector: queryEmbedding,
  //   includeMetadata: true,
  // };
  // const response = await index.query(payload);

  // Use the embedding from the embed API call for an alternative query.
  const firstEmbedding = embeddingResponse.data[0] as any;
  if (!('values' in firstEmbedding)) {
    throw new Error("Expected dense embedding with property 'values'");
  }
  const vectorValues: number[] = firstEmbedding.values;

  const queryResponse = await index.namespace('ns1').query({
    topK: 3,
    vector: vectorValues,
    includeValues: false,
    includeMetadata: true,
  });

  console.log('Query response:', queryResponse);
  // console.log('Response from basic query:', response);
  return queryResponse;
}

async function computeEmbedding(text: string): Promise<number[]> {
  // For testing, return a 1024-dimensional vector with a non-zero value.
  // Here we set the first element to 1 and the rest to 0.
  return new Array(3072).fill(0).map((_, i) => (i === 0 ? 1 : 0));
}

export async function runPineCone() {
  // Create the index (if it doesn't exist)
  // await createIndex();

  // Compute an embedding for some text
  const text = 'Hello from the AI memory system.';
  const vector = await computeEmbedding(text);

  // // Generate embeddings using Pinecone Inference (for sample data)
  await createVectorEmbeddings();

  // Upsert the vector with some metadata
  await upsertData('vector-1', vector, { content: text });

  // Describe the index stats
  await describeIndexStats();

  // Compute an embedding for a query text and run a similarity search
  // const queryText = 'Greetings from the memory store.';
  // const queryEmbedding = await computeEmbedding(queryText);
  // await queryVector(vector, 5);
}
