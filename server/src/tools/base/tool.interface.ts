/**
 * Tool Interface definitions with Zod schema integration
 * Part of Milestone 2.1: Tool Integration Enhancement
 */
import { z } from 'zod';
import { Logger } from '../../shared/logger/logger.interface';

/**
 * Tool execution result status
 */
export enum ToolExecutionStatus {
  SUCCESS = 'success',
  ERROR = 'error',
  PARTIAL = 'partial',
  PENDING = 'pending',
  CANCELLED = 'cancelled',
}

/**
 * Tool category for organization and discovery
 */
export enum ToolCategory {
  MEETING_ANALYSIS = 'meeting_analysis',
  KNOWLEDGE_MANAGEMENT = 'knowledge_management',
  COMMUNICATION = 'communication',
  PLANNING = 'planning',
  UTILITY = 'utility',
  VISUALIZATION = 'visualization',
  INTEGRATION = 'integration',
  CUSTOM = 'custom',
}

/**
 * Tool access level for security and permissions
 */
export enum ToolAccessLevel {
  PUBLIC = 'public',     // Available to all agents
  RESTRICTED = 'restricted', // Available to specific agents/roles
  SYSTEM = 'system',     // Only available to system components
}

/**
 * Performance metrics for tools
 */
export interface ToolPerformanceMetrics {
  executionTime: number;
  successRate: number;
  errorRate: number;
  lastExecuted: Date;
  executionCount: number;
  avgInputSize?: number;
  avgOutputSize?: number;
  cacheHitRate?: number;
}

/**
 * Base interface for a tool configuration
 */
export interface ToolConfig {
  name: string;
  description: string;
  category: ToolCategory;
  accessLevel: ToolAccessLevel;
  version: string;
  enabled: boolean;
  timeout?: number; // timeout in milliseconds
  cacheable?: boolean; // if results can be cached
  cacheExpiration?: number; // cache expiration in milliseconds
  maxRetries?: number; // number of retries on failure
  concurrencyLimit?: number; // max concurrent executions
  fallbackToolName?: string; // name of fallback tool on failure
  additionalOptions?: Record<string, any>; // custom options
}

/**
 * Result of a tool execution
 */
export interface ToolExecutionResult<T = any> {
  status: ToolExecutionStatus;
  data?: T;
  error?: Error | string;
  executionTime: number;
  startTime: Date;
  endTime: Date;
  metadata?: Record<string, any>;
  cached?: boolean;
}

/**
 * Usage log entry for a tool
 */
export interface ToolUsageLogEntry {
  toolName: string;
  executionId: string;
  status: ToolExecutionStatus;
  startTime: Date;
  endTime: Date;
  executionTime: number;
  agentId?: string;
  userId?: string;
  sessionId?: string;
  inputSchema?: string;
  inputSize?: number;
  outputSize?: number;
  error?: string;
  cached?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Base interface for all tools
 */
export interface Tool<InputSchema extends z.ZodTypeAny, OutputSchema extends z.ZodTypeAny> {
  config: ToolConfig;
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  
  /**
   * Execute the tool with validated input
   */
  execute(input: z.infer<InputSchema>, context?: ToolExecutionContext): Promise<ToolExecutionResult<z.infer<OutputSchema>>>;
  
  /**
   * Get tool metadata including schema information
   */
  getMetadata(): ToolMetadata;
  
  /**
   * Validate input against the schema
   */
  validateInput(input: any): z.SafeParseReturnType<z.infer<InputSchema>, z.infer<InputSchema>>;
  
  /**
   * Validate output against the schema
   */
  validateOutput(output: any): z.SafeParseReturnType<z.infer<OutputSchema>, z.infer<OutputSchema>>;
}

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
  executionId: string;
  requestId?: string;
  sessionId?: string;
  agentId?: string;
  userId?: string;
  logger: Logger;
  abortSignal?: AbortSignal;
  startTime: Date;
  metadata?: Record<string, any>;
  parentExecutionId?: string;
}

/**
 * Tool metadata for discovery and documentation
 */
export interface ToolMetadata {
  name: string;
  description: string;
  category: ToolCategory;
  accessLevel: ToolAccessLevel;
  version: string;
  inputSchemaDescription: Record<string, any>;
  outputSchemaDescription: Record<string, any>;
  examples?: ToolExample[];
  documentation?: string;
  deprecated?: boolean;
  deprecationNotice?: string;
  author?: string;
  tags?: string[];
}

/**
 * Tool usage example for documentation
 */
export interface ToolExample {
  description: string;
  input: Record<string, any>;
  output: Record<string, any>;
}

/**
 * Abstract base class for implementing tools
 */
export abstract class BaseTool<InputSchema extends z.ZodTypeAny, OutputSchema extends z.ZodTypeAny> 
  implements Tool<InputSchema, OutputSchema> {
  
  constructor(
    public readonly config: ToolConfig,
    public readonly inputSchema: InputSchema,
    public readonly outputSchema: OutputSchema,
    protected readonly logger: Logger
  ) {}
  
  /**
   * Abstract execute method to be implemented by concrete tools
   */
  abstract execute(
    input: z.infer<InputSchema>, 
    context?: ToolExecutionContext
  ): Promise<ToolExecutionResult<z.infer<OutputSchema>>>;
  
  /**
   * Get tool metadata
   */
  getMetadata(): ToolMetadata {
    return {
      name: this.config.name,
      description: this.config.description,
      category: this.config.category,
      accessLevel: this.config.accessLevel,
      version: this.config.version,
      // TODO Fix this empty string issue
      inputSchemaDescription: this.inputSchema.describe(''),
      outputSchemaDescription: this.outputSchema.describe(''),
    };
  }
  
  /**
   * Validate input against the schema
   */
  validateInput(input: any): z.SafeParseReturnType<z.infer<InputSchema>, z.infer<InputSchema>> {
    return this.inputSchema.safeParse(input);
  }
  
  /**
   * Validate output against the schema
   */
  validateOutput(output: any): z.SafeParseReturnType<z.infer<OutputSchema>, z.infer<OutputSchema>> {
    return this.outputSchema.safeParse(output);
  }
  
  /**
   * Helper method to create a successful result
   */
  protected createSuccessResult(
    data: z.infer<OutputSchema>,
    context: ToolExecutionContext,
    metadata?: Record<string, any>
  ): ToolExecutionResult<z.infer<OutputSchema>> {
    const endTime = new Date();
    const executionTime = endTime.getTime() - context.startTime.getTime();
    
    return {
      status: ToolExecutionStatus.SUCCESS,
      data,
      executionTime,
      startTime: context.startTime,
      endTime,
      metadata,
    };
  }
  
  /**
   * Helper method to create an error result
   */
  protected createErrorResult(
    error: Error | string,
    context: ToolExecutionContext,
    metadata?: Record<string, any>
  ): ToolExecutionResult {
    const endTime = new Date();
    const executionTime = endTime.getTime() - context.startTime.getTime();
    
    return {
      status: ToolExecutionStatus.ERROR,
      error,
      executionTime,
      startTime: context.startTime,
      endTime,
      metadata,
    };
  }
} 