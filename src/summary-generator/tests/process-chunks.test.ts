import OpenAI from 'openai';

import { processAllChunks } from '../process-chunk.ts';

jest.mock('p-limit', () => {
  return jest.fn(() => {
    return (fn: any) => fn();
  });
});

describe('processAllChunks: mocked', () => {
  const dummyProcessChunk = jest.fn(
    (chunk: string, index: number, client: OpenAI) =>
      Promise.resolve(`Processed chunk ${index + 1}: ${chunk}`),
  );

  const processAllChunksMock = jest.spyOn(
    require('../process-chunk.ts'),
    'processAllChunks',
  ) as unknown as jest.Mock<Promise<string[]>, [string[], OpenAI]>;
  processAllChunksMock.mockImplementation(
    async (chunks: string[], client: OpenAI) => {
      return Promise.all(
        chunks.map((chunk, index) => dummyProcessChunk(chunk, index, client)),
      );
    },
  );

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should process all chunks concurrently and return their summaries', async () => {
    const chunks = ['chunk one', 'chunk two', 'chunk three'];
    const fakeClient = {} as OpenAI;
    const summaries = await processAllChunks(chunks, fakeClient);
    expect(summaries).toEqual([
      'Processed chunk 1: chunk one',
      'Processed chunk 2: chunk two',
      'Processed chunk 3: chunk three',
    ]);
    expect(dummyProcessChunk).toHaveBeenCalledTimes(3);
  });
});

describe('processAllChunks: ActualData', () => {
  let processAllChunksActual: (
    chunks: string[],
    client: any,
  ) => Promise<string[]>;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    const mod = require('../process-chunk');
    processAllChunksActual = mod.processAllChunks;
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return valid summaries for each chunk and log headers', async () => {
    const fakeClient = {
      chat: {
        completions: {
          create: jest.fn(() => ({
            withResponse: () =>
              Promise.resolve({
                data: {
                  choices: [{ message: { content: ' Valid summary ' } }],
                },
                response: {
                  headers: new Map([['Content-Type', 'application/json']]),
                },
              }),
          })),
        },
      },
    };

    const chunks = ['chunk 1', 'chunk 2'];
    const summaries = await processAllChunksActual(chunks, fakeClient);
    expect(summaries).toEqual(['Valid summary', 'Valid summary']);

    expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    expect(consoleLogSpy).toHaveBeenNthCalledWith(1, 'Chunk 1 Headers:', {
      'Content-Type': 'application/json',
    });
    expect(consoleLogSpy).toHaveBeenNthCalledWith(2, 'Chunk 2 Headers:', {
      'Content-Type': 'application/json',
    });
  });

  it('should throw an error when the returned summary is empty (whitespace only)', async () => {
    const fakeClient = {
      chat: {
        completions: {
          create: jest.fn(() => ({
            withResponse: () =>
              Promise.resolve({
                data: {
                  choices: [
                    { message: { content: '    ' } }, // will trim to empty string
                  ],
                },
                response: {
                  headers: new Map(),
                },
              }),
          })),
        },
      },
    };

    const chunks = ['chunk 1'];
    await expect(processAllChunksActual(chunks, fakeClient)).rejects.toThrow(
      'Received empty summary for chunk 1',
    );
  });

  it('should throw an error when the message property is undefined', async () => {
    const fakeClient = {
      chat: {
        completions: {
          create: jest.fn(() => ({
            withResponse: () =>
              Promise.resolve({
                data: {
                  choices: [{ message: undefined }],
                },
                response: {
                  headers: new Map(),
                },
              }),
          })),
        },
      },
    };

    const chunks = ['chunk 1'];
    await expect(processAllChunksActual(chunks, fakeClient)).rejects.toThrow(
      'Received empty summary for chunk 1',
    );
  });
});
