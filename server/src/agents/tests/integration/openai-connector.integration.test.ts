import { OpenAIConnector } from '../../integrations/openai-connector';
import { Logger } from '../../../shared/logger/logger.interface';
import { MessageConfig } from '../../interfaces/language-model-provider.interface';
import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';

// Mock the LangChain modules
jest.mock('@langchain/openai', () => {
  return {
    ChatOpenAI: jest.fn().mockImplementation(() => ({
      modelName: 'gpt-3.5-turbo',
      temperature: 0,
      maxTokens: 100,
      streaming: false,
      invoke: jest.fn().mockResolvedValue({
        content: 'This is 4, the answer to your question.',
      }),
    })),
    OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
      model: 'text-embedding-ada-002',
      embedQuery: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
      embedDocuments: jest
        .fn()
        .mockResolvedValue([
          new Array(1536).fill(0.1),
          new Array(1536).fill(0.2),
          new Array(1536).fill(0.3),
        ]),
    })),
  };
});

// Define the MockLoggerType
interface MockLoggerType extends Logger {
  messages: Array<{ level: string; message: string; meta?: any }>;
  clear(): void;
  getLogsByLevel(
    level: string,
  ): Array<{ level: string; message: string; meta?: any }>;
  hasMessage(messageSubstring: string, level?: string): boolean;
  currentLogLevel: string;
}

// Declare the global mockLogger
declare global {
  var mockLogger: MockLoggerType;
}

describe('OpenAIConnector Integration Tests', () => {
  let connector: OpenAIConnector;
  let mockChatOpenAI: jest.Mocked<ChatOpenAI>;
  let mockOpenAIEmbeddings: jest.Mocked<OpenAIEmbeddings>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Clear the global mockLogger
    global.mockLogger?.clear();

    // Create connector instance with test configuration
    connector = new OpenAIConnector({
      modelConfig: {
        model: 'gpt-3.5-turbo',
        temperature: 0,
        maxTokens: 100,
        streaming: false,
      },
      embeddingConfig: {
        model: 'text-embedding-ada-002',
      },
      logger: global.mockLogger,
    });

    // Get the mocked instances
    mockChatOpenAI = new ChatOpenAI() as jest.Mocked<ChatOpenAI>;
    mockOpenAIEmbeddings =
      new OpenAIEmbeddings() as jest.Mocked<OpenAIEmbeddings>;
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await connector.initialize();
      expect(
        global.mockLogger.hasMessage('Initializing OpenAIConnector', 'info'),
      ).toBe(true);
    });
  });

  describe('Text Generation', () => {
    test('should generate a chat completion', async () => {
      const messages: MessageConfig[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is 2+2?' },
      ];

      // Mock ChatOpenAI invoke for this specific test
      (ChatOpenAI as unknown as jest.Mock).mockImplementation(() => ({
        modelName: 'gpt-3.5-turbo',
        temperature: 0,
        maxTokens: 100,
        streaming: false,
        invoke: jest.fn().mockResolvedValue({
          content: 'The answer is 4.',
        }),
      }));

      const response = await connector.generateChatCompletion(messages);

      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
      expect(response.toLowerCase()).toContain('4');
    });

    test('should generate a response with structured output format', async () => {
      const messages: MessageConfig[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        {
          role: 'user',
          content:
            'Generate a JSON object with name and age properties for a person named John who is 30 years old.',
        },
      ];

      // Mock ChatOpenAI invoke for this specific test
      (ChatOpenAI as unknown as jest.Mock).mockImplementation(() => ({
        modelName: 'gpt-3.5-turbo',
        temperature: 0,
        maxTokens: 100,
        streaming: false,
        invoke: jest.fn().mockResolvedValue({
          content: '{"name":"John","age":30}',
        }),
      }));

      const response = await connector.generateResponse(messages, {
        responseFormat: { type: 'json_object' },
      });

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();

      const jsonResponse = JSON.parse(response.content);
      expect(jsonResponse).toHaveProperty('name', 'John');
      expect(jsonResponse).toHaveProperty('age', 30);
    });
  });

  describe('Streaming', () => {
    test('should stream a chat completion', async () => {
      const messages: MessageConfig[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Count from 1 to 5.' },
      ];

      let streamedContent = '';
      let tokenCount = 0;
      let isComplete = false;
      let hasError = false;

      const streamHandler = {
        onToken: (token: string) => {
          streamedContent += token;
          tokenCount++;
        },
        onComplete: (fullContent: string) => {
          isComplete = true;
          expect(fullContent).toBe(streamedContent);
        },
        onError: (error: Error) => {
          hasError = true;
        },
      };

      // Mock streaming behavior
      jest
        .spyOn(connector, 'generateStreamingResponse')
        .mockImplementation(async (messages, handler) => {
          handler.onToken('1');
          handler.onToken(' 2');
          handler.onToken(' 3');
          handler.onToken(' 4');
          handler.onToken(' 5');
          handler.onComplete('1 2 3 4 5');
        });

      await connector.generateChatCompletionStream(messages, streamHandler);

      expect(streamedContent).toBeTruthy();
      expect(tokenCount).toBeGreaterThan(0);
      expect(isComplete).toBe(true);
      expect(hasError).toBe(false);

      // Content should contain numbers 1 through 5
      for (let i = 1; i <= 5; i++) {
        expect(streamedContent).toContain(String(i));
      }
    });
  });

  describe('Embeddings', () => {
    test('should generate embeddings for text', async () => {
      const text = 'This is a sample text for embedding generation.';
      const embedding = await connector.generateEmbedding(text);

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);

      // Verify all elements are numbers
      embedding.forEach((value) => {
        expect(typeof value).toBe('number');
      });
    });

    test('should generate batch embeddings', async () => {
      const texts = [
        'First sample text for embedding generation.',
        'Second sample text for embedding generation.',
        'Third sample text for embedding generation.',
      ];

      const embeddings = await connector.generateBatchEmbeddings(texts);

      expect(embeddings).toBeDefined();
      expect(Array.isArray(embeddings)).toBe(true);
      expect(embeddings.length).toBe(texts.length);

      // Verify each embedding is an array of numbers
      embeddings.forEach((embedding) => {
        expect(Array.isArray(embedding)).toBe(true);
        expect(embedding.length).toBeGreaterThan(0);
        embedding.forEach((value) => {
          expect(typeof value).toBe('number');
        });
      });
    });
  });

  describe('Prompt Templates', () => {
    test('should create and format prompt templates', async () => {
      const systemTemplate = 'You are a {role} assistant.';
      const humanTemplate = 'Tell me about {topic}.';
      const variables = {
        role: 'helpful',
        topic: 'artificial intelligence',
      };

      const template = connector.createPromptTemplate(
        systemTemplate,
        humanTemplate,
        ['role', 'topic'],
      );
      const formattedMessages = await connector.formatPromptTemplate(
        template,
        variables,
      );

      expect(formattedMessages).toHaveLength(2);
      expect(formattedMessages[0].content).toBe('You are a helpful assistant.');
      expect(formattedMessages[1].content).toBe(
        'Tell me about artificial intelligence.',
      );
    });
  });
});
