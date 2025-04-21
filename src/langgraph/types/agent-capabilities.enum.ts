/**
 * Enum defining standard capabilities that agents can advertise
 * These capabilities are used for agent selection, task delegation, and context filtering
 */
export enum AgentCapabilities {
  // Core capabilities
  TEXT_GENERATION = 'text-generation',
  PLANNING = 'planning',
  REASONING = 'reasoning',
  MEMORY_MANAGEMENT = 'memory-management',
  RAG = 'retrieval-augmented-generation',

  // History and context awareness
  HISTORY_AWARE = 'history-aware',
  CONTEXT_AWARE = 'context-aware',
  STATEFUL = 'stateful',

  // Specialized capabilities
  CONTENT_GENERATION = 'content-generation',
  CODE_GENERATION = 'code-generation',
  CODE_REVIEW = 'code-review',
  DATA_ANALYSIS = 'data-analysis',
  SUMMARIZATION = 'summarization',

  // Task coordination
  TASK_PLANNING = 'task-planning',
  TASK_DELEGATION = 'task-delegation',
  TASK_MONITORING = 'task-monitoring',
  TASK_EVALUATION = 'task-evaluation',

  // Advanced reasoning
  MATHEMATICAL_REASONING = 'mathematical-reasoning',
  LOGICAL_REASONING = 'logical-reasoning',
  PATTERN_RECOGNITION = 'pattern-recognition',

  // Communication capabilities
  COMMUNICATION = 'communication',
  MULTI_AGENT_COMMUNICATION = 'multi-agent-communication',
  USER_INTERACTION = 'user-interaction',

  // Meta capabilities
  META_LEARNING = 'meta-learning',
  SELF_REFLECTION = 'self-reflection',
  SELF_CORRECTION = 'self-correction',

  // System integration
  TOOL_USE = 'tool-use',
  API_INTEGRATION = 'api-integration',
  EXTERNAL_SERVICE_ACCESS = 'external-service-access',
  DATABASE_ACCESS = 'database-access',
}

/**
 * Mapping of capability enums to human-readable descriptions
 */
export const AgentCapabilityDescriptions: Record<AgentCapabilities, string> = {
  [AgentCapabilities.TEXT_GENERATION]:
    'Generate natural language text based on prompts and context',
  [AgentCapabilities.PLANNING]:
    'Create structured plans and break down complex tasks into steps',
  [AgentCapabilities.REASONING]:
    'Apply logical reasoning to solve problems and make decisions',
  [AgentCapabilities.MEMORY_MANAGEMENT]:
    'Store, retrieve, and manage information over time',
  [AgentCapabilities.RAG]:
    'Enhance generation with retrieved information from documents and knowledge bases',

  [AgentCapabilities.HISTORY_AWARE]:
    'Access and utilize conversation history for context',
  [AgentCapabilities.CONTEXT_AWARE]:
    'Maintain awareness of the broader context of interactions',
  [AgentCapabilities.STATEFUL]:
    'Maintain and update internal state across interactions',

  [AgentCapabilities.CONTENT_GENERATION]:
    'Generate specific types of content like articles, stories, or marketing copy',
  [AgentCapabilities.CODE_GENERATION]:
    'Generate code in various programming languages',
  [AgentCapabilities.CODE_REVIEW]: 'Review and provide feedback on code',
  [AgentCapabilities.DATA_ANALYSIS]:
    'Analyze and interpret structured and unstructured data',
  [AgentCapabilities.SUMMARIZATION]:
    'Create concise summaries of longer content',

  [AgentCapabilities.TASK_PLANNING]:
    'Plan and organize tasks based on requirements',
  [AgentCapabilities.TASK_DELEGATION]:
    'Assign tasks to appropriate agents based on capabilities',
  [AgentCapabilities.TASK_MONITORING]: 'Track progress and status of tasks',
  [AgentCapabilities.TASK_EVALUATION]:
    'Evaluate the quality and completeness of task outputs',

  [AgentCapabilities.MATHEMATICAL_REASONING]:
    'Apply mathematical principles to solve problems',
  [AgentCapabilities.LOGICAL_REASONING]:
    'Apply formal logic to derive conclusions',
  [AgentCapabilities.PATTERN_RECOGNITION]:
    'Identify patterns and trends in data or behavior',

  [AgentCapabilities.COMMUNICATION]:
    'Engage in clear and effective communication',
  [AgentCapabilities.MULTI_AGENT_COMMUNICATION]:
    'Coordinate and communicate with other agents',
  [AgentCapabilities.USER_INTERACTION]: 'Interact directly with human users',

  [AgentCapabilities.META_LEARNING]:
    'Improve performance through learning from experience',
  [AgentCapabilities.SELF_REFLECTION]:
    'Analyze own performance and identify areas for improvement',
  [AgentCapabilities.SELF_CORRECTION]:
    'Correct own mistakes and improve responses',

  [AgentCapabilities.TOOL_USE]:
    'Use external tools and APIs to accomplish tasks',
  [AgentCapabilities.API_INTEGRATION]:
    'Interact with external APIs and services',
  [AgentCapabilities.EXTERNAL_SERVICE_ACCESS]:
    'Access and utilize external services and data sources',
  [AgentCapabilities.DATABASE_ACCESS]: 'Query and interact with databases',
};
