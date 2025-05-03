import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  ConfidenceVisualization,
  ReasoningPathVisualization
} from '../../interfaces/visualization.interface';

/**
 * Implementation of the confidence visualization service
 * This service visualizes agent confidence levels over time and across decisions
 */
export class ConfidenceVisualizationImpl implements ConfidenceVisualization {
  private logger: Logger;
  private reasoningPathService: ReasoningPathVisualization;
  private confidenceRecords: Map<string, Map<string, { timestamp: Date; value: number }[]>> = new Map(); 
  // agentId -> (pathId -> confidence records)

  constructor(options: {
    logger?: Logger;
    reasoningPathService: ReasoningPathVisualization;
  }) {
    this.logger = options.logger || new ConsoleLogger();
    
    if (!options.reasoningPathService) {
      throw new Error('Confidence visualization service requires a reasoning path service');
    }
    
    this.reasoningPathService = options.reasoningPathService;
    this.logger.info('Confidence visualization service initialized');
  }

  /**
   * Record a confidence level for an agent on a specific reasoning path
   */
  recordConfidenceLevel(agentId: string, pathId: string, confidence: number): boolean {
    try {
      // Validate confidence value (0-1 scale)
      if (confidence < 0 || confidence > 1) {
        this.logger.warn(`Invalid confidence value: ${confidence} (must be between 0 and 1)`);
        return false;
      }
      
      // Check if reasoning path exists
      try {
        const path = this.reasoningPathService.getReasoningPath(pathId);
        
        // Verify agent ID matches
        if (path.agentId !== agentId) {
          this.logger.warn(`Agent ID mismatch: ${agentId} vs ${path.agentId}`);
          return false;
        }
      } catch (error) {
        this.logger.warn(`Reasoning path not found: ${pathId}`);
        return false;
      }
      
      // Initialize maps if needed
      if (!this.confidenceRecords.has(agentId)) {
        this.confidenceRecords.set(agentId, new Map());
      }
      
      const agentRecords = this.confidenceRecords.get(agentId)!;
      
      if (!agentRecords.has(pathId)) {
        agentRecords.set(pathId, []);
      }
      
      // Add confidence record
      agentRecords.get(pathId)!.push({
        timestamp: new Date(),
        value: confidence
      });
      
      this.logger.debug(`Recorded confidence level ${confidence} for agent ${agentId} on path ${pathId}`);
      
      return true;
    } catch (error) {
      this.logger.error(`Error recording confidence level:`, { error });
      return false;
    }
  }

  /**
   * Get confidence history for an agent on a specific reasoning path
   */
  getConfidenceHistory(agentId: string, pathId: string): { timestamp: Date; value: number }[] {
    const agentRecords = this.confidenceRecords.get(agentId);
    
    if (!agentRecords) {
      this.logger.debug(`No confidence records found for agent ${agentId}`);
      return [];
    }
    
    const pathRecords = agentRecords.get(pathId);
    
    if (!pathRecords) {
      this.logger.debug(`No confidence records found for path ${pathId}`);
      return [];
    }
    
    // Sort by timestamp
    return [...pathRecords].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Visualize confidence over time for a reasoning path
   */
  visualizeConfidenceOverTime(pathId: string): any {
    try {
      // Get the reasoning path
      const path = this.reasoningPathService.getReasoningPath(pathId);
      const agentId = path.agentId;
      
      // Combine confidence records from both the reasoning path and our own storage
      let confidenceRecords = [...path.confidenceOverTime];
      
      // Add additional records from our service
      const additionalRecords = this.getConfidenceHistory(agentId, pathId);
      
      // Combine and deduplicate by timestamp
      const allRecords = [...confidenceRecords, ...additionalRecords];
      const timestampMap = new Map<number, { timestamp: Date; value: number }>();
      
      for (const record of allRecords) {
        const timeKey = record.timestamp.getTime();
        timestampMap.set(timeKey, record);
      }
      
      // Convert back to array and sort
      confidenceRecords = Array.from(timestampMap.values()).sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );
      
      // Calculate rolling average and trends
      const rollingAverages: { timestamp: Date; value: number }[] = [];
      const windowSize = 3; // Size of the rolling window
      
      for (let i = 0; i < confidenceRecords.length; i++) {
        const startIdx = Math.max(0, i - windowSize + 1);
        const windowRecords = confidenceRecords.slice(startIdx, i + 1);
        const average = windowRecords.reduce((sum, record) => sum + record.value, 0) / windowRecords.length;
        
        rollingAverages.push({
          timestamp: confidenceRecords[i].timestamp,
          value: average
        });
      }
      
      // Calculate trend
      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      
      if (confidenceRecords.length >= 2) {
        const firstHalf = confidenceRecords.slice(0, Math.floor(confidenceRecords.length / 2));
        const secondHalf = confidenceRecords.slice(Math.floor(confidenceRecords.length / 2));
        
        const firstAvg = firstHalf.reduce((sum, record) => sum + record.value, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, record) => sum + record.value, 0) / secondHalf.length;
        
        const trendThreshold = 0.05;
        
        if (secondAvg - firstAvg > trendThreshold) {
          trend = 'increasing';
        } else if (firstAvg - secondAvg > trendThreshold) {
          trend = 'decreasing';
        }
      }
      
      // Calculate overall statistics
      const overallAverage = confidenceRecords.length > 0
        ? confidenceRecords.reduce((sum, record) => sum + record.value, 0) / confidenceRecords.length
        : 0;
      
      // Calculate volatility (standard deviation)
      let volatility = 0;
      
      if (confidenceRecords.length > 1) {
        const squaredDiffs = confidenceRecords.map(record => 
          Math.pow(record.value - overallAverage, 2)
        );
        const avgSquaredDiff = squaredDiffs.reduce((sum, value) => sum + value, 0) / squaredDiffs.length;
        volatility = Math.sqrt(avgSquaredDiff);
      }
      
      // Create detailed visualization object
      return {
        pathId,
        agentId,
        confidence: {
          records: confidenceRecords,
          rollingAverages,
          statistics: {
            count: confidenceRecords.length,
            average: overallAverage,
            min: Math.min(...confidenceRecords.map(r => r.value)),
            max: Math.max(...confidenceRecords.map(r => r.value)),
            trend,
            volatility
          }
        },
        taskId: path.taskId,
        timeRange: {
          start: confidenceRecords.length > 0 ? confidenceRecords[0].timestamp : null,
          end: confidenceRecords.length > 0 ? confidenceRecords[confidenceRecords.length - 1].timestamp : null
        }
      };
    } catch (error) {
      this.logger.error(`Error visualizing confidence over time for path ${pathId}:`, { error });
      throw new Error(`Failed to visualize confidence over time`);
    }
  }

  /**
   * Get confidence metrics for an agent across all paths
   */
  getConfidenceMetrics(agentId: string): {
    average: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    volatility: number;
  } {
    try {
      // Get all paths for the agent
      const paths = this.reasoningPathService.getReasoningPathsByAgent(agentId);
      
      if (paths.length === 0) {
        return {
          average: 0,
          trend: 'stable',
          volatility: 0
        };
      }
      
      // Collect all confidence records across all paths
      const allRecords: { timestamp: Date; value: number }[] = [];
      
      // Add records from reasoning paths
      for (const path of paths) {
        allRecords.push(...path.confidenceOverTime);
      }
      
      // Add records from our service
      const agentRecords = this.confidenceRecords.get(agentId);
      
      if (agentRecords) {
        for (const [, pathRecords] of agentRecords.entries()) {
          allRecords.push(...pathRecords);
        }
      }
      
      // Sort by timestamp
      allRecords.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      // Calculate overall average
      const average = allRecords.length > 0
        ? allRecords.reduce((sum, record) => sum + record.value, 0) / allRecords.length
        : 0;
      
      // Calculate trend
      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      
      if (allRecords.length >= 2) {
        const firstHalf = allRecords.slice(0, Math.floor(allRecords.length / 2));
        const secondHalf = allRecords.slice(Math.floor(allRecords.length / 2));
        
        const firstAvg = firstHalf.reduce((sum, record) => sum + record.value, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, record) => sum + record.value, 0) / secondHalf.length;
        
        const trendThreshold = 0.05;
        
        if (secondAvg - firstAvg > trendThreshold) {
          trend = 'increasing';
        } else if (firstAvg - secondAvg > trendThreshold) {
          trend = 'decreasing';
        }
      }
      
      // Calculate volatility (standard deviation)
      let volatility = 0;
      
      if (allRecords.length > 1) {
        const squaredDiffs = allRecords.map(record => 
          Math.pow(record.value - average, 2)
        );
        const avgSquaredDiff = squaredDiffs.reduce((sum, value) => sum + value, 0) / squaredDiffs.length;
        volatility = Math.sqrt(avgSquaredDiff);
      }
      
      return {
        average,
        trend,
        volatility
      };
    } catch (error) {
      this.logger.error(`Error getting confidence metrics for agent ${agentId}:`, { error });
      throw new Error(`Failed to get confidence metrics`);
    }
  }

  /**
   * Compare confidence levels between multiple agents
   */
  compareConfidenceLevels(agentIds: string[]): any {
    try {
      if (agentIds.length === 0) {
        return { agents: [] };
      }
      
      const agentComparisons = agentIds.map(agentId => {
        const metrics = this.getConfidenceMetrics(agentId);
        return {
          agentId,
          ...metrics
        };
      });
      
      // Sort by average confidence (highest first)
      agentComparisons.sort((a, b) => b.average - a.average);
      
      // Calculate relative performance
      const highestAverage = agentComparisons[0].average;
      const lowestAverage = agentComparisons[agentComparisons.length - 1].average;
      
      const normalizedComparisons = agentComparisons.map(agent => ({
        ...agent,
        relativeConfidence: highestAverage > 0 
          ? agent.average / highestAverage 
          : 0
      }));
      
      // Find most stable agent (lowest volatility)
      const mostStableAgent = [...agentComparisons].sort((a, b) => a.volatility - b.volatility)[0]?.agentId;
      
      // Find agent with most positive trend
      const trendValues = {
        'increasing': 1,
        'stable': 0,
        'decreasing': -1
      };
      
      const agentsByTrend = [...agentComparisons].sort(
        (a, b) => trendValues[b.trend] - trendValues[a.trend]
      );
      
      const mostPositiveTrendAgent = agentsByTrend[0]?.agentId;
      
      return {
        agents: normalizedComparisons,
        statistics: {
          highestAverage: highestAverage,
          lowestAverage: lowestAverage,
          averageDifference: highestAverage - lowestAverage,
          mostStableAgent,
          mostPositiveTrendAgent
        }
      };
    } catch (error) {
      this.logger.error(`Error comparing confidence levels:`, { error });
      throw new Error(`Failed to compare confidence levels`);
    }
  }

  /**
   * Generate confidence history visualization for an agent over time
   */
  generateConfidenceTimeline(agentId: string, startTime?: Date, endTime?: Date): any {
    try {
      // Get all paths for the agent
      const paths = this.reasoningPathService.getReasoningPathsByAgent(agentId);
      
      if (paths.length === 0) {
        return {
          agentId,
          timeline: []
        };
      }
      
      // Collect all confidence records across all paths
      const allRecords: Array<{ timestamp: Date; value: number; pathId: string }> = [];
      
      // Add records from reasoning paths
      for (const path of paths) {
        const pathRecords = path.confidenceOverTime.map(record => ({
          timestamp: record.timestamp,
          value: record.value,
          pathId: path.id
        }));
        
        allRecords.push(...pathRecords);
      }
      
      // Add records from our service
      const agentRecords = this.confidenceRecords.get(agentId);
      
      if (agentRecords) {
        for (const [pathId, pathRecords] of agentRecords.entries()) {
          const mappedRecords = pathRecords.map(record => ({
            timestamp: record.timestamp,
            value: record.value,
            pathId
          }));
          
          allRecords.push(...mappedRecords);
        }
      }
      
      // Apply time filters if provided
      let filteredRecords = allRecords;
      
      if (startTime || endTime) {
        filteredRecords = allRecords.filter(record => {
          const timestamp = record.timestamp;
          
          if (startTime && endTime) {
            return timestamp >= startTime && timestamp <= endTime;
          } else if (startTime) {
            return timestamp >= startTime;
          } else if (endTime) {
            return timestamp <= endTime;
          }
          
          return true;
        });
      }
      
      // Sort by timestamp
      filteredRecords.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      return {
        agentId,
        timeline: filteredRecords,
        statistics: this.getConfidenceMetrics(agentId)
      };
    } catch (error) {
      this.logger.error(`Error generating confidence timeline for agent ${agentId}:`, { error });
      throw new Error(`Failed to generate confidence timeline`);
    }
  }
} 