// process-final-summary.test.ts

import { processFinalSummary } from '../process-final-summary.ts';

const fakeFinalSummaryObject = {
  meetingTitle: 'Test Meeting Title',
  summary: 'Valid final summary',
  decisions: [
    {
      title: 'Decision 1',
      content:
        'Decision content with more than three sentences. Sentence one. Sentence two. Sentence three.',
    },
  ],
};
const fakeFinalSummaryString = JSON.stringify(fakeFinalSummaryObject);

describe('processFinalSummary', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the trimmed final summary if a valid response is returned', async () => {
    const fakeClient = {
      chat: {
        completions: {
          create: jest.fn(() => ({
            withResponse: () =>
              Promise.resolve({
                data: {
                  choices: [
                    { message: { content: `   ${fakeFinalSummaryString}   ` } },
                  ],
                },
                response: {
                  headers: new Map([['Content-Type', 'application/json']]),
                },
              }),
          })),
        },
      },
    };

    const combinedSummaries = 'Dummy combined summary text';
    const result = await processFinalSummary(
      combinedSummaries,
      fakeClient as any,
    );

    expect(result).toEqual(fakeFinalSummaryObject);
    expect(consoleLogSpy).toHaveBeenCalledWith('Final Summary Headers:', {
      'Content-Type': 'application/json',
    });
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'RESPONSE:\n',
      fakeFinalSummaryString,
    );
  });

  it('throws an error when the final summary is empty after trimming', async () => {
    const fakeClient = {
      chat: {
        completions: {
          create: jest.fn(() => ({
            withResponse: () =>
              Promise.resolve({
                data: {
                  choices: [
                    { message: { content: '    ' } }, // only whitespace
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

    const combinedSummaries = 'Some dummy text';
    await expect(
      processFinalSummary(combinedSummaries, fakeClient as any),
    ).rejects.toThrow('Received empty final summary');
  });

  it('throws an error when the message property is undefined', async () => {
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

    const combinedSummaries = 'Another dummy text';
    await expect(
      processFinalSummary(combinedSummaries, fakeClient as any),
    ).rejects.toThrow('Received empty final summary');
  });

  it('calls client.chat.completions.create with the correct parameters', async () => {
    type CreateArgs = {
      messages: { role: string; content: string }[];
      model: string;
      max_tokens: number;
      temperature: number;
    };

    const createSpy = jest.fn(() => ({
      withResponse: () =>
        Promise.resolve({
          data: {
            choices: [
              { message: { content: `   ${fakeFinalSummaryString}   ` } },
            ],
          },
          response: {
            headers: new Map([['Custom-Header', 'value']]),
          },
        }),
    }));

    const fakeClient = {
      chat: {
        completions: {
          create: createSpy,
        },
      },
    };

    const combinedSummaries = 'Combined summary content';
    const result = await processFinalSummary(
      combinedSummaries,
      fakeClient as any,
    );
    expect(result).toStrictEqual(fakeFinalSummaryObject);

    expect(createSpy).toHaveBeenCalledTimes(1);

    // Get the call arguments for create.
    const calls = createSpy.mock.calls as unknown as Array<[CreateArgs]>;
    expect(calls.length).toBeGreaterThan(0);

    const createArgs = calls[0][0];

    // Check the properties.
    expect(createArgs).toHaveProperty('messages');
    expect(Array.isArray(createArgs.messages)).toBe(true);
    expect(createArgs.messages[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.',
    });
    expect(createArgs).toHaveProperty('model', 'gpt-4');
    expect(createArgs).toHaveProperty('max_tokens', 1500);
    expect(createArgs).toHaveProperty('temperature', 0.2);

    // Verify that the final prompt contains the combinedSummaries wrapped in triple backticks under "Partial Summaries:".
    const expectedSubstring = `Partial Summaries:
\`\`\`
${combinedSummaries}
\`\`\``;
    expect(createArgs.messages[1].content).toContain(expectedSubstring);
  });
});
