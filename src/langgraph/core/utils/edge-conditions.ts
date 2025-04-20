/**
 * Edge condition utility functions for LangGraph state transitions
 */

import { AgentStatus } from '../state/base-agent-state';

/**
 * Checks if an error occurred in the previous state
 */
export function hasError(state: any): boolean {
  return state.status === AgentStatus.ERROR;
}

/**
 * Checks if the state is ready to proceed to the next step
 */
export function isReady(state: any): boolean {
  return state.status === AgentStatus.READY;
}

/**
 * Checks if the state is currently executing
 */
export function isExecuting(state: any): boolean {
  return state.status === AgentStatus.EXECUTING;
}

/**
 * Checks if a property exists and is truthy in the state
 */
export function hasProperty(propertyName: string) {
  return (state: any): boolean => {
    return !!state[propertyName];
  };
}

/**
 * Checks if more chunks remain to be processed
 */
export function hasMoreChunks(state: any): boolean {
  return (
    state.chunks &&
    state.currentChunkIndex !== undefined &&
    state.currentChunkIndex < state.chunks.length
  );
}

/**
 * Routes based on error status, with a target for errors and a different target for non-errors
 */
export function routeOnError(errorTarget: string, successTarget: string) {
  return (state: any): string => {
    return state.status === AgentStatus.ERROR ? errorTarget : successTarget;
  };
}

/**
 * Routes to different targets based on a custom condition
 */
export function routeIf(
  condition: (state: any) => boolean,
  trueTarget: string,
  falseTarget: string,
) {
  return (state: any): string => {
    return condition(state) ? trueTarget : falseTarget;
  };
}

/**
 * Routes to a specific target if the state has a non-empty array property
 */
export function routeIfHasItems(
  propertyName: string,
  hasItemsTarget: string,
  noItemsTarget: string,
) {
  return (state: any): string => {
    return Array.isArray(state[propertyName]) && state[propertyName].length > 0
      ? hasItemsTarget
      : noItemsTarget;
  };
}

/**
 * Routes to a specific target if a minimum number of items exists in an array property
 */
export function routeIfHasMinItems(
  propertyName: string,
  minCount: number,
  hasMinItemsTarget: string,
  notEnoughItemsTarget: string,
) {
  return (state: any): string => {
    return Array.isArray(state[propertyName]) &&
      state[propertyName].length >= minCount
      ? hasMinItemsTarget
      : notEnoughItemsTarget;
  };
}
