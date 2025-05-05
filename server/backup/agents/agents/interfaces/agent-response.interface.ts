/**
 * Enhanced agent response types
 *
 * Extends the base agent response interface with metacognitive capabilities
 */

import { AgentResponse } from './base-agent.interface';
import { ConfidenceLevel } from './metacognition.interface';

/**
 * Agent response with metacognitive capabilities
 */
export interface MetacognitiveAgentResponse extends AgentResponse {
  /**
   * Error type classification
   */
  errorType?: string;

  /**
   * Reflection insights from metacognitive processing
   */
  reflection?: {
    insight: string;
    confidence: ConfidenceLevel;
  };

  /**
   * Strategy revision information when a strategy was revised
   */
  revisionStrategy?: {
    name: string;
    description: string;
    steps: string[];
    estimatedSuccess: number;
  };
}
