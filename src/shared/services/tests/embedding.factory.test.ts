import { EmbeddingServiceFactory } from '../embedding.factory';
import { EmbeddingService } from '../embedding.service';
import { EmbeddingAdapter } from '../embedding-adapter';
import { OpenAIConnector } from '../../../agents/integrations/openai-connector';
import { ConsoleLogger } from '../../logger/console-logger';
import { IEmbeddingService } from '../embedding.interface';

// Mock dependencies
jest.mock('../embedding.service');
jest.mock('../embedding-adapter');
jest.mock('../../../agents/integrations/openai-connector');

describe('EmbeddingServiceFactory', () => {
  beforeEach(() => {
    // Reset the factory before each test
    EmbeddingServiceFactory.reset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    EmbeddingServiceFactory.reset();
  });

  test('should create default instance when no options provided', () => {
    // Act
    const service = EmbeddingServiceFactory.getService();

    // Assert
    expect(service).toBeDefined();
    expect(OpenAIConnector).toHaveBeenCalledTimes(1);
    expect(EmbeddingService).toHaveBeenCalledTimes(1);
    expect(EmbeddingAdapter).not.toHaveBeenCalled();
  });

  test('should reuse default instance on subsequent calls without options', () => {
    // Act
    const service1 = EmbeddingServiceFactory.getService();
    const service2 = EmbeddingServiceFactory.getService();

    // Assert
    expect(service1).toBe(service2); // Same instance
    expect(OpenAIConnector).toHaveBeenCalledTimes(1);
    expect(EmbeddingService).toHaveBeenCalledTimes(1);
  });

  test('should create new instance when connector provided', () => {
    // Arrange
    const mockConnector = new OpenAIConnector();

    // Act
    const service = EmbeddingServiceFactory.getService({
      connector: mockConnector,
    });

    // Assert
    expect(service).toBeDefined();
    expect(EmbeddingService).toHaveBeenCalledWith(
      mockConnector,
      expect.any(ConsoleLogger),
      true,
    );
    expect(EmbeddingAdapter).not.toHaveBeenCalled();
  });

  test('should create new instance with adapter when useAdapter is true', () => {
    // Act
    const service = EmbeddingServiceFactory.getService({ useAdapter: true });

    // Assert
    expect(service).toBeDefined();
    expect(OpenAIConnector).toHaveBeenCalledTimes(1);
    expect(EmbeddingService).toHaveBeenCalledTimes(1);
    expect(EmbeddingAdapter).toHaveBeenCalledTimes(1);
  });

  test('should use provided logger', () => {
    // Arrange
    const mockLogger = new ConsoleLogger();

    // Act
    const service = EmbeddingServiceFactory.getService({ logger: mockLogger });

    // Assert
    expect(service).toBeDefined();
    expect(EmbeddingService).toHaveBeenCalledWith(
      expect.any(OpenAIConnector),
      mockLogger,
      true,
    );
  });

  test('should use provided embedding service', () => {
    // Arrange
    const mockEmbeddingService = {} as IEmbeddingService;

    // Act
    const service = EmbeddingServiceFactory.getService({
      embeddingService: mockEmbeddingService,
    });

    // Assert
    expect(service).toBe(mockEmbeddingService);
    expect(OpenAIConnector).not.toHaveBeenCalled();
    expect(EmbeddingService).not.toHaveBeenCalled();
  });

  test('should wrap provided embedding service with adapter when useAdapter is true', () => {
    // Arrange
    const mockEmbeddingService = {} as IEmbeddingService;

    // Act
    const service = EmbeddingServiceFactory.getService({
      embeddingService: mockEmbeddingService,
      useAdapter: true,
    });

    // Assert
    expect(service).toBeDefined();
    expect(service).not.toBe(mockEmbeddingService); // Should be wrapped
    expect(EmbeddingAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddingService: mockEmbeddingService,
      }),
    );
  });

  test('should reset default instance', () => {
    // Arrange
    const service1 = EmbeddingServiceFactory.getService();

    // Act
    EmbeddingServiceFactory.reset();
    const service2 = EmbeddingServiceFactory.getService();

    // Assert
    expect(service1).not.toBe(service2); // Different instances
    expect(OpenAIConnector).toHaveBeenCalledTimes(2);
    expect(EmbeddingService).toHaveBeenCalledTimes(2);
  });
});
