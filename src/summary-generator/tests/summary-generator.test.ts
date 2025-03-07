// tests/summary-generator.test.ts

import OpenAI from 'openai';

import { generateSummary } from '../summary-generator.ts';

jest.mock('url', () => ({
  fileURLToPath: () => '/fake/path/index.js',
}));

// *********************************************************************************************************/

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

// Dummy transcript text for testing.
const dummyTranscript = 'Dummy transcript text for testing purposes';

const fakeTranscript = 'Fake transcript text';

// Mock fs.readFile so that generateSummary doesn't hit the file system.

// Spy on helper functions.
const splitTranscriptMock = jest.spyOn(
  require('../split-transcript.ts'),
  'splitTranscript',
) as unknown as jest.Mock<string[], [string, number?, number?]>;
splitTranscriptMock.mockImplementation(
  (transcript: string, maxTokens?: number, overlapLines?: number) => {
    return ['fake chunk 1', 'fake chunk 2'];
  },
);

const processAllChunksMock2 = jest.spyOn(
  require('../process-chunk.ts'),
  'processAllChunks',
) as unknown as jest.Mock<Promise<string[]>, [string[], OpenAI]>;
processAllChunksMock2.mockResolvedValue([
  'partial summary 1',
  'partial summary 2',
]);

const processFinalSummaryMock = jest.spyOn(
  require('../process-final-summary.ts'),
  'processFinalSummary',
) as unknown as jest.Mock<Promise<string>, [string, OpenAI]>;
processFinalSummaryMock.mockResolvedValue('Final summary text');

// Mock OpenAI so that no real API calls are made.
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  }));
});
describe('generateSummary', () => {
  const fakeTranscriptPath = '/fake/path/Transcript-CPL-BTO-Tech-Handover.txt';
  const { readFile: readFileMock } = require('fs/promises');
  beforeEach(() => {
    // Reset mocks between tests.
    readFileMock.mockReset();
  });
  it('should return the final summary text when everything succeeds', async () => {
    readFileMock.mockResolvedValue(fakeTranscript);

    const summary = await generateSummary();

    expect(summary).toBe('Final summary text');
    expect(readFileMock).toHaveBeenCalled();

    // Verify that splitTranscript was called correctly.
    expect(splitTranscriptMock).toHaveBeenCalledWith(fakeTranscript, 2000, 3);

    // Verify that processAllChunks was called with our fake chunks.
    expect(processAllChunksMock2).toHaveBeenCalledWith(
      ['fake chunk 1', 'fake chunk 2'],
      expect.any(Object),
    );

    // Verify that processFinalSummary was called with combined partial summaries.
    expect(processFinalSummaryMock).toHaveBeenCalledWith(
      'partial summary 1\n\npartial summary 2',
      expect.any(Object),
    );
  });

  it('should throw an error if reading the transcript fails', async () => {
    readFileMock.mockRejectedValue(new Error('File not found'));
    await expect(generateSummary()).rejects.toThrow('File not found');
  });
});
