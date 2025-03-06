import OpenAI from 'openai';

import { processChunk } from '../process-chunk.ts';

// tests/summarizer.test.ts

// Create a fake Headers object (as returned by response.headers.entries())
function createFakeHeaders(headersObj: Record<string, string>): Headers {
  return new Map(Object.entries(headersObj)) as unknown as Headers;
}

// Create a fake response structure for withResponse()
function createFakeResponse(summaryText: string | null): any {
  return {
    data: {
      choices: [
        {
          message: {
            content: summaryText,
          },
        },
      ],
    },
    response: {
      headers: createFakeHeaders({
        'x-ratelimit-limit-tokens': '10000',
        'x-ratelimit-remaining-tokens': '5000',
      }),
    },
  };
}

// Create a fake OpenAI client with a chat.completions.create method that returns an object with a withResponse() function.
const fakeClient = {
  chat: {
    completions: {
      create: (_: any) => {
        return {
          withResponse: async () => createFakeResponse('Test summary for chunk.'),
        };
      },
    },
  },
} as unknown as OpenAI;

describe('processChunk', () => {
  const testChunk = "Speaker A: Let's discuss the project roadmap.\nSpeaker B: I have concerns about the timeline.";

  it('should return a summary when a valid summary is provided', async () => {
    const summary = await processChunk(testChunk, 0, fakeClient);
    expect(summary).toBe('Test summary for chunk.');
  });

  it('should throw an error when an empty summary is returned', async () => {
    // Override the fake client to return empty summary
    const fakeClientEmpty = {
      chat: {
        completions: {
          create: (_: any) => {
            return {
              withResponse: async () => createFakeResponse(null),
            };
          },
        },
      },
    } as unknown as OpenAI;

    await expect(processChunk(testChunk, 0, fakeClientEmpty))
      .rejects
      .toThrow('Received empty summary for chunk 1');
  });
});
