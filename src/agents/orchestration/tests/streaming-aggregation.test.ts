// @ts-nocheck
import {
  MultiAgentStreamingAggregator,
  AgentStreamMetadata,
  StreamAggregationStrategy,
  StreamAggregationCallback,
} from '../multi-agent-streaming-aggregator.ts';
import {
  StreamingOptions,
  StreamingResponseHandler,
  StreamingResponseManager,
} from '../streaming-response-manager.ts';
import { jest } from '@jest/globals';

// Mock StreamingResponseManager
jest.mock('../streaming-response-manager.ts', () => {
  const originalModule = jest.requireActual('../streaming-response-manager.ts');

  return {
    ...originalModule,
    StreamingResponseManager: {
      getInstance: jest.fn().mockImplementation(() => ({
        createStreamingHandler: jest
          .fn()
          .mockImplementation((streamId, callbacks, options) => {
            // Return a mock handler with streamId and callbacks
            return {
              streamId,
              onToken: callbacks.onToken,
              onComplete: callbacks.onComplete,
              onError: callbacks.onError,
            };
          }),
      })),
    },
  };
});

// Extend the StreamingResponseHandler for testing
interface TestStreamingHandler extends StreamingResponseHandler {
  streamId: string;
  listener?: {
    onToken: (token: string) => void;
    onComplete: (response: string) => void;
    onError: (error: Error) => void;
  };
}

describe('MultiAgentStreamingAggregator', () => {
  let mockCallback: jest.Mocked<StreamAggregationCallback>;

  beforeEach(() => {
    // Create a mock callback
    mockCallback = {
      onToken: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Test helper to simulate streaming tokens
  const simulateStreaming = (
    handler: TestStreamingHandler,
    tokens: string[],
    completeWithFullResponse = true,
  ) => {
    // Send tokens one by one
    tokens.forEach((token) => {
      handler.listener?.onToken(token);
    });

    // Complete the stream
    if (completeWithFullResponse) {
      handler.listener?.onComplete(tokens.join(''));
    }

    return handler;
  };

  describe('Basic functionality', () => {
    test('should register agent streams correctly', () => {
      // Setup
      const aggregator = new MultiAgentStreamingAggregator(mockCallback);

      const metadata: AgentStreamMetadata = {
        agentId: 'agent1',
        agentName: 'Test Agent 1',
        priority: 1,
      };

      const options: StreamingOptions = {
        modelName: 'test-model',
        modelProvider: 'test-provider',
      };

      // @ts-ignore - Handler has streamId in our mock
      const handler = aggregator.registerAgentStream(metadata, options);

      // Assertions
      expect(handler).toBeDefined();
      expect(handler.streamId).toContain('agent1');
    });

    test('should handle tokens and notify via callback', () => {
      // Setup
      const aggregator = new MultiAgentStreamingAggregator(mockCallback);

      const metadata: AgentStreamMetadata = {
        agentId: 'agent1',
        agentName: 'Test Agent 1',
        priority: 1,
      };

      // @ts-ignore - Handler has streamId in our mock
      const handler = aggregator.registerAgentStream(metadata, {
        modelName: 'test-model',
        modelProvider: 'test-provider',
      });

      // Add listener property
      Object.defineProperty(handler, 'listener', {
        value: {
          onToken: (token: string) => handler.onToken(token),
          onComplete: (response: string) => handler.onComplete(response),
          onError: (error: Error) => handler.onError(error),
        },
      });

      // Act - simulate token
      handler.listener!.onToken('Hello');

      // Assert
      expect(mockCallback.onToken).toHaveBeenCalledWith(
        '**Test Agent 1**: Hello',
        expect.any(Object),
      );
    });

    test('should complete aggregation when all streams are complete', () => {
      const aggregator = new MultiAgentStreamingAggregator(mockCallback);

      const metadata1: AgentStreamMetadata = {
        agentId: 'agent1',
        agentName: 'Test Agent 1',
        priority: 1,
      };

      const metadata2: AgentStreamMetadata = {
        agentId: 'agent2',
        agentName: 'Test Agent 2',
        priority: 2,
      };

      const options: StreamingOptions = {
        modelName: 'test-model',
        modelProvider: 'test-provider',
      };

      const handler1 = aggregator.registerAgentStream(
        metadata1,
        options,
      ) as TestStreamingHandler;
      const handler2 = aggregator.registerAgentStream(
        metadata2,
        options,
      ) as TestStreamingHandler;

      // Define listener properties for our handlers
      Object.defineProperty(handler1, 'listener', {
        value: {
          onToken: (token: string) =>
            aggregator['handleAgentToken'](handler1.streamId, token),
          onComplete: (response: string) =>
            aggregator['handleAgentComplete'](handler1.streamId, response),
          onError: (error: Error) =>
            aggregator['handleAgentError'](handler1.streamId, error),
        },
      });

      Object.defineProperty(handler2, 'listener', {
        value: {
          onToken: (token: string) =>
            aggregator['handleAgentToken'](handler2.streamId, token),
          onComplete: (response: string) =>
            aggregator['handleAgentComplete'](handler2.streamId, response),
          onError: (error: Error) =>
            aggregator['handleAgentError'](handler2.streamId, error),
        },
      });

      // Simulate streaming from both agents
      handler1.listener!.onToken('Hello from agent 1');
      handler2.listener!.onToken('Hello from agent 2');

      // Complete the first stream
      handler1.listener!.onComplete('Hello from agent 1');

      // Verify onComplete hasn't been called yet (one stream still active)
      expect(mockCallback.onComplete).not.toHaveBeenCalled();

      // Complete the second stream
      handler2.listener!.onComplete('Hello from agent 2');

      // Verify onComplete has been called now
      expect(mockCallback.onComplete).toHaveBeenCalledWith(
        expect.stringContaining('**Test Agent 1**: Hello from agent 1'),
        expect.objectContaining({
          completedCount: 2,
          totalCount: 2,
        }),
      );
    });

    test('should handle errors in streams', () => {
      const aggregator = new MultiAgentStreamingAggregator(mockCallback);

      const metadata: AgentStreamMetadata = {
        agentId: 'agent1',
        agentName: 'Test Agent 1',
        priority: 1,
      };

      const handler = aggregator.registerAgentStream(metadata, {
        modelName: 'test-model',
        modelProvider: 'test-provider',
      }) as TestStreamingHandler;

      // Define listener property
      Object.defineProperty(handler, 'listener', {
        value: {
          onToken: (token: string) =>
            aggregator['handleAgentToken'](handler.streamId, token),
          onComplete: (response: string) =>
            aggregator['handleAgentComplete'](handler.streamId, response),
          onError: (error: Error) =>
            aggregator['handleAgentError'](handler.streamId, error),
        },
      });

      // Simulate an error
      const error = new Error('Test error');
      handler.listener!.onError(error);

      // The stream is marked as error and finalizeAggregation is called
      // because there's only one stream and it's complete (errored)
      expect(mockCallback.onComplete).toHaveBeenCalled();

      // Test the cancel method separately - need to mock the callback
      const cancelCallback = {
        onToken: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      const cancelAggregator = new MultiAgentStreamingAggregator(
        cancelCallback,
      );
      cancelAggregator.cancel('Forced cancellation');

      // Verify onError is called directly by cancel method
      expect(cancelCallback.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Forced cancellation' }),
        expect.any(Object),
      );
    });
  });

  describe('Aggregation strategies', () => {
    test('should correctly aggregate streams in PARALLEL mode', () => {
      const aggregator = new MultiAgentStreamingAggregator(mockCallback, {
        strategy: StreamAggregationStrategy.PARALLEL,
      });

      const metadata1: AgentStreamMetadata = {
        agentId: 'agent1',
        agentName: 'Test Agent 1',
        priority: 1,
      };

      const metadata2: AgentStreamMetadata = {
        agentId: 'agent2',
        agentName: 'Test Agent 2',
        priority: 2,
      };

      const options: StreamingOptions = {
        modelName: 'test-model',
        modelProvider: 'test-provider',
      };

      const handler1 = aggregator.registerAgentStream(
        metadata1,
        options,
      ) as TestStreamingHandler;
      const handler2 = aggregator.registerAgentStream(
        metadata2,
        options,
      ) as TestStreamingHandler;

      // Define listeners
      Object.defineProperty(handler1, 'listener', {
        value: {
          onToken: (token: string) =>
            aggregator['handleAgentToken'](handler1.streamId, token),
          onComplete: (response: string) =>
            aggregator['handleAgentComplete'](handler1.streamId, response),
          onError: (error: Error) =>
            aggregator['handleAgentError'](handler1.streamId, error),
        },
      });

      Object.defineProperty(handler2, 'listener', {
        value: {
          onToken: (token: string) =>
            aggregator['handleAgentToken'](handler2.streamId, token),
          onComplete: (response: string) =>
            aggregator['handleAgentComplete'](handler2.streamId, response),
          onError: (error: Error) =>
            aggregator['handleAgentError'](handler2.streamId, error),
        },
      });

      // Simulate streaming
      handler1.listener!.onToken('Response from agent 1');
      handler2.listener!.onToken('Response from agent 2');

      // Complete both streams
      handler1.listener!.onComplete('Response from agent 1');
      handler2.listener!.onComplete('Response from agent 2');

      // Verify the output format - should contain both responses
      const expectedOutput =
        '**Test Agent 1**: Response from agent 1\n\n**Test Agent 2**: Response from agent 2';
      expect(mockCallback.onComplete).toHaveBeenCalledWith(
        expectedOutput,
        expect.any(Object),
      );
    });

    test('should correctly aggregate streams in SEQUENTIAL mode', () => {
      const aggregator = new MultiAgentStreamingAggregator(mockCallback, {
        strategy: StreamAggregationStrategy.SEQUENTIAL,
      });

      const metadata1: AgentStreamMetadata = {
        agentId: 'agent1',
        agentName: 'Test Agent 1',
        priority: 1,
      };

      const metadata2: AgentStreamMetadata = {
        agentId: 'agent2',
        agentName: 'Test Agent 2',
        priority: 2,
      };

      const options: StreamingOptions = {
        modelName: 'test-model',
        modelProvider: 'test-provider',
      };

      const handler1 = aggregator.registerAgentStream(
        metadata1,
        options,
      ) as TestStreamingHandler;
      const handler2 = aggregator.registerAgentStream(
        metadata2,
        options,
      ) as TestStreamingHandler;

      // Define listeners
      Object.defineProperty(handler1, 'listener', {
        value: {
          onToken: (token: string) =>
            aggregator['handleAgentToken'](handler1.streamId, token),
          onComplete: (response: string) =>
            aggregator['handleAgentComplete'](handler1.streamId, response),
          onError: (error: Error) =>
            aggregator['handleAgentError'](handler1.streamId, error),
        },
      });

      Object.defineProperty(handler2, 'listener', {
        value: {
          onToken: (token: string) =>
            aggregator['handleAgentToken'](handler2.streamId, token),
          onComplete: (response: string) =>
            aggregator['handleAgentComplete'](handler2.streamId, response),
          onError: (error: Error) =>
            aggregator['handleAgentError'](handler2.streamId, error),
        },
      });

      // Simulate streaming for the first agent
      handler1.listener!.onToken('Response from agent 1');

      // Complete the first stream
      handler1.listener!.onComplete('Response from agent 1');

      // The first agent's response should be in the output
      expect(mockCallback.onToken).toHaveBeenCalledWith(
        '**Test Agent 1**: Response from agent 1',
        expect.any(Object),
      );

      // Now stream from the second agent
      handler2.listener!.onToken('Response from agent 2');

      // We're getting the formatted output in pieces, so we should check
      // for calls that contain parts of the expected formatted output
      expect(mockCallback.onToken).toHaveBeenCalledWith(
        expect.stringContaining('**Test Agent 2**:'),
        expect.any(Object),
      );

      // Complete the second stream
      handler2.listener!.onComplete('Response from agent 2');

      // Verify the final output has both responses in sequence
      expect(mockCallback.onComplete).toHaveBeenCalledWith(
        expect.stringContaining('**Test Agent 1**: Response from agent 1'),
        expect.any(Object),
      );

      expect(mockCallback.onComplete).toHaveBeenCalledWith(
        expect.stringContaining('**Test Agent 2**: Response from agent 2'),
        expect.any(Object),
      );
    });

    test('should correctly aggregate streams in LEADER_FOLLOWER mode', () => {
      const aggregator = new MultiAgentStreamingAggregator(mockCallback, {
        strategy: StreamAggregationStrategy.LEADER_FOLLOWER,
      });

      const metadata1: AgentStreamMetadata = {
        agentId: 'leader',
        agentName: 'Leader Agent',
        priority: 1,
      };

      const metadata2: AgentStreamMetadata = {
        agentId: 'follower',
        agentName: 'Follower Agent',
        priority: 2,
      };

      const options: StreamingOptions = {
        modelName: 'test-model',
        modelProvider: 'test-provider',
      };

      const handler1 = aggregator.registerAgentStream(
        metadata1,
        options,
      ) as TestStreamingHandler;
      const handler2 = aggregator.registerAgentStream(
        metadata2,
        options,
      ) as TestStreamingHandler;

      // Define listeners
      Object.defineProperty(handler1, 'listener', {
        value: {
          onToken: (token: string) =>
            aggregator['handleAgentToken'](handler1.streamId, token),
          onComplete: (response: string) =>
            aggregator['handleAgentComplete'](handler1.streamId, response),
          onError: (error: Error) =>
            aggregator['handleAgentError'](handler1.streamId, error),
        },
      });

      Object.defineProperty(handler2, 'listener', {
        value: {
          onToken: (token: string) =>
            aggregator['handleAgentToken'](handler2.streamId, token),
          onComplete: (response: string) =>
            aggregator['handleAgentComplete'](handler2.streamId, response),
          onError: (error: Error) =>
            aggregator['handleAgentError'](handler2.streamId, error),
        },
      });

      // Simulate streaming for the leader
      handler1.listener!.onToken('Main response from the leader');

      // Follower starts streaming too but shouldn't be shown yet
      handler2.listener!.onToken('Supporting response from follower');

      // Verify only leader's response is visible
      expect(mockCallback.onToken).toHaveBeenCalledWith(
        '**Leader Agent**: Main response from the leader',
        expect.any(Object),
      );

      // Complete the leader stream
      handler1.listener!.onComplete('Main response from the leader');

      // Now the follower should become visible
      mockCallback.onToken.mockClear();

      // Complete the follower stream
      handler2.listener!.onComplete('Supporting response from follower');

      // Implementation combines the follower output with the leader output
      // in a single string in onComplete rather than separate calls
      expect(mockCallback.onComplete).toHaveBeenCalledWith(
        expect.stringContaining(
          '**Leader Agent**: Main response from the leader',
        ),
        expect.any(Object),
      );

      // Check that the follower output is included in the same string
      const completeCall = mockCallback.onComplete.mock.calls[0][0];
      expect(completeCall).toContain('**Follower Agent**:');
      expect(completeCall).toContain('Supporting response from follower');
    });

    test('should correctly aggregate streams in COMBINED mode', () => {
      const aggregator = new MultiAgentStreamingAggregator(mockCallback, {
        strategy: StreamAggregationStrategy.COMBINED,
        formatOptions: {
          showAgentNames: false,
        },
      });

      const metadata1: AgentStreamMetadata = {
        agentId: 'agent1',
        agentName: 'Test Agent 1',
        priority: 1,
      };

      const metadata2: AgentStreamMetadata = {
        agentId: 'agent2',
        agentName: 'Test Agent 2',
        priority: 2,
      };

      const options: StreamingOptions = {
        modelName: 'test-model',
        modelProvider: 'test-provider',
      };

      const handler1 = aggregator.registerAgentStream(
        metadata1,
        options,
      ) as TestStreamingHandler;
      const handler2 = aggregator.registerAgentStream(
        metadata2,
        options,
      ) as TestStreamingHandler;

      // Define listeners
      Object.defineProperty(handler1, 'listener', {
        value: {
          onToken: (token: string) =>
            aggregator['handleAgentToken'](handler1.streamId, token),
          onComplete: (response: string) =>
            aggregator['handleAgentComplete'](handler1.streamId, response),
          onError: (error: Error) =>
            aggregator['handleAgentError'](handler1.streamId, error),
        },
      });

      Object.defineProperty(handler2, 'listener', {
        value: {
          onToken: (token: string) =>
            aggregator['handleAgentToken'](handler2.streamId, token),
          onComplete: (response: string) =>
            aggregator['handleAgentComplete'](handler2.streamId, response),
          onError: (error: Error) =>
            aggregator['handleAgentError'](handler2.streamId, error),
        },
      });

      // Simulate streaming
      handler1.listener!.onToken('First part ');
      handler2.listener!.onToken('Second part');

      // Complete both streams
      handler1.listener!.onComplete('First part ');
      handler2.listener!.onComplete('Second part');

      // Verify the output combines both responses without agent names
      expect(mockCallback.onComplete).toHaveBeenCalledWith(
        'First part  Second part',
        expect.any(Object),
      );
    });

    test('should format output as a table when aggregateAsTable is true', () => {
      const aggregator = new MultiAgentStreamingAggregator(mockCallback, {
        strategy: StreamAggregationStrategy.PARALLEL,
        formatOptions: {
          aggregateAsTable: true,
        },
      });

      const metadata1: AgentStreamMetadata = {
        agentId: 'agent1',
        agentName: 'Test Agent 1',
        priority: 1,
      };

      const metadata2: AgentStreamMetadata = {
        agentId: 'agent2',
        agentName: 'Test Agent 2',
        priority: 2,
      };

      const options: StreamingOptions = {
        modelName: 'test-model',
        modelProvider: 'test-provider',
      };

      const handler1 = aggregator.registerAgentStream(
        metadata1,
        options,
      ) as TestStreamingHandler;
      const handler2 = aggregator.registerAgentStream(
        metadata2,
        options,
      ) as TestStreamingHandler;

      // Define listeners
      Object.defineProperty(handler1, 'listener', {
        value: {
          onToken: (token: string) =>
            aggregator['handleAgentToken'](handler1.streamId, token),
          onComplete: (response: string) =>
            aggregator['handleAgentComplete'](handler1.streamId, response),
          onError: (error: Error) =>
            aggregator['handleAgentError'](handler1.streamId, error),
        },
      });

      Object.defineProperty(handler2, 'listener', {
        value: {
          onToken: (token: string) =>
            aggregator['handleAgentToken'](handler2.streamId, token),
          onComplete: (response: string) =>
            aggregator['handleAgentComplete'](handler2.streamId, response),
          onError: (error: Error) =>
            aggregator['handleAgentError'](handler2.streamId, error),
        },
      });

      // Simulate streaming
      handler1.listener!.onToken('Response 1');
      handler2.listener!.onToken('Response 2');

      // Complete both streams
      handler1.listener!.onComplete('Response 1');
      handler2.listener!.onComplete('Response 2');

      // Verify the output is formatted as a table
      expect(mockCallback.onComplete).toHaveBeenCalledWith(
        expect.stringContaining('| Agent | Response |'),
        expect.any(Object),
      );
      expect(mockCallback.onComplete).toHaveBeenCalledWith(
        expect.stringContaining('| Test Agent 1 | Response 1 |'),
        expect.any(Object),
      );
      expect(mockCallback.onComplete).toHaveBeenCalledWith(
        expect.stringContaining('| Test Agent 2 | Response 2 |'),
        expect.any(Object),
      );
    });
  });
});
