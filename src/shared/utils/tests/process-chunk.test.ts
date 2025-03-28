import OpenAI from 'openai';
import pLimit from 'p-limit';
import { PromptManager } from '../../config/services/prompt-manager.service.ts';
import { processAllChunks } from '../process-chunk.ts';
// Mock dependencies
jest.mock('p-limit', () => {
  return jest.fn(() => {
    return (fn: any) => fn();
  });
});

jest.mock('../../config/services/prompt-manager.service', () => ({
  PromptManager: {
    createPrompt: jest.fn(() => ({
      messages: [
        { role: 'system', content: 'mocked system content' },
        { role: 'user', content: 'mocked user content' }
      ]
    }))
  }
}));

describe('processAllChunks', () => {
  let consoleLogSpy: jest.SpyInstance;
  // Use type assertions for the role and template
  const ROLE = 'MEETING_CHUNK_SUMMARIZER' as any;
  const TEMPLATE = 'SUMMARIZE_TRANSCRIPT' as any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  
  afterEach(() => {
    jest.clearAllMocks();
    consoleLogSpy.mockRestore();
  });

  it('should process all chunks concurrently with default parameters', async () => {
    // Mock data
    const chunks = ['chunk 1', 'chunk 2', 'chunk 3'];
    const mockResponse = 'Processed chunk summary';
    
    // Mock OpenAI client
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockReturnValue({
            withResponse: () => Promise.resolve({
              data: {
                choices: [{ message: { content: mockResponse } }]
              },
              response: {
                headers: new Map([['Content-Type', 'application/json']])
              }
            })
          })
        }
      }
    } as unknown as OpenAI;
    
    // Call the function
    const results = await processAllChunks(
      chunks, 
      mockClient, 
      ROLE,
      TEMPLATE
    );
    
    // Assertions
    expect(pLimit).toHaveBeenCalledWith(5);
    expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(3);
    expect(PromptManager.createPrompt).toHaveBeenCalledTimes(3);
    
    // Verify each prompt creation
    expect(PromptManager.createPrompt).toHaveBeenNthCalledWith(
      1,
      'MEETING_CHUNK_SUMMARIZER',
      'SUMMARIZE_TRANSCRIPT',
      'chunk 1',
      undefined
    );
    
    // Verify each API call
    expect(mockClient.chat.completions.create).toHaveBeenNthCalledWith(1, {
      messages: [
        { role: 'system', content: 'mocked system content' },
        { role: 'user', content: 'mocked user content' }
      ],
      model: 'gpt-4',
      max_tokens: 700,
      temperature: 0
    });
    
    // Verify logs
    expect(consoleLogSpy).toHaveBeenCalledTimes(3);
    expect(consoleLogSpy).toHaveBeenNthCalledWith(1, 'Chunk 1 Headers:', {
      'Content-Type': 'application/json'
    });
    
    // Verify results
    expect(results).toEqual([
      mockResponse,
      mockResponse,
      mockResponse
    ]);
  });

  it('should process all chunks with custom parameters', async () => {
    // Mock data
    const chunks = ['chunk 1', 'chunk 2'];
    const mockResponse = 'Custom processed chunk summary';
    const userContext = 'Some user context';
    const customModel = 'gpt-3.5-turbo';
    const customMaxTokens = 1000;
    const customTemperature = 0.5;
    const otherParams = { frequency_penalty: 0.7 };
    
    // Mock OpenAI client
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockReturnValue({
            withResponse: () => Promise.resolve({
              data: {
                choices: [{ message: { content: mockResponse } }]
              },
              response: {
                headers: new Map([['X-RateLimit-Remaining', '120']])
              }
            })
          })
        }
      }
    } as unknown as OpenAI;
    
    // Call the function with custom parameters
    const results = await processAllChunks(
      chunks,
      mockClient,
      ROLE,
      TEMPLATE,
      userContext,
      customModel,
      customMaxTokens,
      customTemperature,
      otherParams
    );
    
    // Assertions
    expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(2);
    
    // Verify prompt creation with user context
    expect(PromptManager.createPrompt).toHaveBeenNthCalledWith(
      1,
      'MEETING_CHUNK_SUMMARIZER',
      'SUMMARIZE_TRANSCRIPT',
      'chunk 1',
      userContext
    );
    
    // Verify API call with custom parameters
    expect(mockClient.chat.completions.create).toHaveBeenNthCalledWith(1, {
      messages: [
        { role: 'system', content: 'mocked system content' },
        { role: 'user', content: 'mocked user content' }
      ],
      model: customModel,
      max_tokens: customMaxTokens,
      temperature: customTemperature,
      frequency_penalty: 0.7
    });
    
    // Verify results
    expect(results).toEqual([
      mockResponse,
      mockResponse
    ]);
  });

  it('should throw an error when chunk processing fails', async () => {
    // Mock data
    const chunks = ['chunk 1'];
    
    // Mock OpenAI client with empty response
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockReturnValue({
            withResponse: () => Promise.resolve({
              data: {
                choices: [{ message: { content: '   ' } }] // This will trim to empty string
              },
              response: {
                headers: new Map()
              }
            })
          })
        }
      }
    } as unknown as OpenAI;
    
    // Assertions
    await expect(
      processAllChunks(chunks, mockClient, ROLE, TEMPLATE)
    ).rejects.toThrow('Received empty summary for chunk 1');
  });

  it('should throw an error when message content is undefined', async () => {
    // Mock data
    const chunks = ['chunk 1'];
    
    // Mock OpenAI client with undefined content
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockReturnValue({
            withResponse: () => Promise.resolve({
              data: {
                choices: [{ message: { content: undefined } }]
              },
              response: {
                headers: new Map()
              }
            })
          })
        }
      }
    } as unknown as OpenAI;
    
    // Assertions
    await expect(
      processAllChunks(chunks, mockClient, ROLE, TEMPLATE)
    ).rejects.toThrow('Received empty summary for chunk 1');
  });

  it('should handle API errors properly', async () => {
    // Mock data
    const chunks = ['chunk 1'];
    const errorMessage = 'API rate limit exceeded';
    
    // Mock OpenAI client that throws an error
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockReturnValue({
            withResponse: () => Promise.reject(new Error(errorMessage))
          })
        }
      }
    } as unknown as OpenAI;
    
    // Assertions
    await expect(
      processAllChunks(chunks, mockClient, ROLE, TEMPLATE)
    ).rejects.toThrow(errorMessage);
  });
});


