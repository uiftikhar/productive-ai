/**
 * Fallback Mechanisms for Tool Execution Errors
 * Part of Milestone 2.1: Tool Integration Enhancement
 */
import { ToolExecutionStatus, ToolExecutionResult, Tool } from '../base/tool.interface';
import { ToolRegistryService } from '../base/tool-registry.service';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Fallback strategy options
 */
export enum FallbackStrategy {
  RETRY = 'retry',
  ALTERNATE_TOOL = 'alternate_tool',
  SIMPLIFIED_VERSION = 'simplified_version',
  DEFAULT_VALUE = 'default_value',
  MANUAL_RESOLUTION = 'manual_resolution'
}

/**
 * Configuration for a tool fallback
 */
export interface ToolFallbackConfig {
  toolName: string;
  fallbackToolName?: string;
  strategy: FallbackStrategy;
  maxRetries?: number;
  retryDelay?: number; // ms
  simplifiedParams?: Record<string, any>;
  defaultValue?: any;
  requireManualApproval?: boolean;
}

/**
 * Service for managing fallback strategies
 */
export class FallbackMechanismService {
  private fallbackConfigs: Map<string, ToolFallbackConfig[]> = new Map();
  private logger: Logger;
  private registry: ToolRegistryService;
  
  /**
   * Create a new fallback mechanism service
   */
  constructor(
    registry: ToolRegistryService,
    logger?: Logger
  ) {
    this.registry = registry;
    this.logger = logger || new ConsoleLogger();
  }
  
  /**
   * Register a fallback configuration for a tool
   */
  registerFallback(config: ToolFallbackConfig): void {
    const { toolName } = config;
    
    if (!this.fallbackConfigs.has(toolName)) {
      this.fallbackConfigs.set(toolName, []);
    }
    
    this.fallbackConfigs.get(toolName)!.push(config);
    
    this.logger.info(`Registered fallback for tool ${toolName}`, {
      strategy: config.strategy,
      fallbackTool: config.fallbackToolName
    });
  }
  
  /**
   * Get fallback configurations for a tool
   */
  getFallbacks(toolName: string): ToolFallbackConfig[] {
    return this.fallbackConfigs.get(toolName) || [];
  }
  
  /**
   * Handle an error using appropriate fallback mechanism
   */
  async handleError(
    toolName: string,
    error: Error,
    params: any,
    executionId: string
  ): Promise<ToolExecutionResult | null> {
    const fallbacks = this.getFallbacks(toolName);
    
    if (fallbacks.length === 0) {
      this.logger.debug(`No fallbacks configured for tool ${toolName}`);
      return null;
    }
    
    // Try each fallback in order until one succeeds
    for (const fallback of fallbacks) {
      try {
        const result = await this.executeFallback(fallback, params, error, executionId);
        
        if (result && result.status !== ToolExecutionStatus.ERROR) {
          this.logger.info(`Fallback succeeded for tool ${toolName}`, {
            strategy: fallback.strategy,
            executionId
          });
          
          return {
            ...result,
            metadata: {
              ...result.metadata,
              fallbackUsed: true,
              originalError: error.message,
              fallbackStrategy: fallback.strategy
            }
          };
        }
      } catch (fallbackError) {
        this.logger.error(`Fallback failed for tool ${toolName}`, {
          strategy: fallback.strategy,
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          executionId
        });
      }
    }
    
    // All fallbacks failed
    this.logger.warn(`All fallbacks failed for tool ${toolName}`, { executionId });
    return null;
  }
  
  /**
   * Execute a specific fallback strategy
   */
  private async executeFallback(
    config: ToolFallbackConfig,
    params: any,
    originalError: Error,
    executionId: string
  ): Promise<ToolExecutionResult | null> {
    const { toolName, strategy } = config;
    
    switch (strategy) {
      case FallbackStrategy.ALTERNATE_TOOL:
        return this.executeAlternativeTool(config, params, executionId);
        
      case FallbackStrategy.RETRY:
        return this.retryExecution(config, params, executionId);
        
      case FallbackStrategy.SIMPLIFIED_VERSION:
        return this.executeSimplifiedVersion(config, params, executionId);
        
      case FallbackStrategy.DEFAULT_VALUE:
        return this.provideDefaultValue(config, executionId);
        
      case FallbackStrategy.MANUAL_RESOLUTION:
        if (config.requireManualApproval) {
          // This would typically integrate with a UI or notification system
          this.logger.warn(`Manual resolution required for tool ${toolName}`, {
            error: originalError.message,
            executionId
          });
          return null;
        }
        return this.executeAlternativeTool(config, params, executionId);
        
      default:
        this.logger.warn(`Unknown fallback strategy: ${strategy}`);
        return null;
    }
  }
  
  /**
   * Execute an alternative tool as fallback
   */
  private async executeAlternativeTool(
    config: ToolFallbackConfig,
    params: any,
    executionId: string
  ): Promise<ToolExecutionResult | null> {
    const { toolName, fallbackToolName } = config;
    
    if (!fallbackToolName) {
      this.logger.error(`No fallback tool specified for ${toolName}`);
      return null;
    }
    
    const fallbackTool = this.registry.getTool(fallbackToolName);
    
    if (!fallbackTool) {
      this.logger.error(`Fallback tool ${fallbackToolName} not found in registry`);
      return null;
    }
    
    this.logger.info(`Executing fallback tool ${fallbackToolName} for ${toolName}`, {
      executionId
    });
    
    // Create context for execution
    const context = {
      executionId,
      logger: this.logger,
      startTime: new Date(),
      metadata: {
        fallbackFor: toolName,
        originalParams: params
      }
    };
    
    try {
      // Validate input first
      const validationResult = fallbackTool.validateInput(params);
      
      if (!validationResult.success) {
        this.logger.warn(`Fallback tool ${fallbackToolName} validation failed`, {
          errors: validationResult.error,
          executionId
        });
        return null;
      }
      
      // Execute the fallback tool
      return await fallbackTool.execute(validationResult.data, context);
    } catch (error) {
      this.logger.error(`Fallback tool ${fallbackToolName} execution failed`, {
        error: error instanceof Error ? error.message : String(error),
        executionId
      });
      return null;
    }
  }
  
  /**
   * Retry the original tool execution
   */
  private async retryExecution(
    config: ToolFallbackConfig,
    params: any,
    executionId: string
  ): Promise<ToolExecutionResult | null> {
    const { toolName, maxRetries = 3, retryDelay = 1000 } = config;
    
    const tool = this.registry.getTool(toolName);
    
    if (!tool) {
      this.logger.error(`Tool ${toolName} not found in registry`);
      return null;
    }
    
    // Create context for execution
    const context = {
      executionId,
      logger: this.logger,
      startTime: new Date(),
      metadata: {
        isRetry: true,
        retryCount: 0
      }
    };
    
    // Validate input first
    const validationResult = tool.validateInput(params);
    
    if (!validationResult.success) {
      return null;
    }
    
    // Try executing with retries
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        context.metadata.retryCount = attempt;
        
        this.logger.info(`Retrying tool ${toolName} (attempt ${attempt}/${maxRetries})`, {
          executionId
        });
        
        // Add delay between retries (except for first attempt)
        if (attempt > 1 && retryDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
        
        // Execute the tool
        const result = await tool.execute(validationResult.data, context);
        
        if (result.status !== ToolExecutionStatus.ERROR) {
          return {
            ...result,
            metadata: {
              ...result.metadata,
              retryAttempt: attempt,
              totalRetries: maxRetries
            }
          };
        }
        
        // Store error for next attempt
        lastError = result.error instanceof Error 
          ? result.error 
          : new Error(String(result.error));
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    
    this.logger.warn(`All retry attempts failed for tool ${toolName}`, {
      executionId,
      error: lastError?.message
    });
    
    return null;
  }
  
  /**
   * Execute a simplified version of the tool
   */
  private async executeSimplifiedVersion(
    config: ToolFallbackConfig,
    params: any,
    executionId: string
  ): Promise<ToolExecutionResult | null> {
    const { toolName, simplifiedParams = {} } = config;
    
    const tool = this.registry.getTool(toolName);
    
    if (!tool) {
      this.logger.error(`Tool ${toolName} not found in registry`);
      return null;
    }
    
    // Create context for execution
    const context = {
      executionId,
      logger: this.logger,
      startTime: new Date(),
      metadata: {
        isSimplifiedExecution: true
      }
    };
    
    // Combine original params with simplified overrides
    const combinedParams = {
      ...params,
      ...simplifiedParams
    };
    
    // Validate input
    const validationResult = tool.validateInput(combinedParams);
    
    if (!validationResult.success) {
      this.logger.warn(`Simplified execution validation failed for tool ${toolName}`, {
        errors: validationResult.error,
        executionId
      });
      return null;
    }
    
    try {
      this.logger.info(`Executing simplified version of tool ${toolName}`, { executionId });
      
      // Execute the tool with simplified parameters
      return await tool.execute(validationResult.data, context);
    } catch (error) {
      this.logger.error(`Simplified execution failed for tool ${toolName}`, {
        error: error instanceof Error ? error.message : String(error),
        executionId
      });
      return null;
    }
  }
  
  /**
   * Provide a default value as fallback
   */
  private provideDefaultValue(
    config: ToolFallbackConfig,
    executionId: string
  ): ToolExecutionResult {
    const { toolName, defaultValue } = config;
    
    this.logger.info(`Using default value for tool ${toolName}`, {
      executionId
    });
    
    // Create a success result with the default value
    const startTime = new Date();
    const endTime = new Date();
    
    return {
      status: ToolExecutionStatus.SUCCESS,
      data: defaultValue,
      executionTime: endTime.getTime() - startTime.getTime(),
      startTime,
      endTime,
      metadata: {
        isDefaultValue: true
      }
    };
  }
} 