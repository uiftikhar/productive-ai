/**
 * Embedding Service Factory
 *
 * This factory provides standardized access to the embedding service implementation.
 * It serves as the central point for getting embedding service instances throughout
 * the codebase, ensuring consistency and simplifying future updates to the implementation.
 *
 * Usage:
 * ```typescript
 * // Get the default embedding service instance
 * const embeddingService = EmbeddingServiceFactory.getService();
 *
 * // Get a customized instance with specific options
 * const customService = EmbeddingServiceFactory.getService({
 *   connector: myConnector,
 *   logger: myLogger
 * });
 * ```
 */

import { IEmbeddingService } from './embedding.interface';
import { EmbeddingService } from './embedding.service';
import { EmbeddingAdapter } from './embedding-adapter';
import { Logger } from '../logger/logger.interface';
import { ConsoleLogger } from '../logger/console-logger';
import { ConfigurationError } from '../utils/base-error';
import { EmbeddingConnectorError } from './embedding/embedding-error';
import { OpenAIConnector } from '../../connectors/openai-connector';

/**
 * Factory options for creating embedding services
 */
export interface EmbeddingServiceFactoryOptions {
  connector?: OpenAIConnector;
  logger?: Logger;
  useAdapter?: boolean;
  embeddingService?: IEmbeddingService;
}

/**
 * Factory for creating and accessing embedding services
 */
export class EmbeddingServiceFactory {
  private static defaultInstance: IEmbeddingService | null = null;

  /**
   * Get an embedding service instance
   *
   * @param options Options for creating the service
   * @returns An implementation of IEmbeddingService
   */
  static getService(
    options: EmbeddingServiceFactoryOptions = {},
  ): IEmbeddingService {
    try {
      // Use adapter if specifically requested
      const useAdapter = options.useAdapter ?? false;
      const logger = options.logger || new ConsoleLogger();

      // For testing and specific use cases, allow injecting a service
      if (options.embeddingService) {
        return useAdapter
          ? new EmbeddingAdapter({
              embeddingService: options.embeddingService,
              logger,
            })
          : options.embeddingService;
      }

      // If there's a connector, create a new service with it
      if (options.connector) {
        const service = new EmbeddingService(options.connector, logger, true);
        return useAdapter
          ? new EmbeddingAdapter({ embeddingService: service, logger })
          : service;
      }

      // Create and cache a default instance if none exists
      if (!EmbeddingServiceFactory.defaultInstance) {
        try {
          const connector = new OpenAIConnector();
          const service = new EmbeddingService(connector, logger, true);
          EmbeddingServiceFactory.defaultInstance = useAdapter
            ? new EmbeddingAdapter({ embeddingService: service, logger })
            : service;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error(
            `Failed to create default embedding service: ${errorMessage}`,
          );
          throw new EmbeddingConnectorError(
            `Unable to initialize default connector: ${errorMessage}`,
            {
              cause: error instanceof Error ? error : undefined,
            },
          );
        }
      }

      return EmbeddingServiceFactory.defaultInstance;
    } catch (error) {
      if (
        error instanceof EmbeddingConnectorError ||
        error instanceof ConfigurationError
      ) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new ConfigurationError(
        `Error creating embedding service: ${errorMessage}`,
        {
          cause: error instanceof Error ? error : undefined,
        },
      );
    }
  }

  /**
   * Reset the default instance (useful for testing)
   */
  static reset(): void {
    EmbeddingServiceFactory.defaultInstance = null;
  }
}
