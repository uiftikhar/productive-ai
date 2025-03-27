import OpenAI from 'openai';

import { generateSummary } from '../summary-generator-modular.ts';
import { SystemRole } from '../../shared/config/prompts/prompt-types.ts';
import { InstructionTemplateName } from '../../shared/config/prompts/instruction-templates.ts';

// All jest.mock calls need to be at the top level, before any other code
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

jest.mock('p-limit', () => {
  return jest.fn(() => {
    return (fn: any) => fn();
  });
});

// Define the OpenAI mock before using it
jest.mock('openai', () => {
  // Create a function that returns the mock structure we need
  const createMockOpenAI = () => ({
    chat: {
      completions: {
        create: jest.fn().mockReturnValue({
          withResponse: jest.fn().mockResolvedValue({
            data: {
              choices: [{ message: { content: 'Mocked response' } }],
            },
            response: {
              headers: new Map([['Content-Type', 'application/json']]),
            },
          }),
        }),
      },
    },
  });

  // Return a mock constructor that produces our mock
  const MockOpenAI = jest.fn().mockImplementation(createMockOpenAI);
  return { __esModule: true, default: MockOpenAI };
});

// Mock the prompt manager service to avoid dependency issues
jest.mock('../../shared/config/services/prompt-manager.service.ts', () => ({
  PromptManager: {
    createPrompt: jest.fn().mockReturnValue({
      messages: [
        { role: 'system', content: 'Mocked system message' },
        { role: 'user', content: 'Mocked user message' },
      ],
    }),
    getSystemMessage: jest.fn().mockReturnValue({
      role: 'system',
      content: 'Mocked system message',
    }),
  },
}));

// Mock dependencies
const fakeTranscript = 'Fake transcript text for testing';

const splitTranscriptMock = jest.spyOn(
  require('../../shared/utils/split-transcript.ts'),
  'splitTranscript',
) as unknown as jest.Mock<string[], [string, number?, number?]>;
splitTranscriptMock.mockImplementation(
  (transcript: string, maxTokens?: number, overlapLines?: number) => {
    return ['fake chunk 1', 'fake chunk 2'];
  },
);

// Update the mock to match the new function signature
const processAllChunksMock = jest.spyOn(
  require('../../shared/utils/process-chunk-modular.ts'),
  'processAllChunks',
) as unknown as jest.Mock<
  Promise<string[]>,
  [
    string[],
    OpenAI,
    SystemRole,
    InstructionTemplateName,
    string?,
    string?,
    number?,
    number?,
    any?,
  ]
>;
processAllChunksMock.mockResolvedValue([
  'partial summary 1',
  'partial summary 2',
]);

const processFinalSummaryMock = jest.spyOn(
  require('../../summary-generator/process-final-summary-modular.ts'),
  'processFinalSummary',
) as unknown as jest.Mock<Promise<string>, [string, OpenAI]>;
processFinalSummaryMock.mockResolvedValue('Final summary text');

// Get a reference to the mocked OpenAI constructor for assertions
const OpenAIConstructorMock = jest.fn() as unknown as jest.MockedClass<
  typeof OpenAI
>;

describe('generateSummary (modular version)', () => {
  let errorSpy: jest.SpyInstance<
    void,
    [message?: any, ...optionalParams: any[]]
  >;

  beforeAll(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    errorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return the final summary text when everything succeeds', async () => {
    const summary = await generateSummary(fakeTranscript);

    // Check the final result
    expect(summary).toBe('Final summary text');

    // Verify that splitTranscript was called with correct parameters
    expect(splitTranscriptMock).toHaveBeenCalledWith(fakeTranscript, 2000, 3);

    // Verify that processAllChunks was called with correct parameters
    expect(processAllChunksMock).toHaveBeenCalledWith(
      ['fake chunk 1', 'fake chunk 2'],
      expect.any(Object),
      'MEETING_CHUNK_SUMMARIZER',
      'MEETING_CHUNK_SUMMARY',
    );

    // Verify that processFinalSummary was called with correct parameters
    expect(processFinalSummaryMock).toHaveBeenCalledWith(
      'partial summary 1\n\npartial summary 2',
      expect.any(Object),
    );
  });

  it('should throw and log errors if anything fails', async () => {
    // Setup the mock to fail
    const testError = new Error('Test error');
    processAllChunksMock.mockRejectedValueOnce(testError);

    // Verify that the error is thrown
    await expect(generateSummary(fakeTranscript)).rejects.toThrow('Test error');

    // Verify error was logged
    expect(errorSpy).toHaveBeenCalledWith(
      'Error in generateSummary:',
      testError,
    );
  });

  it('should correctly handle empty transcripts', async () => {
    const emptyTranscript = '';

    // Mock splitTranscript to return empty array for empty input
    splitTranscriptMock.mockReturnValueOnce([]);

    // Mock processAllChunks to return empty array for empty chunks
    processAllChunksMock.mockResolvedValueOnce([]);

    // Mock processFinalSummary to handle empty combined summaries
    processFinalSummaryMock.mockResolvedValueOnce('No content to summarize');

    const result = await generateSummary(emptyTranscript);

    expect(result).toBe('No content to summarize');
    expect(processAllChunksMock).toHaveBeenCalledWith(
      [],
      expect.any(Object),
      'MEETING_CHUNK_SUMMARIZER',
      'MEETING_CHUNK_SUMMARY',
    );
  });

  it('should use the correct OpenAI client with API key from environment', async () => {
    // Store original env variable
    const originalEnv = process.env.OPENAI_API_KEY;

    // Set test env variable
    process.env.OPENAI_API_KEY = 'test-api-key';

    // Clear existing mocks
    jest.clearAllMocks();

    // Get a reference to the actual OpenAI constructor mock implementation
    const MockOpenAI = require('openai').default;

    // Act - call the function that should use the OpenAI constructor
    await generateSummary(fakeTranscript);

    // Assert - check the OpenAI constructor was called with the API key
    expect(MockOpenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
    });

    // Restore original env
    process.env.OPENAI_API_KEY = originalEnv;
  });

  // Integration-style tests that verify module interactions
  describe('generateSummary integration scenarios', () => {
    // Override the mocks to use realistic implementations
    beforeEach(() => {
      // Reset all mocks
      jest.clearAllMocks();

      // Create a more realistic implementation that doesn't rely on external modules
      processAllChunksMock.mockImplementation(async (chunks) => {
        return chunks.map((chunk) => `Summary of: ${chunk}`);
      });

      // Mock processFinalSummary to completely bypass the actual implementation
      // Instead of letting it try to parse JSON, just return a formatted string directly
      processFinalSummaryMock.mockImplementation(async () => {
        return 'Final summary containing: 2 partial summaries';
      });

      splitTranscriptMock.mockReturnValue(['chunk 1 text', 'chunk 2 text']);
    });

    // This test verifies the expected flow of data through the system
    it('should correctly process data through the entire flow', async () => {
      // Act
      const result = await generateSummary('Some transcript text');

      // Assert - just check that we got the expected return value
      expect(result).toBe('Final summary containing: 2 partial summaries');

      // Verify that the mocks were called in the expected sequence with right parameters
      expect(splitTranscriptMock).toHaveBeenCalledWith(
        'Some transcript text',
        2000,
        3,
      );

      expect(processAllChunksMock).toHaveBeenCalledWith(
        ['chunk 1 text', 'chunk 2 text'],
        expect.any(Object),
        'MEETING_CHUNK_SUMMARIZER',
        'MEETING_CHUNK_SUMMARY',
      );

      // Verify processFinalSummary was called
      expect(processFinalSummaryMock).toHaveBeenCalled();
    });
  });
});
