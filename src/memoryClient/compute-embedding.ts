export async function computeEmbedding(text: string): Promise<number[]> {
  // For testing, create a dummy 3072-dimensional vector.
  // In production, replace this with a call to your actual embedding model (e.g., OpenAI embeddings)
  const dimension = 3072;
  return new Array(dimension).fill(0).map((_, i) => (i === 0 ? 1 : 0));
}
