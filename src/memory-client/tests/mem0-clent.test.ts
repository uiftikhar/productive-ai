import { initMemory, mem0Client } from '../mem0-client.ts';

// Mock mem0ai
jest.mock('mem0ai', () => {
  return {
    MemoryClient: jest.fn().mockImplementation(() => ({
      get: jest.fn().mockImplementation((id) => {
        if (id === 'error-memory' || id === 'throw-error')
          throw new Error('Memory not found');
        return { id };
      }),
      add: jest.fn().mockImplementation((content, options) => {
        // Don't throw error for 'error-memory' anymore
        if (options.user_id === 'throw-error') throw new Error('Failed to add');

        // For empty-result-memory, return empty array or undefined
        if (options.user_id === 'empty-result-memory') return [];

        return [{ id: options.user_id }];
      }),
      search: jest.fn().mockImplementation((query, options) => {
        if (options.user_id === 'error-memory')
          throw new Error('Search failed');
        return [{ text: '{"test": true}' }];
      }),
    })),
  };
});

describe('Memory Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initMemory', () => {
    it('should retrieve existing memory', async () => {
      const memory = await initMemory('test-memory');

      expect(mem0Client.get).toHaveBeenCalledWith('test-memory');
      expect(memory).toBeDefined();
      expect(memory.add).toBeDefined();
      expect(memory.search).toBeDefined();
    });

    it('should create new memory if retrieval fails', async () => {
      const memory = await initMemory('error-memory');

      expect(mem0Client.get).toHaveBeenCalledWith('error-memory');
      expect(mem0Client.add).toHaveBeenCalledWith('', {
        user_id: 'error-memory',
      });
      expect(memory).toBeDefined();
    });

    it('should throw error if memory creation fails', async () => {
      // Force mem0Client.add to return undefined for this specific test
      (mem0Client.add as jest.Mock).mockResolvedValueOnce(undefined);

      await expect(initMemory('empty-result-memory')).rejects.toThrow(
        'Failed to create memory record',
      );
    });

    it('should throw error if adding memory throws an error', async () => {
      await expect(initMemory('throw-error')).rejects.toThrow(
        'Failed to create memory record.',
      );
    });
  });

  describe('Memory operations', () => {
    it('should add content with correct user_id', async () => {
      const memory = await initMemory('test-memory');
      await memory.add('test content', { metadata: { test: true } });

      expect(mem0Client.add).toHaveBeenCalledWith('test content', {
        metadata: { test: true },
        user_id: 'test-memory',
      });
    });

    it('should search with correct user_id', async () => {
      const memory = await initMemory('test-memory');
      await memory.search('test query', { top_k: 5 });

      expect(mem0Client.search).toHaveBeenCalledWith('test query', {
        top_k: 5,
        user_id: 'test-memory',
      });
    });

    it('should get raw memory object', async () => {
      const memory = await initMemory('test-memory');
      const rawMemory = await memory.get();

      expect(rawMemory).toEqual({ id: 'test-memory' });
    });
  });
});
