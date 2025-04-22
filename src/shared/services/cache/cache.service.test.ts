import { CacheService, CacheOptions } from './cache.service';

// Mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

describe('CacheService', () => {
  let cacheService: CacheService;
  let options: CacheOptions;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup with short TTL for testing
    options = {
      ttlMs: 100, // 100ms TTL for faster testing
      maxSize: 5,  // Small size to test eviction
      namespace: 'test'
    };
    
    cacheService = new CacheService(options, mockLogger as any);
  });

  afterEach(() => {
    // Clean up
    cacheService.dispose();
  });

  it('should store and retrieve values', () => {
    // Arrange & Act
    cacheService.set('key1', 'value1');
    cacheService.set('key2', { complex: 'object' });
    
    // Assert
    expect(cacheService.get('key1')).toBe('value1');
    expect(cacheService.get('key2')).toEqual({ complex: 'object' });
  });

  it('should return undefined for non-existent keys', () => {
    // Assert
    expect(cacheService.get('nonexistent')).toBeUndefined();
  });

  it('should check if key exists with has method', () => {
    // Arrange
    cacheService.set('existingKey', 'value');
    
    // Assert
    expect(cacheService.has('existingKey')).toBeTruthy();
    expect(cacheService.has('nonexistentKey')).toBeFalsy();
  });

  it('should delete keys', () => {
    // Arrange
    cacheService.set('key1', 'value1');
    
    // Act
    const result = cacheService.delete('key1');
    
    // Assert
    expect(result).toBeTruthy();
    expect(cacheService.get('key1')).toBeUndefined();
    expect(cacheService.has('key1')).toBeFalsy();
  });

  it('should clear all entries', () => {
    // Arrange
    cacheService.set('key1', 'value1');
    cacheService.set('key2', 'value2');
    
    // Act
    cacheService.clear();
    
    // Assert
    expect(cacheService.get('key1')).toBeUndefined();
    expect(cacheService.get('key2')).toBeUndefined();
  });

  it('should respect namespace isolation', () => {
    // Arrange
    const cache1 = new CacheService({ namespace: 'namespace1' });
    const cache2 = new CacheService({ namespace: 'namespace2' });
    
    // Act
    cache1.set('key', 'value1');
    cache2.set('key', 'value2');
    
    // Assert
    expect(cache1.get('key')).toBe('value1');
    expect(cache2.get('key')).toBe('value2');
    
    // Clean up
    cache1.dispose();
    cache2.dispose();
  });

  it('should expire entries based on TTL', (done) => {
    // Arrange
    cacheService.set('expiring', 'value', 50); // 50ms TTL
    
    // Assert - immediately available
    expect(cacheService.get('expiring')).toBe('value');
    
    // Wait for expiration and check again
    setTimeout(() => {
      expect(cacheService.get('expiring')).toBeUndefined();
      done();
    }, 100);
  });

  it('should evict least recently used items when exceeding maxSize', () => {
    // Arrange & Act - fill cache beyond capacity
    for (let i = 1; i <= 10; i++) {
      cacheService.set(`key${i}`, `value${i}`);
    }
    
    // Assert - should have evicted older entries
    expect(cacheService.getStats().size).toBeLessThanOrEqual(options.maxSize!);
    
    // The first entries should be evicted
    expect(cacheService.get('key1')).toBeUndefined();
    expect(cacheService.get('key2')).toBeUndefined();
    
    // Later entries should still be present
    expect(cacheService.get('key10')).toBe('value10');
  });

  it('should maintain access statistics', () => {
    // Arrange
    cacheService.set('key1', 'value1');
    
    // Act - a few hits and misses
    cacheService.get('key1'); // hit
    cacheService.get('key1'); // hit
    cacheService.get('nonexistent'); // miss
    
    // Assert
    const stats = cacheService.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2/3);
  });

  it('should correctly evict least recently used items', () => {
    // Arrange - Create cache with fixed size
    const maxSize = 3;
    const testCache = new CacheService({
      maxSize,
      namespace: 'test-lru'
    }, mockLogger as any);
    
    // Add items to fill the cache
    testCache.set('key1', 'value1');
    testCache.set('key2', 'value2');
    testCache.set('key3', 'value3');
    
    // Verify the cache is full but not exceeding max size
    expect(testCache.getStats().size).toBe(maxSize);
    
    // Add one more item - should trigger eviction of least recently used
    testCache.set('key4', 'value4');
    
    // Verify the cache size is still maintained at maxSize
    expect(testCache.getStats().size).toBe(maxSize);
    
    // Verify the most recently added keys are still in the cache
    expect(testCache.get('key4')).toBe('value4');
    
    // Cleanup
    testCache.dispose();
  });

  it('should automatically remove expired entries', (done) => {
    // Create cache with very short TTL
    const cache = new CacheService({
      ttlMs: 50,
      namespace: 'cleanup-test'
    });
    
    // Add some entries that will expire
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    
    // Wait for TTL to expire plus some buffer for the cleanup interval to run
    setTimeout(() => {
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
      cache.dispose();
      done();
    }, 150);
  });

  it('should use custom TTL when provided', (done) => {
    // Arrange - set with default TTL and custom TTL
    cacheService.set('default', 'value1'); // 100ms from options
    cacheService.set('custom', 'value2', 200); // 200ms custom
    
    // Wait for default TTL to expire
    setTimeout(() => {
      // Default TTL entry should be gone
      expect(cacheService.get('default')).toBeUndefined();
      // Custom TTL entry should still exist
      expect(cacheService.get('custom')).toBe('value2');
      
      // Wait for custom TTL to expire
      setTimeout(() => {
        expect(cacheService.get('custom')).toBeUndefined();
        done();
      }, 150);
    }, 150);
  });
}); 