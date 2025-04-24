// Utility functions for working with agent responses

import { AgentResponse } from '../interfaces/base-agent.interface';

/**
 * Ensures that an AgentResponse object has the required success property.
 * If success is already defined, it returns the original object.
 * If not, it adds success:true by default.
 * 
 * This is useful for backward compatibility with code that didn't include
 * the success property in AgentResponse objects.
 * 
 * @param response Partial AgentResponse object
 * @returns Complete AgentResponse with success property
 */
export function ensureAgentResponse(response: Partial<AgentResponse>): AgentResponse {
  // If success is already set, return as is
  if (typeof response.success === 'boolean') {
    return response as AgentResponse;
  }
  
  // Determine default success value based on error presence
  const defaultSuccess = !response.error;
  
  // Return a new object with success added
  return {
    ...response,
    success: defaultSuccess,
  } as AgentResponse;
}

/**
 * Creates a successful agent response
 * 
 * @param output Response output
 * @param additionalProperties Additional properties to include
 * @returns Complete AgentResponse
 */
export function successResponse(output: string, additionalProperties: Partial<AgentResponse> = {}): AgentResponse {
  return {
    success: true,
    output,
    ...additionalProperties,
  };
}

/**
 * Creates an error agent response
 * 
 * @param error Error message
 * @param additionalProperties Additional properties to include
 * @returns Complete AgentResponse
 */
export function errorResponse(error: string, additionalProperties: Partial<AgentResponse> = {}): AgentResponse {
  return {
    success: false,
    error,
    ...additionalProperties,
  };
} 