/**
 * Supervisor Routing Implementation for Hierarchical Agents
 * 
 * This module provides structured routing tools for supervisor agents to make decisions
 * about which agent or team should process next in the LangGraph workflow.
 */
import { z } from 'zod';
import { StructuredTool } from '@langchain/core/tools';
import { Logger } from '../../../../shared/logger/logger.interface';

/**
 * The supervisor decision schema using Zod for validation
 */
export const supervisorDecisionSchema = z.object({
  reasoning: z.string().describe('Detailed reasoning for the routing decision'),
  nextAction: z.enum([
    'TOPIC_ANALYSIS',
    'ACTION_ITEM_EXTRACTION',
    'DECISION_TRACKING',
    'SUMMARY_GENERATION',
    'SENTIMENT_ANALYSIS',
    'PARTICIPANT_DYNAMICS',
    'CONTEXT_INTEGRATION',
    'FINISH'
  ]).describe('The next action or agent type that should process'),
  priorityLevel: z.number().min(1).max(5).describe('Priority level (1-5, where 1 is highest)'),
  additionalInstructions: z.string().optional().describe('Additional instructions for the next agent')
});

/**
 * Type definition for the supervisor decision
 */
export type SupervisorDecision = z.infer<typeof supervisorDecisionSchema>;

/**
 * A structured routing tool for supervisor agents to decide the next step in the workflow
 */
export class SupervisorRoutingTool extends StructuredTool {
  name = 'supervisor_route_decision';
  description = 'Determine the next agent or action in the workflow based on the current state';
  schema = supervisorDecisionSchema;
  logger: Logger;
  
  private callback?: (decision: SupervisorDecision) => void;
  
  constructor(logger: Logger, callback?: (decision: SupervisorDecision) => void) {
    super();
    this.logger = logger;
    this.callback = callback;
  }
  
  /**
   * Execute the tool with supervisor's decision
   */
  async _call(decision: SupervisorDecision): Promise<string> {
    this.logger.info(`Supervisor routing decision: ${decision.nextAction} (priority: ${decision.priorityLevel})`);
    this.logger.debug(`Routing reasoning: ${decision.reasoning}`);
    
    if (this.callback) {
      this.callback(decision);
    }
    
    return `Decision made to route to ${decision.nextAction} with priority ${decision.priorityLevel}`;
  }
}

/**
 * Context information passed to the supervisor for routing decisions
 */
export interface RoutingContext {
  completedTasks: {
    taskId: string;
    type: string;
    status: string;
    output?: any;
  }[];
  pendingTasks: {
    taskId: string;
    type: string;
    status: string;
    priority: number;
  }[];
  currentState: {
    progress: number;
    currentFocus?: string;
    remainingTime?: number;
    detectedTopics?: string[];
  };
  lastMessage?: {
    sender: string;
    content: any;
    timestamp: number;
  };
}

/**
 * Format the routing context into a prompt for the supervisor
 */
export function formatRoutingPrompt(context: RoutingContext): string {
  return `
# Current Workflow State for Routing Decision

## Completed Tasks (${context.completedTasks.length})
${context.completedTasks.map(task => 
  `- ${task.type} (${task.taskId}): ${task.status}`
).join('\n')}

## Pending Tasks (${context.pendingTasks.length})
${context.pendingTasks.map(task => 
  `- ${task.type} (${task.taskId}): ${task.status}, Priority: ${task.priority}`
).join('\n')}

## Current State
- Progress: ${context.currentState.progress}%
- Current Focus: ${context.currentState.currentFocus || 'None specified'}
${context.currentState.remainingTime ? `- Remaining Time: ${context.currentState.remainingTime} seconds` : ''}
${context.currentState.detectedTopics ? 
  `- Detected Topics: ${context.currentState.detectedTopics.join(', ')}` : ''}

${context.lastMessage ? 
  `## Last Message\nFrom: ${context.lastMessage.sender}\nContent: ${
    typeof context.lastMessage.content === 'object' ? 
    JSON.stringify(context.lastMessage.content, null, 2) : 
    context.lastMessage.content
  }\nTimestamp: ${new Date(context.lastMessage.timestamp).toISOString()}` : ''}

Based on the above information, use the supervisor_route_decision tool to determine the next step in the workflow.
Consider which analysis components are most important at this stage, which teams have already completed their work,
and whether there are dependencies between outputs that need to be respected.
`;
}

/**
 * Create a routing context from state information
 */
export function createRoutingContext(
  completedTasks: any[],
  pendingTasks: any[],
  progress: number,
  currentFocus?: string,
  lastMessage?: any
): RoutingContext {
  return {
    completedTasks,
    pendingTasks,
    currentState: {
      progress,
      currentFocus,
      detectedTopics: extractTopicsFromCompletedTasks(completedTasks)
    },
    lastMessage
  };
}

/**
 * Helper function to extract topics from completed tasks
 */
function extractTopicsFromCompletedTasks(completedTasks: any[]): string[] {
  const topics: Set<string> = new Set();
  
  for (const task of completedTasks) {
    if (task.output?.topics) {
      if (Array.isArray(task.output.topics)) {
        task.output.topics.forEach((topic: string) => topics.add(topic));
      }
    }
    
    if (task.output?.content?.topics) {
      if (Array.isArray(task.output.content.topics)) {
        task.output.content.topics.forEach((topic: string) => topics.add(topic));
      }
    }
  }
  
  return Array.from(topics);
} 