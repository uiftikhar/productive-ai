/**
 * Tool Executor Service for safe tool execution with validation and error handling
 * Part of Milestone 2.1: Tool Integration Enhancement
 */
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  Tool,
  ToolExecutionStatus,
  ToolExecutionResult,
  ToolExecutionContext,
  ToolUsageLogEntry
} from './tool.interface';
import { ToolRegistryService } from './tool-registry.service';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Error thrown when validation fails
 */
export class ToolValidationError extends Error {
  constructor(
    message: string,
    public readonly validationErrors: z.ZodError | null = null,
    public readonly toolName: string
  ) {
    super(message);
    this.name = 'ToolValidationError';
  }
}

/**
 * Error thrown when tool execution fails
 */
export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public readonly originalError: Error | null = null,
    public readonly toolName: string
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

/**
 * Options for tool execution
 */
export interface ToolExecutionOptions {
  abortSignal?: AbortSignal;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number; // milliseconds
  requestId?: string;
  sessionId?: string;
  agentId?: string;
  userId?: string;
  metadata?: Record<string, any>;
  parentExecutionId?: string;
  skipFallback?: boolean;
  skipLogging?: boolean;
  cacheResults?: boolean;
}

/**
 * Result with cache status
 */
interface CachedResult<T> {
  result: T;
  fromCache: boolean;
}

/**
 * Tool Executor Service handles execution of tools with
 * validation, error handling, retries, and fallbacks
 */
export class ToolExecutorService {
  private logger: Logger;
  private registry: ToolRegistryService;
  private resultCache: Map<string, { result: any; timestamp: number }> = new Map();
  private usageLog: ToolUsageLogEntry[] = [];
  private pendingExecutions: Map<string, AbortController> = new Map();

  /**
   * Create a new tool executor service
   */
  constructor(
    toolRegistry: ToolRegistryService,
    logger?: Logger
  ) {
    this.registry = toolRegistry;
    this.logger = logger || new ConsoleLogger();
  }

  /**
   * Execute a tool by name with validation and error handling
   */
  async executeTool<InputSchema extends z.ZodTypeAny, OutputSchema extends z.ZodTypeAny, InputType = z.infer<InputSchema>, OutputType = z.infer<OutputSchema>>(
    toolName: string,
    input: InputType,
    options: ToolExecutionOptions = {}
  ): Promise<ToolExecutionResult<OutputType>> {
    // Get the tool from registry
    const tool = this.registry.getTool<InputSchema, OutputSchema>(toolName);
    
    if (!tool) {
      return this.createErrorResult(
        `Tool "${toolName}" not found in registry`,
        options
      );
    }
    
    // Check if tool is enabled
    if (!tool.config.enabled) {
      return this.createErrorResult(
        `Tool "${toolName}" is disabled`,
        options
      );
    }
    
    // Generate execution ID
    const executionId = uuidv4();
    
    // Try to get from cache if applicable
    if (tool.config.cacheable && options.cacheResults !== false) {
      const cachedResult = this.getFromCache<OutputType>(toolName, input);
      if (cachedResult) {
        const result = {
          ...cachedResult.result,
          cached: true
        };
        
        // Log usage if not explicitly skipped
        if (!options.skipLogging) {
          this.logToolUsage({
            toolName,
            executionId,
            status: result.status,
            startTime: result.startTime,
            endTime: result.endTime,
            executionTime: result.executionTime,
            agentId: options.agentId,
            userId: options.userId,
            sessionId: options.sessionId,
            cached: true,
            metadata: {
              ...options.metadata,
              fromCache: true
            }
          });
        }
        
        return result;
      }
    }
    
    // Create abortion controller for this execution
    const abortController = new AbortController();
    const signal = options.abortSignal || abortController.signal;
    
    // Register pending execution
    this.pendingExecutions.set(executionId, abortController);
    
    try {
      // Create execution context
      const context: ToolExecutionContext = {
        executionId,
        requestId: options.requestId,
        sessionId: options.sessionId,
        agentId: options.agentId,
        userId: options.userId,
        logger: this.logger,
        abortSignal: signal,
        startTime: new Date(),
        metadata: options.metadata,
        parentExecutionId: options.parentExecutionId
      };
      
      // Validate input against schema
      const validationResult = tool.validateInput(input);
      
      if (!validationResult.success) {
        const error = new ToolValidationError(
          `Input validation failed for tool "${toolName}"`,
          validationResult.error,
          toolName
        );
        
        return this.handleExecutionError(tool, error, input, context, options);
      }
      
      // Execute with retries if configured
      const retryCount = options.retryCount ?? tool.config.maxRetries ?? 0;
      const retryDelay = options.retryDelay ?? 1000;
      
      let lastError: Error | null = null;
      let attempt = 0;
      
      while (attempt <= retryCount) {
        if (signal.aborted) {
          return this.createErrorResult(
            `Tool "${toolName}" execution aborted`,
            options
          );
        }
        
        try {
          attempt++;
          
          // Execute the tool
          const result = await this.executeWithTimeout(
            tool,
            validationResult.data,
            context,
            options.timeout ?? tool.config.timeout
          );
          
          // If success or not retriable, return the result
          if (
            result.status === ToolExecutionStatus.SUCCESS ||
            (result.status !== ToolExecutionStatus.ERROR && result.status !== ToolExecutionStatus.PARTIAL)
          ) {
            // Store in cache if applicable
            if (
              tool.config.cacheable &&
              options.cacheResults !== false &&
              result.status === ToolExecutionStatus.SUCCESS
            ) {
              this.saveToCache(toolName, input, result, tool.config.cacheExpiration);
            }
            
            // Log usage if not explicitly skipped
            if (!options.skipLogging) {
              this.logToolUsage({
                toolName,
                executionId,
                status: result.status,
                startTime: result.startTime,
                endTime: result.endTime,
                executionTime: result.executionTime,
                agentId: options.agentId,
                userId: options.userId,
                sessionId: options.sessionId,
                inputSize: JSON.stringify(input).length,
                outputSize: result.data ? JSON.stringify(result.data).length : 0,
                metadata: options.metadata
              });
            }
            
            // Ensure type safety with explicit cast to the expected return type
            return result as ToolExecutionResult<OutputType>;
          }
          
          // Store the error for potential retry
          lastError = result.error instanceof Error ? result.error : new Error(String(result.error));
          
          // If it's the last attempt, return the result
          if (attempt > retryCount) {
            // Ensure type safety for the error result
            return result as ToolExecutionResult<OutputType>;
          }
          
          // Wait before retrying
          this.logger.debug(`Retrying tool "${toolName}" execution (attempt ${attempt}/${retryCount})`, {
            toolName,
            executionId,
            attempt,
            error: lastError.message
          });
          
          await this.delay(retryDelay);
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          // If it's the last attempt, handle the error
          if (attempt > retryCount) {
            return this.handleExecutionError(tool, lastError, input, context, options);
          }
          
          // Wait before retrying
          this.logger.debug(`Retrying tool "${toolName}" execution after error (attempt ${attempt}/${retryCount})`, {
            toolName,
            executionId,
            attempt,
            error: lastError.message
          });
          
          await this.delay(retryDelay);
        }
      }
      
      // If we get here, all retries failed
      return this.handleExecutionError(tool, lastError!, input, context, options);
    } finally {
      // Clean up pending execution
      this.pendingExecutions.delete(executionId);
    }
  }

  /**
   * Execute a tool with a timeout
   */
  private async executeWithTimeout<InputType, OutputType>(
    tool: Tool<any, any>,
    input: InputType,
    context: ToolExecutionContext,
    timeout?: number
  ): Promise<ToolExecutionResult<OutputType>> {
    if (!timeout) {
      return tool.execute(input, context);
    }
    
    // Create a promise that will resolve with the tool result or reject after the timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new Error(`Tool execution timed out after ${timeout}ms`));
      }, timeout);
    });
    
    try {
      // Race the tool execution against the timeout
      return await Promise.race([
        tool.execute(input, context),
        timeoutPromise
      ]);
    } catch (error) {
      const endTime = new Date();
      const executionTime = endTime.getTime() - context.startTime.getTime();
      
      return {
        status: ToolExecutionStatus.ERROR,
        error: error instanceof Error ? error : new Error(String(error)),
        executionTime,
        startTime: context.startTime,
        endTime
      };
    }
  }

  /**
   * Handle an execution error, potentially using a fallback
   */
  private async handleExecutionError<InputType>(
    tool: Tool<any, any>,
    error: Error,
    input: InputType,
    context: ToolExecutionContext,
    options: ToolExecutionOptions
  ): Promise<ToolExecutionResult> {
    // Log the error
    this.logger.error(`Error executing tool "${tool.config.name}"`, {
      toolName: tool.config.name,
      executionId: context.executionId,
      error: error.message,
      stack: error.stack
    });
    
    // Create the error result
    const errorResult: ToolExecutionResult = {
      status: ToolExecutionStatus.ERROR,
      error,
      executionTime: new Date().getTime() - context.startTime.getTime(),
      startTime: context.startTime,
      endTime: new Date()
    };
    
    // Log usage if not explicitly skipped
    if (!options.skipLogging) {
      this.logToolUsage({
        toolName: tool.config.name,
        executionId: context.executionId,
        status: errorResult.status,
        startTime: errorResult.startTime,
        endTime: errorResult.endTime,
        executionTime: errorResult.executionTime,
        agentId: options.agentId,
        userId: options.userId,
        sessionId: options.sessionId,
        inputSize: JSON.stringify(input).length,
        error: error.message,
        metadata: options.metadata
      });
    }
    
    // Try fallback if available and not skipped
    if (tool.config.fallbackToolName && !options.skipFallback) {
      try {
        this.logger.info(`Using fallback tool "${tool.config.fallbackToolName}" for "${tool.config.name}"`, {
          toolName: tool.config.name,
          fallbackToolName: tool.config.fallbackToolName,
          executionId: context.executionId
        });
        
        // Execute the fallback tool
        const fallbackResult = await this.executeTool(
          tool.config.fallbackToolName,
          input,
          {
            ...options,
            skipFallback: true, // Prevent infinite fallback chain
            parentExecutionId: context.executionId,
            metadata: {
              ...options.metadata,
              fallbackFor: tool.config.name
            }
          }
        );
        
        // Return the fallback result with original error info
        return {
          ...fallbackResult,
          metadata: {
            ...fallbackResult.metadata,
            originalError: {
              toolName: tool.config.name,
              message: error.message,
              fallbackUsed: true
            }
          }
        };
      } catch (fallbackError) {
        // Log the fallback error
        this.logger.error(`Fallback tool "${tool.config.fallbackToolName}" also failed`, {
          toolName: tool.config.name,
          fallbackToolName: tool.config.fallbackToolName,
          executionId: context.executionId,
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        });
      }
    }
    
    // Return the original error result
    return errorResult;
  }

  /**
   * Create an error result
   */
  private createErrorResult(
    errorMessage: string,
    options: ToolExecutionOptions
  ): ToolExecutionResult {
    const startTime = new Date();
    
    return {
      status: ToolExecutionStatus.ERROR,
      error: errorMessage,
      executionTime: 0,
      startTime,
      endTime: startTime
    };
  }

  /**
   * Log tool usage
   */
  private logToolUsage(entry: Partial<ToolUsageLogEntry>): void {
    // Create the log entry with defaults
    const logEntry: ToolUsageLogEntry = {
      toolName: entry.toolName || 'unknown',
      executionId: entry.executionId || uuidv4(),
      status: entry.status || ToolExecutionStatus.ERROR,
      startTime: entry.startTime || new Date(),
      endTime: entry.endTime || new Date(),
      executionTime: entry.executionTime || 0,
      ...entry
    };
    
    // Add to log
    this.usageLog.push(logEntry);
    
    // Limit log size (keep last 1000 entries)
    if (this.usageLog.length > 1000) {
      this.usageLog.shift();
    }
  }

  /**
   * Get recent usage logs
   */
  getUsageLogs(limit: number = 100): ToolUsageLogEntry[] {
    return this.usageLog.slice(-limit);
  }

  /**
   * Get logs for specific tool
   */
  getToolLogs(toolName: string, limit: number = 100): ToolUsageLogEntry[] {
    return this.usageLog
      .filter(entry => entry.toolName === toolName)
      .slice(-limit);
  }

  /**
   * Get execution stats for a tool
   */
  getToolStats(toolName: string): {
    executionCount: number;
    successCount: number;
    errorCount: number;
    avgExecutionTime: number;
    successRate: number;
  } {
    const logs = this.getToolLogs(toolName, 1000);
    
    if (logs.length === 0) {
      return {
        executionCount: 0,
        successCount: 0,
        errorCount: 0,
        avgExecutionTime: 0,
        successRate: 0
      };
    }
    
    const successCount = logs.filter(
      log => log.status === ToolExecutionStatus.SUCCESS
    ).length;
    
    const errorCount = logs.filter(
      log => log.status === ToolExecutionStatus.ERROR
    ).length;
    
    const totalExecutionTime = logs.reduce(
      (sum, log) => sum + log.executionTime,
      0
    );
    
    return {
      executionCount: logs.length,
      successCount,
      errorCount,
      avgExecutionTime: totalExecutionTime / logs.length,
      successRate: logs.length > 0 ? successCount / logs.length : 0
    };
  }

  /**
   * Get from cache if available and not expired
   */
  private getFromCache<T>(toolName: string, input: any): CachedResult<ToolExecutionResult<T>> | null {
    const cacheKey = this.getCacheKey(toolName, input);
    const cached = this.resultCache.get(cacheKey);
    
    if (!cached) {
      return null;
    }
    
    return {
      result: cached.result,
      fromCache: true
    };
  }

  /**
   * Save to cache
   */
  private saveToCache<T>(
    toolName: string,
    input: any,
    result: ToolExecutionResult<T>,
    cacheExpiration?: number
  ): void {
    const cacheKey = this.getCacheKey(toolName, input);
    
    this.resultCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });
    
    // Set up cache cleanup if expiration is set
    if (cacheExpiration) {
      setTimeout(() => {
        this.resultCache.delete(cacheKey);
      }, cacheExpiration);
    }
  }

  /**
   * Generate cache key
   */
  private getCacheKey(toolName: string, input: any): string {
    return `${toolName}:${JSON.stringify(input)}`;
  }

  /**
   * Abort a running tool execution
   */
  abortExecution(executionId: string): boolean {
    const controller = this.pendingExecutions.get(executionId);
    
    if (!controller) {
      return false;
    }
    
    controller.abort();
    return true;
  }

  /**
   * Wait for a specified time
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up expired cache entries
   */
  cleanCache(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, { timestamp, result }] of this.resultCache.entries()) {
      // Get the original tool to check its cache expiration
      const toolName = key.split(':')[0];
      const tool = this.registry.getTool(toolName);
      
      if (!tool || !tool.config.cacheExpiration) {
        continue;
      }
      
      // Check if expired
      if (now - timestamp > tool.config.cacheExpiration) {
        this.resultCache.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }
} 