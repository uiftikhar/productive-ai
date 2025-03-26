import OpenAI from 'openai';
import { processFinalSummary } from '../process-final-summary-modular.ts';
import { PromptManager } from '../../shared/config/services/prompt-manager.service.ts';

// Mock the PromptManager
jest.mock('../../shared/config/services/prompt-manager.service.ts', () => ({
  PromptManager: {
    createPrompt: jest.fn(() => ({
      messages: [{ role: 'user', content: 'mocked prompt content' }],
    })),
  },
}));

describe('processFinalSummary', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock console.log to avoid cluttering test output
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleLogSpy.mockRestore();
  });

  it('should process combined summaries and return valid JSON response', async () => {
    // Mock data
    const combinedSummaries = 'Summary 1, Summary 2, Summary 3';
    const mockResponse = {
      summary: 'Final processed summary',
      key_points: ['Point 1', 'Point 2'],
    };

    // Mock OpenAI client
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockReturnValue({
            withResponse: () =>
              Promise.resolve({
                data: {
                  choices: [
                    {
                      message: {
                        content: JSON.stringify(mockResponse),
                      },
                    },
                  ],
                },
                response: {
                  headers: new Map([['Content-Type', 'application/json']]),
                },
              }),
          }),
        },
      },
    } as unknown as OpenAI;

    // Call the function
    const result = await processFinalSummary(combinedSummaries, mockClient);

    // Assertions
    expect(PromptManager.createPrompt).toHaveBeenCalledWith(
      'MEETING_CHUNK_SUMMARIZER',
      'FINAL_MEETING_SUMMARY',
      combinedSummaries,
    );

    expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
      messages: [{ role: 'user', content: 'mocked prompt content' }],
      model: 'gpt-4',
      max_tokens: 1500,
      temperature: 0.2,
    });

    expect(consoleLogSpy).toHaveBeenCalledWith('Final Summary Headers:', {
      'Content-Type': 'application/json',
    });

    expect(result).toEqual(mockResponse);
  });

  it('should throw an error when response is not valid JSON', async () => {
    // Mock data
    const combinedSummaries = 'Summary 1, Summary 2, Summary 3';

    // Mock OpenAI client with non-JSON response
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockReturnValue({
            withResponse: () =>
              Promise.resolve({
                data: {
                  choices: [
                    {
                      message: {
                        content: 'This is not JSON',
                      },
                    },
                  ],
                },
                response: {
                  headers: new Map([['Content-Type', 'application/json']]),
                },
              }),
          }),
        },
      },
    } as unknown as OpenAI;

    // Assertions
    await expect(
      processFinalSummary(combinedSummaries, mockClient),
    ).rejects.toThrow('Error generating and formatting the summary.');
  });

  it('should throw an error when response is empty', async () => {
    // Mock data
    const combinedSummaries = 'Summary 1, Summary 2, Summary 3';

    // Mock OpenAI client with empty response
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockReturnValue({
            withResponse: () =>
              Promise.resolve({
                data: {
                  choices: [
                    {
                      message: {
                        content: '   ', // This will trim to empty string
                      },
                    },
                  ],
                },
                response: {
                  headers: new Map([['Content-Type', 'application/json']]),
                },
              }),
          }),
        },
      },
    } as unknown as OpenAI;

    // Assertions
    await expect(
      processFinalSummary(combinedSummaries, mockClient),
    ).rejects.toThrow('Received empty final summary');
  });

  it('should throw an error when message content is undefined', async () => {
    // Mock data
    const combinedSummaries = 'Summary 1, Summary 2, Summary 3';

    // Mock OpenAI client with undefined content
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockReturnValue({
            withResponse: () =>
              Promise.resolve({
                data: {
                  choices: [
                    {
                      message: {
                        content: undefined,
                      },
                    },
                  ],
                },
                response: {
                  headers: new Map([['Content-Type', 'application/json']]),
                },
              }),
          }),
        },
      },
    } as unknown as OpenAI;

    // Assertions
    await expect(
      processFinalSummary(combinedSummaries, mockClient),
    ).rejects.toThrow('Received empty final summary');
  });
});
