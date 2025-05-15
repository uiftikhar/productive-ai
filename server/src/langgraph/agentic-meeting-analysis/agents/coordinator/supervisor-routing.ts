import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Routing decision from the supervisor
 */
export interface SupervisorDecision {
  nextAction: string;
  reasoning: string;
  priority?: number;
  additionalContext?: any;
}

/**
 * Router schema for structured routing decisions
 */
const routerSchema = z.object({
  reasoning: z.string().describe('Detailed reasoning about the routing decision and why this is the best next step'),
  next_action: z.enum([
    'TOPIC_ANALYSIS',
    'ACTION_ITEM_EXTRACTION',
    'SUMMARY_GENERATION',
    'SENTIMENT_ANALYSIS',
    'PARTICIPANT_DYNAMICS',
    'DECISION_TRACKING',
    'CONTEXT_INTEGRATION',
    'FINISH'
  ]).describe('The next action or analysis step that should be performed')
});

/**
 * Create a structured context for routing decisions
 */
export function createRoutingContext(
  completedTasks: any[],
  pendingTasks: any[],
  progress: number,
  currentFocus?: string,
  lastMessage?: any
): any {
  return {
    completedTasks,
    pendingTasks,
    progress,
    currentFocus,
    lastMessage
  };
}

/**
 * Format prompt for the routing decision
 */
export function formatRoutingPrompt(context: any): string {
  return `
You are the supervisor agent in a hierarchical analysis system. Your job is to decide which team should work next.

Current Status:
- Overall progress: ${context.progress}%
- Completed tasks: ${context.completedTasks.length}
- Pending tasks: ${context.pendingTasks.length}
${context.currentFocus ? `- Current focus area: ${context.currentFocus}` : ''}

Completed Tasks:
${context.completedTasks.length > 0 
  ? context.completedTasks.map((task: any) => 
      `- ${task.type}: ${JSON.stringify(task.output || {}).substring(0, 100)}...`
    ).join('\n') 
  : '- None yet'}

Pending Tasks:
${context.pendingTasks.length > 0 
  ? context.pendingTasks.map((task: any) => 
      `- ${task.type} (priority: ${task.priority})`
    ).join('\n') 
  : '- None'}

${context.lastMessage 
  ? `Last message from ${context.lastMessage.sender}: ${JSON.stringify(context.lastMessage.content)}` 
  : ''}

Based on this context, decide which team should act next:
- TOPIC_ANALYSIS: Analyzes the main topics and themes in the transcript
- ACTION_ITEM_EXTRACTION: Identifies action items, tasks, and owners
- SUMMARY_GENERATION: Creates summary of key points and discussions
- SENTIMENT_ANALYSIS: Analyzes emotional tone and sentiment
- PARTICIPANT_DYNAMICS: Examines speaker interactions and participation
- DECISION_TRACKING: Identifies and tracks decisions being made
- CONTEXT_INTEGRATION: Integrates external context with discussion
- FINISH: Complete the analysis process

Use the supervisor_route_decision tool to specify your choice with detailed reasoning.
`;
}

/**
 * Supervisor routing tool for structured decision making
 */
export class SupervisorRoutingTool extends StructuredTool {
  name = 'supervisor_route_decision';
  description = 'Determine the next analysis step or team that should act based on current context';
  schema = routerSchema;
  logger: Logger;

  constructor(
    logger?: Logger,
    private callback?: (decision: SupervisorDecision) => void
  ) {
    super();
    this.logger = logger || new ConsoleLogger();
  }

  async _call(input: z.infer<typeof routerSchema>): Promise<string> {
    this.logger.info(`Supervisor routing tool called with input: ${JSON.stringify(input, null, 2)}`);
    
    // Extract values with proper snake_case to camelCase conversion
    const decision: SupervisorDecision = {
      nextAction: input.next_action,
      reasoning: input.reasoning
    };
    
    this.logger.info(`Routing decision made: ${decision.nextAction} - Reasoning: ${decision.reasoning}`);
    
    // Call the provided callback with the decision
    if (this.callback) {
      try {
        this.callback(decision);
        this.logger.info(`Callback executed successfully for routing decision: ${decision.nextAction}`);
      } catch (error) {
        this.logger.error(`Error in routing callback: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      this.logger.warn('No callback provided for routing decision');
    }
    
    return `Routing decision: ${decision.nextAction}. Reasoning: ${decision.reasoning}`;
  }
} 