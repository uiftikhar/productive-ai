import {
  EmbeddingConnectorError,
  EmbeddingGenerationError,
  EmbeddingValidationError,
} from '../embedding/embedding-error';
import { BaseError } from '../../utils/base-error';

describe('Embedding Error Classes', () => {
  describe('EmbeddingConnectorError', () => {
    it('should be an instance of BaseError', () => {
      const error = new EmbeddingConnectorError('Test error');
      expect(error).toBeInstanceOf(BaseError);
    });

    it('should have the correct message format', () => {
      const error = new EmbeddingConnectorError('Test error');
      expect(error.message).toBe('Embedding connector error: Test error');
    });

    it('should preserve cause when provided', () => {
      const cause = new Error('Original error');
      const error = new EmbeddingConnectorError('Test error', { cause });
      expect(error.cause).toBe(cause);
    });
  });

  describe('EmbeddingGenerationError', () => {
    it('should be an instance of BaseError', () => {
      const error = new EmbeddingGenerationError('Test error');
      expect(error).toBeInstanceOf(BaseError);
    });

    it('should have the correct message format', () => {
      const error = new EmbeddingGenerationError('Test error');
      expect(error.message).toBe('Embedding generation failed: Test error');
    });

    it('should preserve cause when provided', () => {
      const cause = new Error('Original error');
      const error = new EmbeddingGenerationError('Test error', { cause });
      expect(error.cause).toBe(cause);
    });
  });

  describe('EmbeddingValidationError', () => {
    it('should be an instance of BaseError', () => {
      const error = new EmbeddingValidationError('Test error');
      expect(error).toBeInstanceOf(BaseError);
    });

    it('should have the correct message format', () => {
      const error = new EmbeddingValidationError('Test error');
      expect(error.message).toBe('Embedding validation error: Test error');
    });

    it('should preserve cause when provided', () => {
      const cause = new Error('Original error');
      const error = new EmbeddingValidationError('Test error', { cause });
      expect(error.cause).toBe(cause);
    });
  });
});
