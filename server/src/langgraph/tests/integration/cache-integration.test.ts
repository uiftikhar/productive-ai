/**
 * Integration Tests for Cache Service
 * 
 * Tests the caching mechanism used for storing and retrieving temporary data
 * during graph execution.
 */

import { jest } from '@jest/globals';
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  TestCache,
  PerformanceTracker,
  flushPromises
} from '../test-utils';
import { v4 as uuidv4 } from 'uuid';

describe('Cache Integration', () => {
  let testCache: TestCache;
  let performanceTracker: PerformanceTracker;
  
  beforeEach(() => {
    jest.clearAllMocks();
    testCache = new TestCache();
    performanceTracker = new PerformanceTracker();
  });
  
  test('should store and retrieve values correctly', () => {
    // Start performance tracking
    performanceTracker.start();
    
    // Store a simple value
    performanceTracker.measure('set-simple-value', () => {
      testCache.set('simple-key', 'simple-value');
    });
    
    // Retrieve the simple value
    performanceTracker.measure('get-simple-value', () => {
      const simpleValue = testCache.get('simple-key');
      // Verify the simple value
      expect(simpleValue).toBe('simple-value');
    });
    
    // Store a complex object
    const complexObject = {
      id: uuidv4(),
      data: {
        items: [1, 2, 3],
        metadata: {
          created: new Date().toISOString(),
          version: '1.0'
        }
      }
    };
    
    performanceTracker.measure('set-complex-value', () => {
      testCache.set('complex-key', complexObject);
    });
    
    // Retrieve the complex object
    performanceTracker.measure('get-complex-value', () => {
      const retrievedObject = testCache.get('complex-key');
      
      // Verify the complex object
      expect(retrievedObject).toBeDefined();
      expect(retrievedObject.id).toBe(complexObject.id);
      expect(retrievedObject.data.items).toEqual(complexObject.data.items);
      expect(retrievedObject.data.metadata.version).toBe(complexObject.data.metadata.version);
    });
    
    // End performance tracking
    performanceTracker.end();
    performanceTracker.logResults();
  });
  
  test('should track cache hits and misses', () => {
    // Start performance tracking
    performanceTracker.start();
    
    // Set a value
    testCache.set('tracking-key', 'tracking-value');
    
    // Initial statistics
    const initialStats = testCache.getStats();
    expect(initialStats.hits).toBe(0);
    expect(initialStats.misses).toBe(0);
    
    // Get existing value (hit)
    const existingValue = testCache.get('tracking-key');
    expect(existingValue).toBe('tracking-value');
    
    // Get non-existent value (miss)
    const nonExistentValue = testCache.get('non-existent-key');
    expect(nonExistentValue).toBeUndefined();
    
    // Get another non-existent value (miss)
    const anotherNonExistentValue = testCache.get('another-non-existent-key');
    expect(anotherNonExistentValue).toBeUndefined();
    
    // Get existing value again (hit)
    const existingValueAgain = testCache.get('tracking-key');
    expect(existingValueAgain).toBe('tracking-value');
    
    // Check final statistics
    const finalStats = testCache.getStats();
    expect(finalStats.hits).toBe(2); // Two hits
    expect(finalStats.misses).toBe(2); // Two misses
    expect(finalStats.hitRatio).toBe(0.5); // 2 hits out of 4 total operations
    
    // End performance tracking
    performanceTracker.end();
    performanceTracker.logResults();
  });
  
  test('should clear cache correctly', () => {
    // Set multiple values
    testCache.set('key1', 'value1');
    testCache.set('key2', 'value2');
    testCache.set('key3', 'value3');
    
    // Verify values are in cache
    expect(testCache.get('key1')).toBe('value1');
    expect(testCache.get('key2')).toBe('value2');
    expect(testCache.get('key3')).toBe('value3');
    
    // Clear cache
    testCache.clear();
    
    // Verify values are no longer in cache
    expect(testCache.get('key1')).toBeUndefined();
    expect(testCache.get('key2')).toBeUndefined();
    expect(testCache.get('key3')).toBeUndefined();
    
    // Check statistics are reset
    const stats = testCache.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(3); // The three gets after clearing
    expect(stats.hitRatio).toBe(0);
  });
  
  test('should handle high frequency operations efficiently', () => {
    // Start performance tracking
    performanceTracker.start();
    
    // Generate a large number of keys and values
    const operationCount = 1000;
    
    // Perform many set operations
    performanceTracker.measure('bulk-set-operations', () => {
      for (let i = 0; i < operationCount; i++) {
        testCache.set(`bulk-key-${i}`, `bulk-value-${i}`);
      }
    });
    
    // Perform many get operations
    performanceTracker.measure('bulk-get-operations', () => {
      for (let i = 0; i < operationCount; i++) {
        const value = testCache.get(`bulk-key-${i}`);
        expect(value).toBe(`bulk-value-${i}`);
      }
    });
    
    // Check statistics
    const stats = testCache.getStats();
    expect(stats.hits).toBe(operationCount);
    expect(stats.hitRatio).toBeGreaterThan(0);
    
    // End performance tracking
    performanceTracker.end();
    performanceTracker.logResults();
  });
}); 