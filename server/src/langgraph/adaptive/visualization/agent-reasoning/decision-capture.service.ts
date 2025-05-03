import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  DecisionCapture,
  DecisionPoint
} from '../../interfaces/visualization.interface';

/**
 * Implementation of the decision capture service
 * This service records and retrieves agent decision points for reasoning visualization
 */
export class DecisionCaptureImpl implements DecisionCapture {
  private logger: Logger;
  private decisions: Map<string, DecisionPoint> = new Map();
  private agentDecisions: Map<string, string[]> = new Map(); // agentId -> decision IDs
  private taskDecisions: Map<string, string[]> = new Map(); // taskId -> decision IDs
  private decisionTags: Map<string, string[]> = new Map(); // decisionId -> tags
  private decisionAnnotations: Map<string, string> = new Map(); // decisionId -> annotation

  constructor(options: {
    logger?: Logger;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.logger.info('Decision capture service initialized');
  }

  /**
   * Record a new decision point
   */
  recordDecisionPoint(decision: Omit<DecisionPoint, 'id'>): string {
    const id = uuidv4();
    const now = new Date();
    
    // Ensure timestamp is set
    const timestamp = decision.timestamp || now;
    
    const decisionPoint: DecisionPoint = {
      ...decision,
      id,
      timestamp
    };
    
    // Store the decision
    this.decisions.set(id, decisionPoint);
    
    // Update agent decisions index
    if (!this.agentDecisions.has(decision.agentId)) {
      this.agentDecisions.set(decision.agentId, []);
    }
    this.agentDecisions.get(decision.agentId)?.push(id);
    
    // Update task decisions index if taskId is present
    if (decision.taskId) {
      if (!this.taskDecisions.has(decision.taskId)) {
        this.taskDecisions.set(decision.taskId, []);
      }
      this.taskDecisions.get(decision.taskId)?.push(id);
    }
    
    this.logger.info(`Recorded decision point ${id} for agent ${decision.agentId}`);
    
    return id;
  }

  /**
   * Get a decision point by ID
   */
  getDecisionPoint(decisionId: string): DecisionPoint {
    const decision = this.decisions.get(decisionId);
    
    if (!decision) {
      this.logger.warn(`Decision point not found: ${decisionId}`);
      throw new Error(`Decision point not found: ${decisionId}`);
    }
    
    return { ...decision }; // Return a copy to prevent modification
  }

  /**
   * Get decisions by agent within an optional time range
   */
  getDecisionsByAgent(agentId: string, startTime?: Date, endTime?: Date): DecisionPoint[] {
    const decisionIds = this.agentDecisions.get(agentId) || [];
    
    let decisions = decisionIds
      .map(id => this.decisions.get(id))
      .filter(Boolean) as DecisionPoint[];
    
    // Filter by time range if provided
    if (startTime || endTime) {
      decisions = decisions.filter(decision => {
        if (startTime && decision.timestamp < startTime) {
          return false;
        }
        if (endTime && decision.timestamp > endTime) {
          return false;
        }
        return true;
      });
    }
    
    // Sort by timestamp (newest first)
    decisions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return decisions.map(decision => ({ ...decision })); // Return copies
  }

  /**
   * Get decisions by task
   */
  getDecisionsByTask(taskId: string): DecisionPoint[] {
    const decisionIds = this.taskDecisions.get(taskId) || [];
    
    const decisions = decisionIds
      .map(id => this.decisions.get(id))
      .filter(Boolean) as DecisionPoint[];
    
    // Sort by timestamp (newest first)
    decisions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return decisions.map(decision => ({ ...decision })); // Return copies
  }

  /**
   * Tag a decision point with metadata
   */
  tagDecisionPoint(decisionId: string, tags: string[]): boolean {
    if (!this.decisions.has(decisionId)) {
      this.logger.warn(`Cannot tag non-existent decision: ${decisionId}`);
      return false;
    }
    
    // Store tags
    this.decisionTags.set(decisionId, [...tags]);
    
    this.logger.debug(`Tagged decision ${decisionId} with: ${tags.join(', ')}`);
    
    return true;
  }

  /**
   * Annotate a decision point with additional information
   */
  annotateDecisionPoint(decisionId: string, annotation: string): boolean {
    if (!this.decisions.has(decisionId)) {
      this.logger.warn(`Cannot annotate non-existent decision: ${decisionId}`);
      return false;
    }
    
    // Store annotation
    this.decisionAnnotations.set(decisionId, annotation);
    
    this.logger.debug(`Annotated decision ${decisionId}`);
    
    return true;
  }

  /**
   * Search for decision points by keywords in reasoning, result, options, etc.
   */
  searchDecisionPoints(query: string): DecisionPoint[] {
    if (!query || query.trim() === '') {
      return [];
    }
    
    const searchTerms = query.toLowerCase().split(/\s+/);
    
    const matchingDecisions: DecisionPoint[] = [];
    
    // Check each decision for matches
    for (const decision of this.decisions.values()) {
      // Check if any search term matches any field
      const isMatch = searchTerms.some(term => {
        // Check reasoning
        if (decision.reasoning && decision.reasoning.toLowerCase().includes(term)) {
          return true;
        }
        
        // Check result
        if (decision.result && decision.result.toLowerCase().includes(term)) {
          return true;
        }
        
        // Check options descriptions
        if (decision.options.some(option => 
          option.description.toLowerCase().includes(term) ||
          option.pros.some(pro => pro.toLowerCase().includes(term)) ||
          option.cons.some(con => con.toLowerCase().includes(term))
        )) {
          return true;
        }
        
        // Check metadata if exists
        if (decision.metadata) {
          const metadataStr = JSON.stringify(decision.metadata).toLowerCase();
          if (metadataStr.includes(term)) {
            return true;
          }
        }
        
        // Check tags if exists
        const tags = this.decisionTags.get(decision.id) || [];
        if (tags.some(tag => tag.toLowerCase().includes(term))) {
          return true;
        }
        
        // Check annotation if exists
        const annotation = this.decisionAnnotations.get(decision.id);
        if (annotation && annotation.toLowerCase().includes(term)) {
          return true;
        }
        
        return false;
      });
      
      if (isMatch) {
        matchingDecisions.push({ ...decision }); // Add a copy
      }
    }
    
    // Sort by timestamp (newest first)
    matchingDecisions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return matchingDecisions;
  }

  /**
   * Get tags for a decision
   */
  getTags(decisionId: string): string[] {
    return this.decisionTags.get(decisionId) || [];
  }

  /**
   * Get annotation for a decision
   */
  getAnnotation(decisionId: string): string {
    return this.decisionAnnotations.get(decisionId) || '';
  }

  /**
   * Delete a decision point
   */
  deleteDecisionPoint(decisionId: string): boolean {
    const decision = this.decisions.get(decisionId);
    
    if (!decision) {
      return false;
    }
    
    // Remove from main map
    this.decisions.delete(decisionId);
    
    // Remove from agent index
    const agentDecisions = this.agentDecisions.get(decision.agentId);
    if (agentDecisions) {
      this.agentDecisions.set(
        decision.agentId,
        agentDecisions.filter(id => id !== decisionId)
      );
    }
    
    // Remove from task index if applicable
    if (decision.taskId) {
      const taskDecisions = this.taskDecisions.get(decision.taskId);
      if (taskDecisions) {
        this.taskDecisions.set(
          decision.taskId,
          taskDecisions.filter(id => id !== decisionId)
        );
      }
    }
    
    // Remove tags and annotations
    this.decisionTags.delete(decisionId);
    this.decisionAnnotations.delete(decisionId);
    
    this.logger.info(`Deleted decision point ${decisionId}`);
    
    return true;
  }

  /**
   * Get statistics about decisions
   */
  getDecisionStatistics(): Record<string, any> {
    const agents = new Set<string>();
    const tasks = new Set<string>();
    
    let totalOptions = 0;
    let totalConfidence = 0;
    let confidentDecisions = 0;
    
    // Process all decisions
    for (const decision of this.decisions.values()) {
      agents.add(decision.agentId);
      if (decision.taskId) {
        tasks.add(decision.taskId);
      }
      
      // Count options
      totalOptions += decision.options.length;
      
      // Calculate confidence metrics
      const selectedOption = decision.options.find(opt => opt.selected);
      if (selectedOption) {
        totalConfidence += selectedOption.confidence;
        confidentDecisions++;
      }
    }
    
    return {
      totalDecisions: this.decisions.size,
      uniqueAgents: agents.size,
      uniqueTasks: tasks.size,
      averageOptionsPerDecision: this.decisions.size > 0 ? totalOptions / this.decisions.size : 0,
      averageConfidence: confidentDecisions > 0 ? totalConfidence / confidentDecisions : 0,
      oldestDecision: this.getOldestDecisionDate(),
      newestDecision: this.getNewestDecisionDate()
    };
  }
  
  /**
   * Get the date of the oldest decision
   */
  private getOldestDecisionDate(): Date | null {
    if (this.decisions.size === 0) {
      return null;
    }
    
    let oldestDate: Date | null = null;
    
    for (const decision of this.decisions.values()) {
      if (!oldestDate || decision.timestamp < oldestDate) {
        oldestDate = decision.timestamp;
      }
    }
    
    return oldestDate;
  }
  
  /**
   * Get the date of the newest decision
   */
  private getNewestDecisionDate(): Date | null {
    if (this.decisions.size === 0) {
      return null;
    }
    
    let newestDate: Date | null = null;
    
    for (const decision of this.decisions.values()) {
      if (!newestDate || decision.timestamp > newestDate) {
        newestDate = decision.timestamp;
      }
    }
    
    return newestDate;
  }
} 