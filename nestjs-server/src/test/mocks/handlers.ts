import { http, HttpResponse } from 'msw';

// Mock response for OpenAI embeddings API
const mockEmbeddingResponse = {
  data: [
    {
      embedding: Array(1536).fill(0.5),
      index: 0,
      object: 'embedding'
    }
  ],
  model: 'text-embedding-3-large',
  object: 'list',
  usage: {
    prompt_tokens: 10,
    total_tokens: 10
  }
};

// Mock response for OpenAI batch embeddings API
const mockBatchEmbeddingResponse = (inputCount: number) => ({
  data: Array(inputCount).fill(0).map((_, index) => ({
    embedding: Array(1536).fill(0.5),
    index,
    object: 'embedding'
  })),
  model: 'text-embedding-3-large',
  object: 'list',
  usage: {
    prompt_tokens: inputCount * 10,
    total_tokens: inputCount * 10
  }
});

// Mock response for OpenAI chat completion API
const mockChatCompletionResponse = {
  id: 'chatcmpl-mock-123',
  object: 'chat.completion',
  created: Date.now(),
  model: 'gpt-4o',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'This is a mock response from the OpenAI API.'
      },
      finish_reason: 'stop'
    }
  ],
  usage: {
    prompt_tokens: 20,
    completion_tokens: 10,
    total_tokens: 30
  }
};

// Type for OpenAI embedding request
interface OpenAIEmbeddingRequest {
  model: string;
  input: string | string[];
  encoding_format?: string;
  dimensions?: number;
  user?: string;
}

export const handlers = [
  // Intercept OpenAI embeddings API
  http.post('https://api.openai.com/v1/embeddings', async ({ request }) => {
    // Parse the request body
    const reqBody = await request.json() as OpenAIEmbeddingRequest;
    
    if (Array.isArray(reqBody.input)) {
      // Handle batch embedding request
      return HttpResponse.json(mockBatchEmbeddingResponse(reqBody.input.length));
    } else {
      // Handle single embedding request
      return HttpResponse.json(mockEmbeddingResponse);
    }
  }),
  
  // Intercept OpenAI chat completion API
  http.post('https://api.openai.com/v1/chat/completions', async () => {
    return HttpResponse.json(mockChatCompletionResponse);
  }),
  
  // You can add more handlers for other APIs as needed
]; 