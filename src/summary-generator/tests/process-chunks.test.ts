import OpenAI from 'openai';

import { processAllChunks } from '../process-chunk.ts';

describe('processAllChunks', () => {
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
