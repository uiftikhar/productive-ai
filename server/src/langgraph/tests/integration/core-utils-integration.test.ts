/**
 * Integration Tests for Core Utilities
 * 
 * Tests the core utilities like edge conditions and graph visualizations
 * that support the LangGraph framework.
 */

import { jest } from '@jest/globals';
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  PerformanceTracker,
  flushPromises
} from '../test-utils';
import { v4 as uuidv4 } from 'uuid';
import {
  hasError,
  isReady,
  isExecuting,
  hasProperty,
  hasMoreChunks,
  routeOnError,
  routeIf,
  routeIfHasItems,
  routeIfHasMinItems
} from '../../core/utils/edge-conditions';
import { AgentStatus } from '../../core/state/base-agent-state';

// Define our own edge condition types for testing
interface BaseCondition {
  type: string;
  path?: string;
  value?: any;
}

interface EqualsCondition extends BaseCondition {
  type: 'equals';
}

interface GreaterThanCondition extends BaseCondition {
  type: 'greaterThan';
}

interface ContainsCondition extends BaseCondition {
  type: 'contains';
}

interface AndCondition extends BaseCondition {
  type: 'and';
  conditions: BaseCondition[];
}

interface OrCondition extends BaseCondition {
  type: 'or';
  conditions: BaseCondition[];
}

interface NotCondition extends BaseCondition {
  type: 'not';
  condition: BaseCondition;
}

interface SomeCondition extends BaseCondition {
  type: 'some';
  condition: BaseCondition;
}

interface EveryCondition extends BaseCondition {
  type: 'every';
  condition: BaseCondition;
}

interface LessThanCondition extends BaseCondition {
  type: 'lessThan';
}

type EdgeCondition = 
  | EqualsCondition 
  | GreaterThanCondition 
  | ContainsCondition 
  | AndCondition 
  | OrCondition 
  | NotCondition
  | SomeCondition
  | EveryCondition
  | LessThanCondition;

// Our own implementation of edge condition evaluator for testing
class EdgeConditionResult {
  static evaluate(condition: EdgeCondition, state: any): boolean {
    const getValue = (path: string, obj: any): any => {
      if (!path) return obj;
      return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    };

    switch (condition.type) {
      case 'equals':
        return getValue(condition.path!, state) === condition.value;
      case 'greaterThan':
        return getValue(condition.path!, state) > condition.value;
      case 'lessThan':
        return getValue(condition.path!, state) < condition.value;
      case 'contains':
        const container = getValue(condition.path!, state);
        return Array.isArray(container) && container.includes(condition.value);
      case 'and':
        return (condition as AndCondition).conditions.every(c => 
          EdgeConditionResult.evaluate(c as EdgeCondition, state)
        );
      case 'or':
        return (condition as OrCondition).conditions.some(c => 
          EdgeConditionResult.evaluate(c as EdgeCondition, state)
        );
      case 'not':
        return !EdgeConditionResult.evaluate(
          (condition as NotCondition).condition as EdgeCondition, 
          state
        );
      case 'some':
        const someArray = getValue(condition.path!, state);
        return Array.isArray(someArray) && 
          someArray.some(item => EdgeConditionResult.evaluate(
            (condition as SomeCondition).condition as EdgeCondition, 
            {...state, ...item}
          ));
      case 'every':
        const everyArray = getValue(condition.path!, state);
        return Array.isArray(everyArray) && 
          everyArray.every(item => EdgeConditionResult.evaluate(
            (condition as EveryCondition).condition as EdgeCondition, 
            {...state, ...item}
          ));
      default:
        return false;
    }
  }
}

describe('Core Utils Integration', () => {
  let testEnv: any;
  let performanceTracker: PerformanceTracker;
  
  beforeAll(async () => {
    // Set up the test environment with all services
    testEnv = await setupTestEnvironment();
  });
  
  afterAll(async () => {
    // Clean up after tests
    await cleanupTestEnvironment();
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
    performanceTracker = new PerformanceTracker();
  });
  
  test('should use edge condition utility functions correctly', async () => {
    // Create test state
    const errorState = { status: AgentStatus.ERROR, message: 'Something went wrong' };
    const readyState = { status: AgentStatus.READY, data: { count: 5 } };
    const executingState = { status: AgentStatus.EXECUTING, task: 'processing' };
    
    // Test hasError function
    expect(hasError(errorState)).toBe(true);
    expect(hasError(readyState)).toBe(false);
    
    // Test isReady function
    expect(isReady(readyState)).toBe(true);
    expect(isReady(errorState)).toBe(false);
    
    // Test isExecuting function
    expect(isExecuting(executingState)).toBe(true);
    expect(isExecuting(readyState)).toBe(false);
    
    // Test hasProperty function
    const hasMessage = hasProperty('message');
    expect(hasMessage(errorState)).toBe(true);
    expect(hasMessage(readyState)).toBe(false);
    
    // Test hasMoreChunks function
    const stateWithChunks = {
      chunks: ['chunk1', 'chunk2', 'chunk3'],
      currentChunkIndex: 1
    };
    expect(hasMoreChunks(stateWithChunks)).toBe(true);
    
    const stateWithoutMoreChunks = {
      chunks: ['chunk1', 'chunk2'],
      currentChunkIndex: 2  // Index equal to length, no more chunks to process
    };
    expect(hasMoreChunks(stateWithoutMoreChunks)).toBe(false);
    
    // Test routeOnError function
    const router = routeOnError('error-node', 'success-node');
    expect(router(errorState)).toBe('error-node');
    expect(router(readyState)).toBe('success-node');
    
    // Test routeIf function
    const customRouter = routeIf(
      state => state.data && state.data.count > 3,
      'high-count-node',
      'low-count-node'
    );
    expect(customRouter(readyState)).toBe('high-count-node');
    expect(customRouter({ data: { count: 2 } })).toBe('low-count-node');
    
    // Test routeIfHasItems function
    const itemsRouter = routeIfHasItems('items', 'has-items-node', 'no-items-node');
    expect(itemsRouter({ items: [1, 2, 3] })).toBe('has-items-node');
    expect(itemsRouter({ items: [] })).toBe('no-items-node');
    
    // Test routeIfHasMinItems function
    const minItemsRouter = routeIfHasMinItems('items', 3, 'enough-items-node', 'not-enough-items-node');
    expect(minItemsRouter({ items: [1, 2, 3] })).toBe('enough-items-node');
    expect(minItemsRouter({ items: [1, 2] })).toBe('not-enough-items-node');
  });
  
  test('should evaluate simple edge conditions correctly', async () => {
    // Create test data
    const state = {
      data: {
        count: 5,
        status: 'active',
        items: ['apple', 'banana', 'orange'],
        nested: {
          value: true
        }
      }
    };
    
    // Start performance tracking
    performanceTracker.start();
    
    // Create a simple equality condition
    const equalityCondition: EdgeCondition = {
      type: 'equals',
      path: 'data.count',
      value: 5
    };
    
    // Evaluate the condition
    const equalityResult = EdgeConditionResult.evaluate(equalityCondition, state);
    
    // Measure the evaluation
    performanceTracker.measure('equality-evaluation', () => {
      const result = EdgeConditionResult.evaluate(equalityCondition, state);
      expect(result).toBe(true);
    });
    
    // Verify the result
    expect(equalityResult).toBe(true);
    
    // Create a greater than condition
    const greaterThanCondition: EdgeCondition = {
      type: 'greaterThan',
      path: 'data.count',
      value: 3
    };
    
    // Evaluate the condition
    const greaterThanResult = EdgeConditionResult.evaluate(greaterThanCondition, state);
    
    // Measure the evaluation
    performanceTracker.measure('greater-than-evaluation', () => {
      const result = EdgeConditionResult.evaluate(greaterThanCondition, state);
      expect(result).toBe(true);
    });
    
    // Verify the result
    expect(greaterThanResult).toBe(true);
    
    // Create a contains condition
    const containsCondition: EdgeCondition = {
      type: 'contains',
      path: 'data.items',
      value: 'banana'
    };
    
    // Evaluate the condition
    const containsResult = EdgeConditionResult.evaluate(containsCondition, state);
    
    // Measure the evaluation
    performanceTracker.measure('contains-evaluation', () => {
      const result = EdgeConditionResult.evaluate(containsCondition, state);
      expect(result).toBe(true);
    });
    
    // Verify the result
    expect(containsResult).toBe(true);
    
    // End performance tracking
    performanceTracker.end();
    performanceTracker.logResults();
  });
  
  test('should evaluate complex nested edge conditions correctly', async () => {
    // Create more complex test data
    const state = {
      tasks: [
        { id: 'task1', completed: true, priority: 'high' },
        { id: 'task2', completed: false, priority: 'medium' },
        { id: 'task3', completed: false, priority: 'high' }
      ],
      progress: {
        percentage: 33,
        status: 'in_progress',
        metrics: {
          timeSpent: 120,
          estimatedCompletion: '2023-12-31'
        }
      }
    };
    
    // Start performance tracking
    performanceTracker.start();
    
    // Create a complex AND condition
    const complexAndCondition: EdgeCondition = {
      type: 'and',
      conditions: [
        {
          type: 'greaterThan',
          path: 'progress.percentage',
          value: 20
        },
        {
          type: 'equals',
          path: 'progress.status',
          value: 'in_progress'
        }
      ]
    };
    
    // Evaluate the AND condition
    const andResult = EdgeConditionResult.evaluate(complexAndCondition, state);
    
    // Measure the evaluation
    performanceTracker.measure('and-evaluation', () => {
      const result = EdgeConditionResult.evaluate(complexAndCondition, state);
      expect(result).toBe(true);
    });
    
    // Verify the result
    expect(andResult).toBe(true);
    
    // Create a complex OR condition
    const complexOrCondition: EdgeCondition = {
      type: 'or',
      conditions: [
        {
          type: 'equals',
          path: 'progress.percentage',
          value: 100 // This will be false
        },
        {
          type: 'lessThan',
          path: 'progress.metrics.timeSpent',
          value: 200 // This will be true
        }
      ]
    };
    
    // Evaluate the OR condition
    const orResult = EdgeConditionResult.evaluate(complexOrCondition, state);
    
    // Measure the evaluation
    performanceTracker.measure('or-evaluation', () => {
      const result = EdgeConditionResult.evaluate(complexOrCondition, state);
      expect(result).toBe(true);
    });
    
    // Verify the result
    expect(orResult).toBe(true);
    
    // Create a complex NOT condition
    const notCondition: EdgeCondition = {
      type: 'not',
      condition: {
        type: 'equals',
        path: 'progress.status',
        value: 'completed'
      }
    };
    
    // Evaluate the NOT condition
    const notResult = EdgeConditionResult.evaluate(notCondition, state);
    
    // Measure the evaluation
    performanceTracker.measure('not-evaluation', () => {
      const result = EdgeConditionResult.evaluate(notCondition, state);
      expect(result).toBe(true);
    });
    
    // Verify the result
    expect(notResult).toBe(true);
    
    // End performance tracking
    performanceTracker.end();
    performanceTracker.logResults();
  });
  
  test('should evaluate conditions on array elements', async () => {
    // Create test data with arrays
    const state = {
      agents: [
        { id: 'agent1', status: 'active', capability: 'analysis' },
        { id: 'agent2', status: 'idle', capability: 'extraction' },
        { id: 'agent3', status: 'active', capability: 'summarization' }
      ],
      metrics: {
        agentUtilization: [0.8, 0.2, 0.9],
        overallScore: 0.7
      }
    };
    
    // Start performance tracking
    performanceTracker.start();
    
    // Create a condition that checks if any agent is idle
    const anyIdleCondition: EdgeCondition = {
      type: 'some',
      path: 'agents',
      condition: {
        type: 'equals',
        path: 'status',
        value: 'idle'
      }
    };
    
    // Evaluate the condition
    const anyIdleResult = EdgeConditionResult.evaluate(anyIdleCondition, state);
    
    // Measure the evaluation
    performanceTracker.measure('some-evaluation', () => {
      const result = EdgeConditionResult.evaluate(anyIdleCondition, state);
      expect(result).toBe(true);
    });
    
    // Verify the result
    expect(anyIdleResult).toBe(true);
    
    // Create a condition that checks if all agents are active
    const allActiveCondition: EdgeCondition = {
      type: 'every',
      path: 'agents',
      condition: {
        type: 'equals',
        path: 'status',
        value: 'active'
      }
    };
    
    // Evaluate the condition
    const allActiveResult = EdgeConditionResult.evaluate(allActiveCondition, state);
    
    // Measure the evaluation
    performanceTracker.measure('every-evaluation', () => {
      const result = EdgeConditionResult.evaluate(allActiveCondition, state);
      expect(result).toBe(false);
    });
    
    // Verify the result (should be false because agent2 is idle)
    expect(allActiveResult).toBe(false);
    
    // Create a condition that checks if the agent utilization is above a threshold
    const utilizationCondition: EdgeCondition = {
      type: 'greaterThan',
      path: 'metrics.overallScore',
      value: 0.5
    };
    
    // Evaluate the condition
    const utilizationResult = EdgeConditionResult.evaluate(utilizationCondition, state);
    
    // Measure the evaluation
    performanceTracker.measure('utilization-evaluation', () => {
      const result = EdgeConditionResult.evaluate(utilizationCondition, state);
      expect(result).toBe(true);
    });
    
    // Verify the result
    expect(utilizationResult).toBe(true);
    
    // End performance tracking
    performanceTracker.end();
    performanceTracker.logResults();
  });
}); 