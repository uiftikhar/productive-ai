import {
  hasError,
  isReady,
  isExecuting,
  hasProperty,
  hasMoreChunks,
  routeOnError,
  routeIf,
  routeIfHasItems,
  routeIfHasMinItems,
} from '../edge-conditions';
import { AgentStatus } from '../../state/base-agent-state';

describe('Edge Condition Utilities', () => {
  describe('Status checks', () => {
    test('hasError should return true when state has error status', () => {
      const state = { status: AgentStatus.ERROR };
      expect(hasError(state)).toBe(true);
    });

    test('hasError should return false when state has non-error status', () => {
      const readyState = { status: AgentStatus.READY };
      const executingState = { status: AgentStatus.EXECUTING };
      
      expect(hasError(readyState)).toBe(false);
      expect(hasError(executingState)).toBe(false);
    });

    test('isReady should return true when state has ready status', () => {
      const state = { status: AgentStatus.READY };
      expect(isReady(state)).toBe(true);
    });

    test('isReady should return false when state has non-ready status', () => {
      const errorState = { status: AgentStatus.ERROR };
      const executingState = { status: AgentStatus.EXECUTING };
      
      expect(isReady(errorState)).toBe(false);
      expect(isReady(executingState)).toBe(false);
    });

    test('isExecuting should return true when state has executing status', () => {
      const state = { status: AgentStatus.EXECUTING };
      expect(isExecuting(state)).toBe(true);
    });

    test('isExecuting should return false when state has non-executing status', () => {
      const errorState = { status: AgentStatus.ERROR };
      const readyState = { status: AgentStatus.READY };
      
      expect(isExecuting(errorState)).toBe(false);
      expect(isExecuting(readyState)).toBe(false);
    });
  });

  describe('Property checks', () => {
    test('hasProperty should return true when property exists and is truthy', () => {
      const state = { propertyA: 'exists', propertyB: 42, propertyC: true };
      
      const checkPropertyA = hasProperty('propertyA');
      const checkPropertyB = hasProperty('propertyB');
      const checkPropertyC = hasProperty('propertyC');
      
      expect(checkPropertyA(state)).toBe(true);
      expect(checkPropertyB(state)).toBe(true);
      expect(checkPropertyC(state)).toBe(true);
    });

    test('hasProperty should return false when property does not exist', () => {
      const state = { propertyA: 'exists' };
      
      const checkPropertyB = hasProperty('propertyB');
      expect(checkPropertyB(state)).toBe(false);
    });

    test('hasProperty should return false when property exists but is falsy', () => {
      const state = { 
        propertyA: '', 
        propertyB: 0, 
        propertyC: false, 
        propertyD: null,
        propertyE: undefined 
      };
      
      const checkPropertyA = hasProperty('propertyA');
      const checkPropertyB = hasProperty('propertyB');
      const checkPropertyC = hasProperty('propertyC');
      const checkPropertyD = hasProperty('propertyD');
      const checkPropertyE = hasProperty('propertyE');
      
      expect(checkPropertyA(state)).toBe(false);
      expect(checkPropertyB(state)).toBe(false);
      expect(checkPropertyC(state)).toBe(false);
      expect(checkPropertyD(state)).toBe(false);
      expect(checkPropertyE(state)).toBe(false);
    });
  });

  describe('Chunk processing checks', () => {
    test('hasMoreChunks should return true when there are more chunks to process', () => {
      const state = {
        chunks: ['chunk1', 'chunk2', 'chunk3'],
        currentChunkIndex: 1
      };
      
      expect(hasMoreChunks(state)).toBe(true);
    });

    test('hasMoreChunks should return false when all chunks have been processed', () => {
      const state = {
        chunks: ['chunk1', 'chunk2', 'chunk3'],
        currentChunkIndex: 3
      };
      
      expect(hasMoreChunks(state)).toBe(false);
    });

    test('hasMoreChunks should return false when chunks array is empty', () => {
      const state = {
        chunks: [],
        currentChunkIndex: 0
      };
      
      expect(hasMoreChunks(state)).toBe(false);
    });

    test('hasMoreChunks should return false when chunks property is missing', () => {
      const state = {
        currentChunkIndex: 0
      };
      
      expect(hasMoreChunks(state)).toBeFalsy();
    });

    test('hasMoreChunks should return false when currentChunkIndex is undefined', () => {
      const state = {
        chunks: ['chunk1', 'chunk2', 'chunk3']
      };
      
      expect(hasMoreChunks(state)).toBeFalsy();
    });
  });

  describe('Routing functions', () => {
    test('routeOnError should return error target when state has error', () => {
      const errorState = { status: AgentStatus.ERROR };
      const router = routeOnError('error_handler', 'next_step');
      
      expect(router(errorState)).toBe('error_handler');
    });

    test('routeOnError should return success target when state has no error', () => {
      const successState = { status: AgentStatus.READY };
      const router = routeOnError('error_handler', 'next_step');
      
      expect(router(successState)).toBe('next_step');
    });

    test('routeIf should return true target when condition is true', () => {
      const state = { count: 5 };
      const condition = (state: any) => state.count > 3;
      const router = routeIf(condition, 'high_count', 'low_count');
      
      expect(router(state)).toBe('high_count');
    });

    test('routeIf should return false target when condition is false', () => {
      const state = { count: 2 };
      const condition = (state: any) => state.count > 3;
      const router = routeIf(condition, 'high_count', 'low_count');
      
      expect(router(state)).toBe('low_count');
    });

    test('routeIfHasItems should return hasItems target when array property has items', () => {
      const state = { items: [1, 2, 3] };
      const router = routeIfHasItems('items', 'has_items', 'no_items');
      
      expect(router(state)).toBe('has_items');
    });

    test('routeIfHasItems should return noItems target when array property is empty', () => {
      const state = { items: [] };
      const router = routeIfHasItems('items', 'has_items', 'no_items');
      
      expect(router(state)).toBe('no_items');
    });

    test('routeIfHasItems should return noItems target when property is not an array', () => {
      const state = { items: 'not an array' };
      const router = routeIfHasItems('items', 'has_items', 'no_items');
      
      expect(router(state)).toBe('no_items');
    });

    test('routeIfHasItems should return noItems target when property does not exist', () => {
      const state = { something: 'else' };
      const router = routeIfHasItems('items', 'has_items', 'no_items');
      
      expect(router(state)).toBe('no_items');
    });

    test('routeIfHasMinItems should return hasMinItems target when array property has sufficient items', () => {
      const state = { items: [1, 2, 3, 4, 5] };
      const router = routeIfHasMinItems('items', 3, 'sufficient_items', 'insufficient_items');
      
      expect(router(state)).toBe('sufficient_items');
    });

    test('routeIfHasMinItems should return notEnoughItems target when array property has insufficient items', () => {
      const state = { items: [1, 2] };
      const router = routeIfHasMinItems('items', 3, 'sufficient_items', 'insufficient_items');
      
      expect(router(state)).toBe('insufficient_items');
    });

    test('routeIfHasMinItems should return notEnoughItems target when property is not an array', () => {
      const state = { items: 'not an array' };
      const router = routeIfHasMinItems('items', 3, 'sufficient_items', 'insufficient_items');
      
      expect(router(state)).toBe('insufficient_items');
    });

    test('routeIfHasMinItems should return notEnoughItems target when property does not exist', () => {
      const state = { something: 'else' };
      const router = routeIfHasMinItems('items', 3, 'sufficient_items', 'insufficient_items');
      
      expect(router(state)).toBe('insufficient_items');
    });
  });

  describe('Edge cases', () => {
    test('All functions should handle undefined state gracefully', () => {
      // TypeScript won't allow us to pass undefined, but the actual runtime might
      // handle these cases by throwing meaningful errors
      expect(() => hasError({} as any)).not.toThrow();
      expect(() => isReady({} as any)).not.toThrow();
      expect(() => isExecuting({} as any)).not.toThrow();
      expect(() => hasMoreChunks({} as any)).not.toThrow();
      
      const propertyCheck = hasProperty('test');
      expect(() => propertyCheck({} as any)).not.toThrow();
      
      const routeOnErrorCheck = routeOnError('error', 'success');
      expect(() => routeOnErrorCheck({} as any)).not.toThrow();
      
      const routeIfCheck = routeIf(() => true, 'true_route', 'false_route');
      expect(() => routeIfCheck({} as any)).not.toThrow();
      
      const routeIfHasItemsCheck = routeIfHasItems('items', 'has_items', 'no_items');
      expect(() => routeIfHasItemsCheck({} as any)).not.toThrow();
      
      const routeIfHasMinItemsCheck = routeIfHasMinItems('items', 3, 'has_min', 'not_enough');
      expect(() => routeIfHasMinItemsCheck({} as any)).not.toThrow();
    });
  });
}); 