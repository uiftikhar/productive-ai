/**
 * Tool Registry Service for managing and discovering tools
 * Part of Milestone 2.1: Tool Integration Enhancement
 */
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { Tool, ToolCategory, ToolAccessLevel, ToolMetadata } from './tool.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Registry search options
 */
export interface ToolRegistrySearchOptions {
  category?: ToolCategory;
  accessLevel?: ToolAccessLevel;
  namePattern?: string;
  tags?: string[];
  enabled?: boolean;
  deprecated?: boolean;
}

/**
 * Tool Registry Service for registering, discovering and managing tools
 */
export class ToolRegistryService {
  private tools: Map<string, Tool<any, any>> = new Map();
  private logger: Logger;
  private registrationEvents: Map<string, (tool: Tool<any, any>) => void> = new Map();

  /**
   * Create a new tool registry service
   */
  constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
  }

  /**
   * Register a tool in the registry
   */
  registerTool<InputSchema extends z.ZodTypeAny, OutputSchema extends z.ZodTypeAny>(
    tool: Tool<InputSchema, OutputSchema>
  ): string {
    const { name } = tool.config;
    
    if (this.tools.has(name)) {
      this.logger.warn(`Tool with name ${name} already exists. Overwriting.`);
    }
    
    this.tools.set(name, tool);
    
    // Notify subscribers about the new tool
    for (const callback of this.registrationEvents.values()) {
      try {
        callback(tool);
      } catch (error) {
        this.logger.error('Error in tool registration event handler', { error });
      }
    }
    
    this.logger.info(`Tool ${name} registered successfully`);
    return name;
  }

  /**
   * Get a tool by name
   */
  getTool<InputSchema extends z.ZodTypeAny = any, OutputSchema extends z.ZodTypeAny = any>(
    name: string
  ): Tool<InputSchema, OutputSchema> | undefined {
    return this.tools.get(name) as Tool<InputSchema, OutputSchema> | undefined;
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Unregister a tool
   */
  unregisterTool(name: string): boolean {
    if (!this.tools.has(name)) {
      return false;
    }
    
    this.tools.delete(name);
    this.logger.info(`Tool ${name} unregistered successfully`);
    return true;
  }

  /**
   * Get all registered tools
   */
  getAllTools(): Tool<any, any>[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all tool metadata for discovery and documentation
   */
  getAllToolMetadata(): ToolMetadata[] {
    return this.getAllTools().map(tool => tool.getMetadata());
  }

  /**
   * Search for tools based on criteria
   */
  searchTools(options: ToolRegistrySearchOptions = {}): Tool<any, any>[] {
    return this.getAllTools().filter(tool => {
      // Filter by category
      if (options.category && tool.config.category !== options.category) {
        return false;
      }
      
      // Filter by access level
      if (options.accessLevel && tool.config.accessLevel !== options.accessLevel) {
        return false;
      }
      
      // Filter by name pattern
      if (options.namePattern) {
        const pattern = new RegExp(options.namePattern, 'i');
        if (!pattern.test(tool.config.name)) {
          return false;
        }
      }
      
      // Filter by tags
      if (options.tags && options.tags.length > 0) {
        const metadata = tool.getMetadata();
        if (!metadata.tags || !options.tags.some(tag => metadata.tags?.includes(tag))) {
          return false;
        }
      }
      
      // Filter by enabled status
      if (options.enabled !== undefined && tool.config.enabled !== options.enabled) {
        return false;
      }
      
      // Filter by deprecated status
      if (options.deprecated !== undefined) {
        const metadata = tool.getMetadata();
        if ((metadata.deprecated || false) !== options.deprecated) {
          return false;
        }
      }
      
      return true;
    });
  }

  /**
   * Search for tools by category
   */
  getToolsByCategory(category: ToolCategory): Tool<any, any>[] {
    return this.searchTools({ category });
  }

  /**
   * Subscribe to tool registration events
   */
  subscribeToRegistrations(callback: (tool: Tool<any, any>) => void): string {
    const subscriptionId = uuidv4();
    this.registrationEvents.set(subscriptionId, callback);
    return subscriptionId;
  }

  /**
   * Unsubscribe from tool registration events
   */
  unsubscribeFromRegistrations(subscriptionId: string): boolean {
    return this.registrationEvents.delete(subscriptionId);
  }

  /**
   * Clear all tools from the registry
   */
  clearRegistry(): void {
    this.tools.clear();
    this.logger.info('Tool registry cleared');
  }

  /**
   * Get count of registered tools
   */
  getToolCount(): number {
    return this.tools.size;
  }
} 