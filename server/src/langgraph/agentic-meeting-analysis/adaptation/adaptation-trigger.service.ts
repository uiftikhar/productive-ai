/**
 * Adaptation Trigger Service for the Agentic Meeting Analysis System
 *
 * This service implements adaptation triggering mechanisms:
 * - Content-based adaptation triggers
 * - Performance-based adaptation triggers
 * - Unexpected topic detection
 * - Analytical focus detection
 */
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { AgentExpertise } from '../interfaces/agent.interface';
import { StateManager } from '../state/state.manager';
import {
  SemanticChunkingService,
  ChunkMetadata,
} from '../team-formation/semantic-chunking.service';

/**
 * Configuration options for AdaptationTriggerService
 */
export interface AdaptationTriggerConfig {
  logger?: Logger;
  stateManager: StateManager;
  semanticChunkingService?: SemanticChunkingService;
  confidenceThreshold?: number;
  performanceThreshold?: number;
  topicChangeThreshold?: number;
}

/**
 * Types of adaptation triggers
 */
export enum AdaptationTriggerType {
  CONTENT_CHANGE = 'content_change',
  PERFORMANCE_ISSUE = 'performance_issue',
  UNEXPECTED_TOPIC = 'unexpected_topic',
  FOCUS_SHIFT = 'focus_shift',
  METHODOLOGY_CHANGE = 'methodology_change',
}

/**
 * Adaptation trigger event
 */
export interface AdaptationTrigger {
  id: string;
  meetingId: string;
  type: AdaptationTriggerType;
  timestamp: number;
  source: string;
  confidence: number;
  data: Record<string, any>;
  recommendedAction: string;
}

/**
 * Topic detection result
 */
export interface TopicDetection {
  topic: string;
  confidence: number;
  keywords: string[];
  relatedToExpectedTopics: boolean;
  importance: number;
}

/**
 * Performance issue detection
 */
export interface PerformanceIssue {
  agentId: string;
  metric: string;
  actualValue: number;
  expectedValue: number;
  impact: 'low' | 'medium' | 'high';
  timestamp: number;
}

/**
 * Implementation of adaptation trigger service
 */
export class AdaptationTriggerService extends EventEmitter {
  private logger: Logger;
  private stateManager: StateManager;
  private semanticChunkingService: SemanticChunkingService;
  private confidenceThreshold: number;
  private performanceThreshold: number;
  private topicChangeThreshold: number;

  // Store for detected triggers
  private triggers: Map<string, AdaptationTrigger> = new Map();
  private expectedTopics: Map<string, Set<string>> = new Map();
  private agentPerformanceHistory: Map<string, number[]> = new Map();

  /**
   * Create a new adaptation trigger service
   */
  constructor(config: AdaptationTriggerConfig) {
    super();

    this.logger = config.logger || new ConsoleLogger();
    this.stateManager = config.stateManager;
    this.semanticChunkingService =
      config.semanticChunkingService ||
      new SemanticChunkingService({ logger: this.logger });
    this.confidenceThreshold = config.confidenceThreshold || 0.7;
    this.performanceThreshold = config.performanceThreshold || 0.6;
    this.topicChangeThreshold = config.topicChangeThreshold || 0.5;

    this.logger.info('Initialized AdaptationTriggerService');
  }

  /**
   * Initialize the adaptation trigger service
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing adaptation trigger service');

      // Additional initialization if needed

      this.logger.info('Adaptation trigger service initialized successfully');
    } catch (error) {
      this.logger.error(
        `Error initializing adaptation trigger service: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Set expected topics for a meeting
   */
  async setExpectedTopics(meetingId: string, topics: string[]): Promise<void> {
    this.logger.info(
      `Setting ${topics.length} expected topics for meeting ${meetingId}`,
    );

    // Create a set of normalized topics (lowercase)
    const topicSet = new Set(topics.map((t) => t.toLowerCase()));
    this.expectedTopics.set(meetingId, topicSet);

    // Store in state manager
    await this.stateManager.setState(
      `meeting:${meetingId}:expectedTopics`,
      Array.from(topicSet),
    );
  }

  /**
   * Analyze transcript segment for content-based triggers
   */
  async analyzeContentForTriggers(
    meetingId: string,
    transcriptSegment: string,
    previousSegments: string[] = [],
  ): Promise<AdaptationTrigger[]> {
    this.logger.info(
      `Analyzing content for adaptation triggers in meeting ${meetingId}`,
    );

    try {
      // Step 1: Chunk the segment
      const chunks =
        await this.semanticChunkingService.chunkTranscript(transcriptSegment);

      // Step 2: Detect potential topics
      const detectedTopics = await this.detectTopics(meetingId, chunks);

      // Step 3: Check for unexpected topics
      const unexpectedTopics = this.identifyUnexpectedTopics(
        meetingId,
        detectedTopics,
      );

      // Step 4: Create adaptation triggers for unexpected topics
      const triggers: AdaptationTrigger[] = [];

      for (const topic of unexpectedTopics) {
        if (
          topic.confidence >= this.confidenceThreshold &&
          topic.importance >= this.topicChangeThreshold
        ) {
          const trigger: AdaptationTrigger = {
            id: `trigger-${uuidv4()}`,
            meetingId,
            type: AdaptationTriggerType.UNEXPECTED_TOPIC,
            timestamp: Date.now(),
            source: 'content_analysis',
            confidence: topic.confidence,
            data: {
              topic: topic.topic,
              keywords: topic.keywords,
              importance: topic.importance,
            },
            recommendedAction: 'recruit_specialist',
          };

          triggers.push(trigger);
          this.triggers.set(trigger.id, trigger);
        }
      }

      // Step 5: Check for focus shifts
      if (previousSegments.length > 0) {
        const focusShifts = await this.detectFocusShifts(
          meetingId,
          chunks,
          previousSegments,
        );

        if (focusShifts.length > 0) {
          const trigger: AdaptationTrigger = {
            id: `trigger-${uuidv4()}`,
            meetingId,
            type: AdaptationTriggerType.FOCUS_SHIFT,
            timestamp: Date.now(),
            source: 'content_analysis',
            confidence: focusShifts[0].confidence,
            data: {
              previousFocus: focusShifts[0].previousFocus,
              newFocus: focusShifts[0].newFocus,
              keywords: focusShifts[0].keywords,
            },
            recommendedAction: 'reallocate_focus',
          };

          triggers.push(trigger);
          this.triggers.set(trigger.id, trigger);
        }
      }

      // Step 6: Check for methodology adaptation needs
      const methodologyTrigger = await this.detectMethodologyTrigger(
        meetingId,
        chunks,
      );

      if (methodologyTrigger) {
        triggers.push(methodologyTrigger);
        this.triggers.set(methodologyTrigger.id, methodologyTrigger);
      }

      // Step 7: Emit events for triggers
      for (const trigger of triggers) {
        this.emit('adaptation_trigger', trigger);

        // Store trigger in state
        await this.stateManager.setState(
          `meeting:${meetingId}:trigger:${trigger.id}`,
          trigger,
        );
      }

      this.logger.info(
        `Detected ${triggers.length} content-based adaptation triggers for meeting ${meetingId}`,
      );

      return triggers;
    } catch (error) {
      this.logger.error(
        `Error analyzing content for triggers: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Track and analyze agent performance
   */
  async analyzePerformanceForTriggers(
    meetingId: string,
    agentPerformance: Record<string, number>,
    taskCompletion: Record<string, boolean>,
  ): Promise<AdaptationTrigger[]> {
    this.logger.info(
      `Analyzing performance for adaptation triggers in meeting ${meetingId}`,
    );

    try {
      // Step 1: Update performance history
      for (const [agentId, performance] of Object.entries(agentPerformance)) {
        if (!this.agentPerformanceHistory.has(agentId)) {
          this.agentPerformanceHistory.set(agentId, []);
        }

        const history = this.agentPerformanceHistory.get(agentId)!;
        history.push(performance);

        // Keep only the last 10 performance records
        if (history.length > 10) {
          this.agentPerformanceHistory.set(agentId, history.slice(-10));
        }
      }

      // Step 2: Identify performance issues
      const performanceIssues: PerformanceIssue[] = [];

      for (const [agentId, performance] of Object.entries(agentPerformance)) {
        const history = this.agentPerformanceHistory.get(agentId) || [];

        // Calculate expected performance (average of previous performances)
        const expectedPerformance =
          history.length > 1
            ? history.slice(0, -1).reduce((sum, val) => sum + val, 0) /
              (history.length - 1)
            : performance;

        // Check if performance is significantly below expected
        if (performance < expectedPerformance * this.performanceThreshold) {
          performanceIssues.push({
            agentId,
            metric: 'overall_performance',
            actualValue: performance,
            expectedValue: expectedPerformance,
            impact:
              performance < expectedPerformance * 0.5
                ? 'high'
                : performance < expectedPerformance * 0.7
                  ? 'medium'
                  : 'low',
            timestamp: Date.now(),
          });
        }

        // Check task completion
        if (taskCompletion[agentId] === false) {
          performanceIssues.push({
            agentId,
            metric: 'task_completion',
            actualValue: 0,
            expectedValue: 1,
            impact: 'high',
            timestamp: Date.now(),
          });
        }
      }

      // Step 3: Create adaptation triggers for performance issues
      const triggers: AdaptationTrigger[] = [];

      for (const issue of performanceIssues) {
        if (issue.impact === 'high' || issue.impact === 'medium') {
          const trigger: AdaptationTrigger = {
            id: `trigger-${uuidv4()}`,
            meetingId,
            type: AdaptationTriggerType.PERFORMANCE_ISSUE,
            timestamp: Date.now(),
            source: 'performance_analysis',
            confidence: issue.impact === 'high' ? 0.9 : 0.7,
            data: {
              agentId: issue.agentId,
              metric: issue.metric,
              actualValue: issue.actualValue,
              expectedValue: issue.expectedValue,
              impact: issue.impact,
            },
            recommendedAction:
              issue.impact === 'high' ? 'replace_agent' : 'assist_agent',
          };

          triggers.push(trigger);
          this.triggers.set(trigger.id, trigger);
        }
      }

      // Step 4: Emit events for triggers
      for (const trigger of triggers) {
        this.emit('adaptation_trigger', trigger);

        // Store trigger in state
        await this.stateManager.setState(
          `meeting:${meetingId}:trigger:${trigger.id}`,
          trigger,
        );
      }

      this.logger.info(
        `Detected ${triggers.length} performance-based adaptation triggers for meeting ${meetingId}`,
      );

      return triggers;
    } catch (error) {
      this.logger.error(
        `Error analyzing performance for triggers: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get all active triggers for a meeting
   */
  async getActiveTriggers(meetingId: string): Promise<AdaptationTrigger[]> {
    return Array.from(this.triggers.values()).filter(
      (trigger) => trigger.meetingId === meetingId,
    );
  }

  /**
   * Acknowledge and clear a trigger
   */
  async acknowledgeTrigger(triggerId: string): Promise<boolean> {
    if (this.triggers.has(triggerId)) {
      const trigger = this.triggers.get(triggerId)!;
      this.triggers.delete(triggerId);

      // Mark as acknowledged in state
      await this.stateManager.setState(
        `meeting:${trigger.meetingId}:trigger:${triggerId}:acknowledged`,
        {
          triggerId,
          acknowledgedAt: Date.now(),
        },
      );

      this.logger.info(`Trigger ${triggerId} acknowledged and cleared`);
      return true;
    }

    return false;
  }

  /**
   * Detect topics in transcript chunks
   */
  private async detectTopics(
    meetingId: string,
    chunks: ChunkMetadata[],
  ): Promise<TopicDetection[]> {
    // In a real implementation, this would use LLM to identify topics
    // This is a simplified implementation

    const detectedTopics: TopicDetection[] = [];

    // Process each chunk to identify potential topics
    for (const chunk of chunks) {
      // Use keywords as basis for topic detection
      for (const keyword of chunk.keywords) {
        // Skip very short keywords
        if (keyword.length < 5) continue;

        // Create a topic based on keyword
        const topic = keyword.charAt(0).toUpperCase() + keyword.slice(1);

        // Check if this topic is related to expected topics
        const isRelatedToExpected = this.isTopicRelatedToExpected(
          meetingId,
          topic,
        );

        // Generate synthetic topic detection
        detectedTopics.push({
          topic,
          confidence: 0.7 + Math.random() * 0.3, // Random confidence between 0.7-1.0
          keywords: [
            keyword,
            ...chunk.keywords.filter((k) => k !== keyword).slice(0, 2),
          ],
          relatedToExpectedTopics: isRelatedToExpected,
          importance: 0.5 + Math.random() * 0.5, // Random importance between 0.5-1.0
        });
      }
    }

    // Deduplicate topics
    const uniqueTopics = new Map<string, TopicDetection>();
    for (const topic of detectedTopics) {
      const key = topic.topic.toLowerCase();
      if (
        !uniqueTopics.has(key) ||
        uniqueTopics.get(key)!.confidence < topic.confidence
      ) {
        uniqueTopics.set(key, topic);
      }
    }

    return Array.from(uniqueTopics.values());
  }

  /**
   * Check if a topic is related to expected topics
   */
  private isTopicRelatedToExpected(meetingId: string, topic: string): boolean {
    const expectedTopics = this.expectedTopics.get(meetingId);
    if (!expectedTopics) return false;

    const normalizedTopic = topic.toLowerCase();

    // Direct match
    if (expectedTopics.has(normalizedTopic)) return true;

    // Partial match (topic contains or is contained by expected topic)
    for (const expected of expectedTopics) {
      if (
        normalizedTopic.includes(expected) ||
        expected.includes(normalizedTopic)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Identify unexpected topics
   */
  private identifyUnexpectedTopics(
    meetingId: string,
    detectedTopics: TopicDetection[],
  ): TopicDetection[] {
    return detectedTopics.filter(
      (topic) =>
        !topic.relatedToExpectedTopics &&
        topic.importance >= this.topicChangeThreshold,
    );
  }

  /**
   * Detect shifts in analytical focus
   */
  private async detectFocusShifts(
    meetingId: string,
    currentChunks: ChunkMetadata[],
    previousSegments: string[],
  ): Promise<
    Array<{
      previousFocus: string;
      newFocus: string;
      confidence: number;
      keywords: string[];
    }>
  > {
    // In a real implementation, this would use LLM analysis to detect focus shifts
    // This is a simplified placeholder implementation

    // Create a simple focus representation based on keywords
    const currentKeywords = new Set<string>();
    for (const chunk of currentChunks) {
      chunk.keywords.forEach((k) => currentKeywords.add(k));
    }

    // Mock previous focus
    let previousFocus = '';
    let previousKeywords: string[] = [];

    // Choose the most recent previous segment
    if (previousSegments.length > 0) {
      const lastSegment = previousSegments[previousSegments.length - 1];

      // Extract keywords (very simple approach)
      const words = lastSegment
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 4);
      const wordCounts = new Map<string, number>();

      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }

      // Get top keywords
      previousKeywords = [...wordCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);

      // Create a focus from top keyword
      if (previousKeywords.length > 0) {
        previousFocus =
          previousKeywords[0].charAt(0).toUpperCase() +
          previousKeywords[0].slice(1);
      }
    }

    // If we don't have enough information, return empty result
    if (!previousFocus || currentKeywords.size === 0) {
      return [];
    }

    // Check keyword overlap
    const overlap = previousKeywords.filter((k) =>
      currentKeywords.has(k),
    ).length;
    const overlapRatio =
      overlap / Math.min(previousKeywords.length, currentKeywords.size);

    // If overlap is low, there's a potential focus shift
    if (overlapRatio < 0.3) {
      // Create a new focus from current top keyword
      const currentKeywordsArray = Array.from(currentKeywords);
      const newFocus =
        currentKeywordsArray[0].charAt(0).toUpperCase() +
        currentKeywordsArray[0].slice(1);

      return [
        {
          previousFocus,
          newFocus,
          confidence: 1 - overlapRatio,
          keywords: currentKeywordsArray.slice(0, 5),
        },
      ];
    }

    return [];
  }

  /**
   * Detect need for methodology adaptation
   */
  private async detectMethodologyTrigger(
    meetingId: string,
    chunks: ChunkMetadata[],
  ): Promise<AdaptationTrigger | null> {
    // In a real implementation, this would use content analysis to detect methodology needs
    // This is a simplified placeholder implementation

    // Check for specific patterns in chunk content
    const allText = chunks.map((c) => c.text).join(' ');

    // Simple pattern detection
    const technicalPatterns = [
      'technical',
      'implementation',
      'architecture',
      'design',
      'system',
    ];

    const businessPatterns = [
      'business',
      'strategy',
      'market',
      'customer',
      'stakeholder',
    ];

    // Count occurrences
    let technicalCount = 0;
    let businessCount = 0;

    for (const pattern of technicalPatterns) {
      const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
      const matches = allText.match(regex);
      if (matches) technicalCount += matches.length;
    }

    for (const pattern of businessPatterns) {
      const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
      const matches = allText.match(regex);
      if (matches) businessCount += matches.length;
    }

    // Determine if there's a clear methodology direction
    if (technicalCount > 3 * businessCount && technicalCount > 5) {
      return {
        id: `trigger-${uuidv4()}`,
        meetingId,
        type: AdaptationTriggerType.METHODOLOGY_CHANGE,
        timestamp: Date.now(),
        source: 'content_analysis',
        confidence:
          0.7 + (technicalCount / (technicalCount + businessCount)) * 0.3,
        data: {
          methodologyChange: 'technical_focus',
          technicalTerms: technicalCount,
          businessTerms: businessCount,
        },
        recommendedAction: 'switch_to_technical_methodology',
      };
    } else if (businessCount > 3 * technicalCount && businessCount > 5) {
      return {
        id: `trigger-${uuidv4()}`,
        meetingId,
        type: AdaptationTriggerType.METHODOLOGY_CHANGE,
        timestamp: Date.now(),
        source: 'content_analysis',
        confidence:
          0.7 + (businessCount / (technicalCount + businessCount)) * 0.3,
        data: {
          methodologyChange: 'business_focus',
          technicalTerms: technicalCount,
          businessTerms: businessCount,
        },
        recommendedAction: 'switch_to_business_methodology',
      };
    }

    return null;
  }
}
