import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  ReasoningPathVisualization,
  ReasoningPath,
  DecisionPoint
} from '../../interfaces/visualization.interface';
import { DecisionCaptureImpl } from './decision-capture.service';

/**
 * Implementation of the reasoning path visualization service
 * This service visualizes sequences of agent decisions as coherent reasoning paths
 */
export class ReasoningPathImpl implements ReasoningPathVisualization {
  private logger: Logger;
  private decisionCapture: DecisionCaptureImpl;
  private reasoningPaths: Map<string, ReasoningPath> = new Map();
  private agentPaths: Map<string, string[]> = new Map(); // agentId -> path IDs

  constructor(options: {
    logger?: Logger;
    decisionCapture: DecisionCaptureImpl;
  }) {
    this.logger = options.logger || new ConsoleLogger();
    
    if (!options.decisionCapture) {
      throw new Error('Reasoning path service requires a decision capture service');
    }
    
    this.decisionCapture = options.decisionCapture;
    this.logger.info('Reasoning path visualization service initialized');
  }

  /**
   * Create a new reasoning path for an agent
   */
  createReasoningPath(agentId: string, taskId?: string): string {
    const pathId = uuidv4();
    const now = new Date();
    
    const path: ReasoningPath = {
      id: pathId,
      agentId,
      decisionPoints: [],
      startTime: now,
      taskId,
      confidenceOverTime: [],
      metadata: {}
    };
    
    // Store the path
    this.reasoningPaths.set(pathId, path);
    
    // Update agent paths index
    if (!this.agentPaths.has(agentId)) {
      this.agentPaths.set(agentId, []);
    }
    this.agentPaths.get(agentId)?.push(pathId);
    
    this.logger.info(`Created reasoning path ${pathId} for agent ${agentId}${taskId ? ` and task ${taskId}` : ''}`);
    
    return pathId;
  }

  /**
   * Add a decision to a reasoning path
   */
  addDecisionToPath(pathId: string, decisionId: string): boolean {
    const path = this.reasoningPaths.get(pathId);
    if (!path) {
      this.logger.warn(`Cannot add decision to non-existent path: ${pathId}`);
      return false;
    }
    
    try {
      // Get the decision from the decision capture service
      const decision = this.decisionCapture.getDecisionPoint(decisionId);
      
      // Verify that the decision belongs to the same agent
      if (decision.agentId !== path.agentId) {
        this.logger.warn(`Cannot add decision ${decisionId} from agent ${decision.agentId} to path ${pathId} for agent ${path.agentId}`);
        return false;
      }
      
      // If the path has a taskId, verify that the decision is for the same task
      if (path.taskId && decision.taskId && path.taskId !== decision.taskId) {
        this.logger.warn(`Cannot add decision ${decisionId} for task ${decision.taskId} to path ${pathId} for task ${path.taskId}`);
        return false;
      }
      
      // Add the decision to the path
      path.decisionPoints.push(decision);
      
      // Sort decisions by timestamp
      path.decisionPoints.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      // Add confidence data point if available
      const selectedOption = decision.options.find(option => option.selected);
      if (selectedOption) {
        path.confidenceOverTime.push({
          timestamp: decision.timestamp,
          value: selectedOption.confidence
        });
      }
      
      // Update end time
      path.endTime = new Date();
      
      this.logger.info(`Added decision ${decisionId} to reasoning path ${pathId}`);
      
      return true;
    } catch (error) {
      this.logger.error(`Error adding decision ${decisionId} to path ${pathId}:`, { error });
      return false;
    }
  }

  /**
   * Get a reasoning path by ID
   */
  getReasoningPath(pathId: string): ReasoningPath {
    const path = this.reasoningPaths.get(pathId);
    
    if (!path) {
      this.logger.warn(`Reasoning path not found: ${pathId}`);
      throw new Error(`Reasoning path not found: ${pathId}`);
    }
    
    return { ...path, decisionPoints: [...path.decisionPoints] }; // Return a deep copy
  }

  /**
   * Get all reasoning paths for an agent
   */
  getReasoningPathsByAgent(agentId: string): ReasoningPath[] {
    const pathIds = this.agentPaths.get(agentId) || [];
    
    const paths = pathIds
      .map(id => this.reasoningPaths.get(id))
      .filter(Boolean) as ReasoningPath[];
    
    // Sort by start time (newest first)
    paths.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    
    // Return deep copies
    return paths.map(path => ({
      ...path,
      decisionPoints: [...path.decisionPoints]
    }));
  }

  /**
   * Visualize a reasoning path
   * Returns data structure suitable for visualization
   */
  visualizeReasoningPath(pathId: string): any {
    const path = this.getReasoningPath(pathId);
    
    // Extract key information for visualization
    const nodes = path.decisionPoints.map((decision, index) => {
      const selectedOption = decision.options.find(opt => opt.selected);
      
      return {
        id: decision.id,
        label: `Decision ${index + 1}`,
        type: 'decision',
        timestamp: decision.timestamp,
        description: selectedOption?.description || 'No selection',
        confidence: selectedOption?.confidence || 0,
        reasoning: decision.reasoning,
        result: decision.result
      };
    });
    
    // Create edges between sequential decisions
    const edges = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        source: nodes[i].id,
        target: nodes[i + 1].id,
        label: 'Leads to'
      });
    }
    
    // Create confidence trend data
    const confidenceTrend = path.confidenceOverTime.map(point => ({
      timestamp: point.timestamp,
      value: point.value
    }));
    
    // Calculate overall statistics
    const avgConfidence = path.confidenceOverTime.length > 0
      ? path.confidenceOverTime.reduce((sum, point) => sum + point.value, 0) / path.confidenceOverTime.length
      : 0;
    
    // Create a comprehensive visualization object
    return {
      id: path.id,
      agentId: path.agentId,
      taskId: path.taskId,
      startTime: path.startTime,
      endTime: path.endTime,
      duration: path.endTime ? path.endTime.getTime() - path.startTime.getTime() : null,
      decisionCount: nodes.length,
      averageConfidence: avgConfidence,
      confidenceTrend,
      nodes,
      edges,
      metadata: path.metadata
    };
  }

  /**
   * Compare two reasoning paths
   * Returns data for visualization of the comparison
   */
  compareReasoningPaths(path1Id: string, path2Id: string): any {
    const path1 = this.getReasoningPath(path1Id);
    const path2 = this.getReasoningPath(path2Id);
    
    // Get visualizations for both paths
    const viz1 = this.visualizeReasoningPath(path1Id);
    const viz2 = this.visualizeReasoningPath(path2Id);
    
    // Compare confidence trends
    const confidenceComparison = {
      path1: viz1.confidenceTrend,
      path2: viz2.confidenceTrend,
      averageDifference: viz1.averageConfidence - viz2.averageConfidence
    };
    
    // Compare decision counts and timing
    const timingComparison = {
      path1Duration: viz1.duration,
      path2Duration: viz2.duration,
      durationDifference: (viz1.duration !== null && viz2.duration !== null)
        ? viz1.duration - viz2.duration
        : null,
      path1DecisionCount: viz1.decisionCount,
      path2DecisionCount: viz2.decisionCount,
      decisionCountDifference: viz1.decisionCount - viz2.decisionCount
    };
    
    // Create detailed decision matching for corresponding decisions
    const decisionMatching = [];
    const minLength = Math.min(path1.decisionPoints.length, path2.decisionPoints.length);
    
    for (let i = 0; i < minLength; i++) {
      const decision1 = path1.decisionPoints[i];
      const decision2 = path2.decisionPoints[i];
      
      // Find selected options
      const selected1 = decision1.options.find(opt => opt.selected);
      const selected2 = decision2.options.find(opt => opt.selected);
      
      decisionMatching.push({
        index: i,
        decision1: {
          id: decision1.id,
          result: decision1.result,
          reasoning: decision1.reasoning,
          selectedOption: selected1?.description || 'None',
          confidence: selected1?.confidence || 0
        },
        decision2: {
          id: decision2.id,
          result: decision2.result,
          reasoning: decision2.reasoning,
          selectedOption: selected2?.description || 'None',
          confidence: selected2?.confidence || 0
        },
        confidenceDifference: (selected1?.confidence || 0) - (selected2?.confidence || 0),
        sameResult: decision1.result === decision2.result
      });
    }
    
    return {
      path1: {
        id: path1.id,
        agentId: path1.agentId,
        taskId: path1.taskId,
        visualization: viz1
      },
      path2: {
        id: path2.id,
        agentId: path2.agentId,
        taskId: path2.taskId,
        visualization: viz2
      },
      confidenceComparison,
      timingComparison,
      decisionMatching,
      extraDecisionsInPath1: path1.decisionPoints.length > path2.decisionPoints.length
        ? path1.decisionPoints.slice(minLength).map(d => d.id)
        : [],
      extraDecisionsInPath2: path2.decisionPoints.length > path1.decisionPoints.length
        ? path2.decisionPoints.slice(minLength).map(d => d.id)
        : []
    };
  }

  /**
   * Identify key decision points in a reasoning path
   * Returns IDs of the most significant decisions
   */
  identifyKeyDecisionPoints(pathId: string): string[] {
    const path = this.getReasoningPath(pathId);
    
    if (path.decisionPoints.length === 0) {
      return [];
    }
    
    // Key decision detection strategies:
    // 1. High confidence variation (turning points)
    // 2. Most options considered (complex decisions)
    // 3. First and last decisions
    
    // Always include first and last if they exist
    const keyDecisions: string[] = [];
    if (path.decisionPoints.length > 0) {
      // Add first decision
      keyDecisions.push(path.decisionPoints[0].id);
      
      // Add last decision if different from first
      if (path.decisionPoints.length > 1) {
        const lastDecision = path.decisionPoints[path.decisionPoints.length - 1];
        keyDecisions.push(lastDecision.id);
      }
    }
    
    // Find decision with most options considered
    if (path.decisionPoints.length > 2) {
      let maxOptions = 0;
      let maxOptionsDecisionId = '';
      
      for (let i = 1; i < path.decisionPoints.length - 1; i++) {
        const decision = path.decisionPoints[i];
        if (decision.options.length > maxOptions) {
          maxOptions = decision.options.length;
          maxOptionsDecisionId = decision.id;
        }
      }
      
      if (maxOptionsDecisionId && !keyDecisions.includes(maxOptionsDecisionId)) {
        keyDecisions.push(maxOptionsDecisionId);
      }
    }
    
    // Find confidence turning points
    if (path.confidenceOverTime.length > 2) {
      let maxDelta = 0;
      let maxDeltaDecisionId = '';
      
      for (let i = 1; i < path.decisionPoints.length - 1; i++) {
        const prevConfidence = this.getDecisionConfidence(path.decisionPoints[i-1]);
        const currConfidence = this.getDecisionConfidence(path.decisionPoints[i]);
        const nextConfidence = this.getDecisionConfidence(path.decisionPoints[i+1]);
        
        // Detect pattern changes (increase to decrease or decrease to increase)
        const prevDelta = currConfidence - prevConfidence;
        const nextDelta = nextConfidence - currConfidence;
        
        // If the deltas have different signs, it's a turning point
        if ((prevDelta * nextDelta < 0) && (Math.abs(prevDelta) + Math.abs(nextDelta) > maxDelta)) {
          maxDelta = Math.abs(prevDelta) + Math.abs(nextDelta);
          maxDeltaDecisionId = path.decisionPoints[i].id;
        }
      }
      
      if (maxDeltaDecisionId && !keyDecisions.includes(maxDeltaDecisionId)) {
        keyDecisions.push(maxDeltaDecisionId);
      }
    }
    
    return keyDecisions;
  }

  /**
   * Helper to get confidence value from a decision
   */
  private getDecisionConfidence(decision: DecisionPoint): number {
    const selectedOption = decision.options.find(opt => opt.selected);
    return selectedOption?.confidence || 0;
  }

  /**
   * Delete a reasoning path
   */
  deleteReasoningPath(pathId: string): boolean {
    const path = this.reasoningPaths.get(pathId);
    
    if (!path) {
      this.logger.warn(`Cannot delete non-existent reasoning path: ${pathId}`);
      return false;
    }
    
    // Remove from main map
    this.reasoningPaths.delete(pathId);
    
    // Remove from agent paths index
    const agentPaths = this.agentPaths.get(path.agentId);
    if (agentPaths) {
      this.agentPaths.set(
        path.agentId,
        agentPaths.filter(id => id !== pathId)
      );
    }
    
    this.logger.info(`Deleted reasoning path ${pathId}`);
    
    return true;
  }

  /**
   * Merge two reasoning paths
   * Creates a new path combining both sequences chronologically
   */
  mergeReasoningPaths(path1Id: string, path2Id: string): string {
    const path1 = this.getReasoningPath(path1Id);
    const path2 = this.getReasoningPath(path2Id);
    
    // Ensure paths are from the same agent
    if (path1.agentId !== path2.agentId) {
      this.logger.warn(`Cannot merge paths from different agents: ${path1.agentId} and ${path2.agentId}`);
      throw new Error(`Cannot merge paths from different agents`);
    }
    
    // Create a new path
    const mergedPathId = this.createReasoningPath(path1.agentId);
    
    // Combine and sort decision points
    const allDecisions = [...path1.decisionPoints, ...path2.decisionPoints];
    allDecisions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Add each decision to the new path
    for (const decision of allDecisions) {
      // We need to add by ID from the decision capture service
      this.addDecisionToPath(mergedPathId, decision.id);
    }
    
    // Update metadata
    const mergedPath = this.reasoningPaths.get(mergedPathId);
    if (mergedPath) {
      mergedPath.metadata = {
        ...mergedPath.metadata,
        mergedFrom: [path1Id, path2Id],
        mergedAt: new Date()
      };
    }
    
    this.logger.info(`Merged reasoning paths ${path1Id} and ${path2Id} into ${mergedPathId}`);
    
    return mergedPathId;
  }

  /**
   * Tag a reasoning path with metadata
   */
  tagReasoningPath(pathId: string, tags: Record<string, any>): boolean {
    const path = this.reasoningPaths.get(pathId);
    
    if (!path) {
      this.logger.warn(`Cannot tag non-existent reasoning path: ${pathId}`);
      return false;
    }
    
    // Update metadata
    path.metadata = {
      ...path.metadata,
      ...tags,
      updatedAt: new Date()
    };
    
    this.logger.debug(`Tagged reasoning path ${pathId} with metadata`, { tags });
    
    return true;
  }

  /**
   * Get all reasoning paths with a specific tag
   */
  getReasoningPathsByTag(tagKey: string, tagValue: any): ReasoningPath[] {
    const matchingPaths: ReasoningPath[] = [];
    
    for (const path of this.reasoningPaths.values()) {
      if (path.metadata && path.metadata[tagKey] === tagValue) {
        matchingPaths.push({ ...path, decisionPoints: [...path.decisionPoints] });
      }
    }
    
    return matchingPaths;
  }

  /**
   * Get reasoning path statistics
   */
  getReasoningPathStatistics(): Record<string, any> {
    const agentStats: Record<string, { pathCount: number; avgDecisions: number; avgConfidence: number }> = {};
    
    // Process all paths
    for (const path of this.reasoningPaths.values()) {
      const agentId = path.agentId;
      
      if (!agentStats[agentId]) {
        agentStats[agentId] = {
          pathCount: 0,
          avgDecisions: 0,
          avgConfidence: 0
        };
      }
      
      // Increment path count
      agentStats[agentId].pathCount++;
      
      // Calculate decision counts
      agentStats[agentId].avgDecisions = 
        (agentStats[agentId].avgDecisions * (agentStats[agentId].pathCount - 1) + path.decisionPoints.length) / 
        agentStats[agentId].pathCount;
      
      // Calculate confidence
      const pathAvgConfidence = path.confidenceOverTime.length > 0
        ? path.confidenceOverTime.reduce((sum, point) => sum + point.value, 0) / path.confidenceOverTime.length
        : 0;
      
      agentStats[agentId].avgConfidence = 
        (agentStats[agentId].avgConfidence * (agentStats[agentId].pathCount - 1) + pathAvgConfidence) / 
        agentStats[agentId].pathCount;
    }
    
    return {
      totalPaths: this.reasoningPaths.size,
      agentStats
    };
  }
} 