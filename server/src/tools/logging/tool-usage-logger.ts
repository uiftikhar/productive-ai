/**
 * Tool Usage Logger for tracking and analyzing tool execution
 * Part of Milestone 2.1: Tool Integration Enhancement
 */
import * as fs from 'fs';
import * as path from 'path';
import { ToolUsageLogEntry, ToolExecutionStatus } from '../base/tool.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Configuration for the tool usage logger
 */
export interface ToolUsageLoggerConfig {
  logDirectory?: string;
  maxInMemoryLogs?: number;
  logToFile?: boolean;
  logToConsole?: boolean;
  logRotationSize?: number; // in bytes
  logRetention?: number; // in days
  fileRotationPattern?: 'daily' | 'hourly' | 'size';
  logger?: Logger;
  additionalLoggers?: ToolUsageLogHandler[];
}

/**
 * Interface for a log handler
 */
export interface ToolUsageLogHandler {
  handleLog(entry: ToolUsageLogEntry): Promise<void> | void;
}

/**
 * Analytics data for tool usage
 */
export interface ToolUsageAnalytics {
  totalToolExecutions: number;
  successRate: number;
  failureRate: number;
  executionsByTool: Record<string, number>;
  averageExecutionTime: number;
  topTools: {
    name: string;
    count: number;
    successRate: number;
  }[];
  errors: {
    toolName: string;
    errorMessage: string;
    count: number;
  }[];
  cacheHitRate?: number;
  timeRange: {
    start: Date;
    end: Date;
  };
}

/**
 * Logger for tracking tool usage and performance
 */
export class ToolUsageLogger implements ToolUsageLogHandler {
  private inMemoryLogs: ToolUsageLogEntry[] = [];
  private config: Required<ToolUsageLoggerConfig>;
  private logger: Logger;
  private currentLogFile: string | null = null;
  private currentLogSize: number = 0;
  private additionalHandlers: ToolUsageLogHandler[] = [];

  /**
   * Create a new tool usage logger
   */
  constructor(config: ToolUsageLoggerConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    
    // Set default configuration
    this.config = {
      logDirectory: path.join(process.cwd(), 'logs', 'tools'),
      maxInMemoryLogs: 10000,
      logToFile: true,
      logToConsole: true,
      logRotationSize: 10 * 1024 * 1024, // 10 MB
      logRetention: 30, // 30 days
      fileRotationPattern: 'daily',
      logger: this.logger,
      additionalLoggers: config.additionalLoggers || [],
      ...config
    };
    
    // Create log directory if it doesn't exist
    if (this.config.logToFile && !fs.existsSync(this.config.logDirectory)) {
      fs.mkdirSync(this.config.logDirectory, { recursive: true });
    }
    
    // Set up additional handlers
    this.additionalHandlers = this.config.additionalLoggers;
    
    // Initialize the current log file
    if (this.config.logToFile) {
      this.setCurrentLogFile();
    }
    
    // Start log rotation cleanup
    this.scheduleLogCleanup();
  }

  /**
   * Set the current log file based on the rotation pattern
   */
  private setCurrentLogFile(): void {
    const now = new Date();
    let logFileName: string;
    
    switch (this.config.fileRotationPattern) {
      case 'hourly':
        // Format: tools_YYYY-MM-DD_HH.log
        logFileName = `tools_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}.log`;
        break;
      case 'daily':
      default:
        // Format: tools_YYYY-MM-DD.log
        logFileName = `tools_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.log`;
        break;
    }
    
    this.currentLogFile = path.join(this.config.logDirectory, logFileName);
    
    // Check if the file exists and get its size
    if (fs.existsSync(this.currentLogFile)) {
      const stats = fs.statSync(this.currentLogFile);
      this.currentLogSize = stats.size;
      
      // If size-based rotation is enabled and the current file is too large, create a new one
      if (this.config.fileRotationPattern === 'size' && this.currentLogSize >= this.config.logRotationSize) {
        const timestamp = now.getTime();
        this.currentLogFile = path.join(
          this.config.logDirectory, 
          `tools_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${timestamp}.log`
        );
        this.currentLogSize = 0;
      }
    } else {
      this.currentLogSize = 0;
    }
  }

  /**
   * Schedule cleanup of old log files
   */
  private scheduleLogCleanup(): void {
    // Clean up old log files every day
    setInterval(() => {
      this.cleanupOldLogs();
    }, 24 * 60 * 60 * 1000); // 24 hours
    
    // Also run it once at startup
    this.cleanupOldLogs();
  }

  /**
   * Clean up old log files based on retention policy
   */
  private cleanupOldLogs(): void {
    if (!this.config.logToFile) {
      return;
    }
    
    try {
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - (this.config.logRetention * 24 * 60 * 60 * 1000));
      
      // Read all log files in the directory
      const files = fs.readdirSync(this.config.logDirectory);
      let cleanedCount = 0;
      
      for (const file of files) {
        if (!file.startsWith('tools_') || !file.endsWith('.log')) {
          continue;
        }
        
        // Parse the date from the file name
        const filePath = path.join(this.config.logDirectory, file);
        const stats = fs.statSync(filePath);
        
        // Check if the file is older than the retention period
        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        this.logger.info(`Cleaned up ${cleanedCount} old tool log files`);
      }
    } catch (error) {
      this.logger.error('Error cleaning up old tool log files', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Log a tool usage entry
   */
  async handleLog(entry: ToolUsageLogEntry): Promise<void> {
    // Add to in-memory logs
    this.inMemoryLogs.push(entry);
    
    // Trim in-memory logs if needed
    if (this.inMemoryLogs.length > this.config.maxInMemoryLogs) {
      this.inMemoryLogs = this.inMemoryLogs.slice(-this.config.maxInMemoryLogs);
    }
    
    // Log to console if enabled
    if (this.config.logToConsole) {
      const status = entry.status === ToolExecutionStatus.SUCCESS
        ? 'SUCCESS'
        : entry.status === ToolExecutionStatus.ERROR
          ? 'ERROR'
          : entry.status;
      
      this.logger.info(`Tool: ${entry.toolName} - Status: ${status} - Time: ${entry.executionTime}ms`, {
        executionId: entry.executionId,
        toolName: entry.toolName,
        status: entry.status,
        executionTime: entry.executionTime,
        timestamp: entry.startTime
      });
      
      if (entry.status === ToolExecutionStatus.ERROR && entry.error) {
        this.logger.error(`Tool execution error: ${entry.error}`, {
          executionId: entry.executionId,
          toolName: entry.toolName
        });
      }
    }
    
    // Log to file if enabled
    if (this.config.logToFile && this.currentLogFile) {
      await this.logToFile(entry);
    }
    
    // Process with additional handlers
    for (const handler of this.additionalHandlers) {
      try {
        await handler.handleLog(entry);
      } catch (error) {
        this.logger.error('Error in additional log handler', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Log a tool usage entry to file
   */
  private async logToFile(entry: ToolUsageLogEntry): Promise<void> {
    try {
      // Check if we need to rotate the log file
      if (this.config.fileRotationPattern === 'hourly' || this.config.fileRotationPattern === 'daily') {
        this.setCurrentLogFile();
      }
      
      // Format the entry as JSON
      const logLine = JSON.stringify({
        timestamp: new Date().toISOString(),
        ...entry,
        startTime: entry.startTime.toISOString(),
        endTime: entry.endTime.toISOString()
      }) + '\n';
      
      // Write to the log file
      await fs.promises.appendFile(this.currentLogFile!, logLine);
      
      // Update current log size
      this.currentLogSize += logLine.length;
      
      // Check if we need to rotate based on size
      if (
        this.config.fileRotationPattern === 'size' && 
        this.currentLogSize >= this.config.logRotationSize
      ) {
        this.setCurrentLogFile();
      }
    } catch (error) {
      this.logger.error('Error writing to tool log file', {
        error: error instanceof Error ? error.message : String(error),
        logFile: this.currentLogFile
      });
    }
  }

  /**
   * Get recent tool usage logs
   */
  getRecentLogs(limit: number = 100): ToolUsageLogEntry[] {
    return this.inMemoryLogs.slice(-limit);
  }

  /**
   * Get logs for a specific tool
   */
  getToolLogs(toolName: string, limit: number = 100): ToolUsageLogEntry[] {
    return this.inMemoryLogs
      .filter(entry => entry.toolName === toolName)
      .slice(-limit);
  }

  /**
   * Get logs by session ID
   */
  getSessionLogs(sessionId: string): ToolUsageLogEntry[] {
    return this.inMemoryLogs.filter(entry => entry.sessionId === sessionId);
  }

  /**
   * Get logs by agent ID
   */
  getAgentLogs(agentId: string, limit: number = 100): ToolUsageLogEntry[] {
    return this.inMemoryLogs
      .filter(entry => entry.agentId === agentId)
      .slice(-limit);
  }

  /**
   * Get tool usage analytics
   */
  getToolUsageAnalytics(timeRange?: { start: Date; end: Date }): ToolUsageAnalytics {
    // Filter logs by time range if provided
    let logs = this.inMemoryLogs;
    if (timeRange) {
      logs = logs.filter(entry => 
        entry.startTime >= timeRange.start && 
        entry.startTime <= timeRange.end
      );
    }
    
    // Find actual time range
    const startTime = logs.length > 0
      ? new Date(Math.min(...logs.map(entry => entry.startTime.getTime())))
      : new Date();
    
    const endTime = logs.length > 0
      ? new Date(Math.max(...logs.map(entry => entry.endTime.getTime())))
      : new Date();
    
    // Count executions by tool
    const executionsByTool: Record<string, number> = {};
    const successesByTool: Record<string, number> = {};
    const failuresByTool: Record<string, number> = {};
    const executionTimesByTool: Record<string, number[]> = {};
    const errorsByTool: Record<string, Record<string, number>> = {};
    let cacheHits = 0;
    
    for (const entry of logs) {
      const { toolName, status, executionTime } = entry;
      
      // Count by tool
      executionsByTool[toolName] = (executionsByTool[toolName] || 0) + 1;
      
      // Track execution time
      if (!executionTimesByTool[toolName]) {
        executionTimesByTool[toolName] = [];
      }
      executionTimesByTool[toolName].push(executionTime);
      
      // Count success/failure
      if (status === ToolExecutionStatus.SUCCESS) {
        successesByTool[toolName] = (successesByTool[toolName] || 0) + 1;
      } else if (status === ToolExecutionStatus.ERROR) {
        failuresByTool[toolName] = (failuresByTool[toolName] || 0) + 1;
        
        // Track errors
        if (!errorsByTool[toolName]) {
          errorsByTool[toolName] = {};
        }
        
        const errorMessage = entry.error || 'Unknown error';
        errorsByTool[toolName][errorMessage] = (errorsByTool[toolName][errorMessage] || 0) + 1;
      }
      
      // Track cache hits
      if (entry.metadata?.fromCache) {
        cacheHits++;
      }
    }
    
    // Calculate top tools
    const topTools = Object.keys(executionsByTool)
      .map(toolName => ({
        name: toolName,
        count: executionsByTool[toolName] || 0,
        successRate: (successesByTool[toolName] || 0) / (executionsByTool[toolName] || 1)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Calculate errors
    const errors = Object.entries(errorsByTool)
      .flatMap(([toolName, errors]) => 
        Object.entries(errors).map(([errorMessage, count]) => ({
          toolName,
          errorMessage,
          count
        }))
      )
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    
    // Calculate total stats
    const totalExecutions = logs.length;
    const successCount = Object.values(successesByTool).reduce((sum, count) => sum + count, 0);
    const failureCount = Object.values(failuresByTool).reduce((sum, count) => sum + count, 0);
    const allExecutionTimes = logs.map(entry => entry.executionTime);
    const averageExecutionTime = allExecutionTimes.length > 0
      ? allExecutionTimes.reduce((sum, time) => sum + time, 0) / allExecutionTimes.length
      : 0;
    
    // Create analytics object
    return {
      totalToolExecutions: totalExecutions,
      successRate: totalExecutions > 0 ? successCount / totalExecutions : 0,
      failureRate: totalExecutions > 0 ? failureCount / totalExecutions : 0,
      executionsByTool,
      averageExecutionTime,
      topTools,
      errors,
      cacheHitRate: totalExecutions > 0 ? cacheHits / totalExecutions : 0,
      timeRange: {
        start: startTime,
        end: endTime
      }
    };
  }
} 