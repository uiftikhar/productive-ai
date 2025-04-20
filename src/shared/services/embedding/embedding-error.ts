import { BaseError } from '../../utils/base-error';

/**
 * EmbeddingError - Specific error for embedding service related issues
 */
export class EmbeddingError extends BaseError {
  constructor(message: string, options?: Omit<ConstructorParameters<typeof BaseError>[1], 'name'>) {
    super(message, {
      ...options,
      name: 'EmbeddingError'
    });
  }
}

/**
 * EmbeddingConnectorError - Used when there's an issue with the embedding connector
 */
export class EmbeddingConnectorError extends EmbeddingError {
  constructor(message: string, options?: ConstructorParameters<typeof BaseError>[1]) {
    super(`Embedding connector error: ${message}`, options);
  }
}

/**
 * EmbeddingGenerationError - Used when there's an issue generating embeddings
 */
export class EmbeddingGenerationError extends EmbeddingError {
  constructor(message: string, options?: ConstructorParameters<typeof BaseError>[1]) {
    super(`Embedding generation failed: ${message}`, options);
  }
}

/**
 * EmbeddingValidationError - Used when there's an issue with embedding validation
 */
export class EmbeddingValidationError extends EmbeddingError {
  constructor(message: string, options?: ConstructorParameters<typeof BaseError>[1]) {
    super(`Embedding validation error: ${message}`, options);
  }
} 