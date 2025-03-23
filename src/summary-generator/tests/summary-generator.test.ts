import OpenAI from 'openai';

import { generateSummary } from '../summary-generator.ts';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

jest.mock('p-limit', () => {
  return jest.fn(() => {
    return (fn: any) => fn();
  });
});

const dummyTranscript = 'Dummy transcript text for testing purposes';

const fakeTranscript = 'Fake transcript text';

const splitTranscriptMock = jest.spyOn(
  require('../../shared/utils/split-transcript.ts'),
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
  let errorSpy: jest.SpyInstance<
    void,
    [message?: any, ...optionalParams: any[]]
  >;

  beforeAll(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    errorSpy.mockRestore();
  });

  it('should return the final summary text when everything succeeds', async () => {
    const summary = await generateSummary(fakeTranscript);

    expect(summary).toBe('Final summary text');

    expect(splitTranscriptMock).toHaveBeenCalledWith(fakeTranscript, 2000, 3);

    expect(processAllChunksMock2).toHaveBeenCalledWith(
      ['fake chunk 1', 'fake chunk 2'],
      expect.any(Object),
    );

    expect(processFinalSummaryMock).toHaveBeenCalledWith(
      'partial summary 1\n\npartial summary 2',
      expect.any(Object),
    );
  });
});
