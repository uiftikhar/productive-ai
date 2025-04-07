import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const openAiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export async function computeEmbedding(text: string): Promise<number[]> {
  // For testing, create a dummy 3072-dimensional vector.
  // In production, replace this with a call to your actual embedding model (e.g., OpenAI embeddings)
  const dimension = 3072;
  const embeddings = await openAiClient.embeddings.create({
    model: 'text-embedding-3-large',
    input: text,
    encoding_format: 'float',
  });

  return embeddings.data[0].embedding;
}
