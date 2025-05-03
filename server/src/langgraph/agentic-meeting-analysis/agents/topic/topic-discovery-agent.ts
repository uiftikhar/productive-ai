/**
 * Topic Discovery Agent for the Agentic Meeting Analysis System
 */
import { v4 as uuidv4 } from 'uuid';
import {
  ISpecialistAnalysisAgent,
  AgentExpertise,
  AgentOutput,
  AnalysisGoalType,
  AnalysisTask,
  AnalysisTaskStatus,
  ConfidenceLevel,
  MessageType,
} from '../../interfaces/agent.interface';
import {
  MeetingTranscript,
  TranscriptSegment,
} from '../../interfaces/state.interface';
import { BaseMeetingAnalysisAgent } from '../base-meeting-analysis-agent';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ChatOpenAI } from '@langchain/openai';

/**
 * Configuration options for TopicDiscoveryAgent
 */
export interface TopicDiscoveryAgentConfig {
  id?: string;
  name?: string;
  logger?: Logger;
  llm?: ChatOpenAI;
  systemPrompt?: string;
  minTopicRelevance?: number;
  maxTopics?: number;
  enableTopicRelationships?: boolean;
}

/**
 * Implementation of the Topic Discovery Agent
 * This agent is responsible for:
 * - Identifying and extracting discussion topics from transcripts
 * - Mapping relationships between topics
 * - Tracking topic transitions and time allocation
 * - Evaluating topic relevance
 */
export class TopicDiscoveryAgent
  extends BaseMeetingAnalysisAgent
  implements ISpecialistAnalysisAgent
{
  private minTopicRelevance: number;
  private maxTopics: number;
  private enableTopicRelationships: boolean;

  /**
   * Create a new Topic Discovery Agent
   */
  constructor(config: TopicDiscoveryAgentConfig) {
    super({
      id: config.id,
      name: config.name || 'Topic Discovery Agent',
      expertise: [AgentExpertise.TOPIC_ANALYSIS],
      capabilities: [AnalysisGoalType.EXTRACT_TOPICS],
      logger: config.logger,
      llm: config.llm,
      systemPrompt: config.systemPrompt,
    });

    this.minTopicRelevance = config.minTopicRelevance || 0.4;
    this.maxTopics = config.maxTopics || 10;
    this.enableTopicRelationships = config.enableTopicRelationships !== false;

    this.logger.info(
      `Initialized ${this.name} with max topics: ${this.maxTopics}`,
    );
  }

  /**
   * Initialize the topic discovery agent
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    await super.initialize(config);

    // Register with coordinator
    await this.registerWithCoordinator();

    this.logger.info(
      `${this.name} initialized and registered with coordinator`,
    );
  }

  /**
   * Register this agent with the analysis coordinator
   */
  private async registerWithCoordinator(): Promise<void> {
    const registrationMessage = this.createMessage(
      MessageType.NOTIFICATION,
      ['coordinator'],
      {
        messageType: 'AGENT_REGISTRATION',
        agentId: this.id,
        name: this.name,
        expertise: this.expertise,
        capabilities: Array.from(this.capabilities),
      },
    );

    await this.sendMessage(registrationMessage);
  }

  /**
   * Process a topic analysis task
   */
  async processTask(task: AnalysisTask): Promise<AgentOutput> {
    this.logger.info(`Processing topic analysis task: ${task.id}`);

    if (task.type !== AnalysisGoalType.EXTRACT_TOPICS) {
      throw new Error(
        `Topic Discovery Agent cannot process task type: ${task.type}`,
      );
    }

    try {
      // Get transcript data
      const transcript = await this.readMemory('transcript', 'meeting');
      const metadata = await this.readMemory('metadata', 'meeting');

      if (!transcript) {
        throw new Error('Meeting transcript not found in memory');
      }

      // Extract topics from full transcript
      const topicAnalysis = await this.extractTopics(transcript);

      // If enabled, analyze relationships between topics
      if (this.enableTopicRelationships) {
        (topicAnalysis as any).topicRelationships =
          await this.analyzeTopicRelationships(topicAnalysis.topics);
      }

      // Track topic transitions
      (topicAnalysis as any).topicTransitions =
        await this.trackTopicTransitions(transcript, topicAnalysis.topics);

      // Measure time allocation for each topic
      (topicAnalysis as any).timeAllocation = this.calculateTimeAllocation(
        transcript,
        topicAnalysis.topics,
        topicAnalysis.topicSegments,
      );

      // Assess confidence in the analysis
      const confidence = await this.assessConfidence(topicAnalysis);

      // Explain reasoning
      const reasoning = await this.explainReasoning(topicAnalysis);

      // Create output
      const output: AgentOutput = {
        content: topicAnalysis,
        confidence,
        reasoning,
        metadata: {
          taskId: task.id,
          topicCount: topicAnalysis.topics.length,
          meetingId: metadata?.meetingId || 'unknown',
        },
        timestamp: Date.now(),
      };

      // Notify coordinator of task completion
      await this.notifyTaskCompletion(task.id, output);

      return output;
    } catch (error) {
      this.logger.error(
        `Error processing topic analysis: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Extract topics from a transcript
   */
  private async extractTopics(transcript: MeetingTranscript): Promise<{
    topics: Array<{
      id: string;
      name: string;
      description: string;
      keywords: string[];
      relevance: number;
    }>;
    topicSegments: Record<string, string[]>;
  }> {
    this.logger.info('Extracting topics from transcript');

    // Combine all segments for full-text analysis
    const fullText = transcript.segments.map((s) => s.content).join('\n');

    const prompt = `
      Extract the main discussion topics from the following meeting transcript.
      
      For each topic:
      1. Provide a concise name (2-5 words)
      2. Write a brief description (1-2 sentences)
      3. List key terms/keywords associated with this topic (4-8 terms)
      4. Assign a relevance score (0.0 to 1.0) indicating how important this topic was to the meeting
      
      Identify only distinct, meaningful topics with relevance above ${this.minTopicRelevance}.
      Limit to a maximum of ${this.maxTopics} topics.
      
      Also identify which segments of the transcript (by segment ID) correspond to each topic.
      
      Return your analysis as a JSON object with 'topics' and 'topicSegments' properties.
      
      TRANSCRIPT:
      ${fullText}
      
      TRANSCRIPT SEGMENT IDS:
      ${transcript.segments.map((s) => `${s.id}: ${s.content.substring(0, 50)}...`).join('\n')}
    `;

    const response = await this.callLLM(
      'Extract topics from transcript',
      prompt,
    );

    try {
      const analysisResult = JSON.parse(response);

      // Ensure each topic has an ID
      analysisResult.topics = analysisResult.topics.map((topic: any) => ({
        ...topic,
        id: topic.id || `topic-${uuidv4().substring(0, 8)}`,
      }));

      // Filter by minimum relevance
      analysisResult.topics = analysisResult.topics.filter(
        (topic: any) => topic.relevance >= this.minTopicRelevance,
      );

      // Limit to max topics
      if (analysisResult.topics.length > this.maxTopics) {
        analysisResult.topics = analysisResult.topics
          .sort((a: any, b: any) => b.relevance - a.relevance)
          .slice(0, this.maxTopics);
      }

      return analysisResult;
    } catch (error) {
      this.logger.error(
        `Error parsing topic extraction response: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Return a minimal valid result if parsing fails
      return {
        topics: [
          {
            id: `topic-${uuidv4().substring(0, 8)}`,
            name: 'Meeting Discussion',
            description: 'General discussion topics from the meeting.',
            keywords: ['meeting', 'discussion'],
            relevance: 1.0,
          },
        ],
        topicSegments: {},
      };
    }
  }

  /**
   * Analyze relationships between topics
   */
  private async analyzeTopicRelationships(
    topics: Array<{
      id: string;
      name: string;
      description: string;
      keywords: string[];
    }>,
  ): Promise<
    Array<{
      source: string;
      target: string;
      relationship: string;
      strength: number;
    }>
  > {
    this.logger.info('Analyzing relationships between topics');

    if (topics.length <= 1) {
      return []; // No relationships with only one topic
    }

    const prompt = `
      Analyze the relationships between the following meeting topics:
      
      ${topics.map((t) => `Topic ID: ${t.id}\nName: ${t.name}\nDescription: ${t.description}\nKeywords: ${t.keywords.join(', ')}`).join('\n\n')}
      
      For each pair of related topics:
      1. Identify the source topic ID and target topic ID
      2. Describe the nature of their relationship in a few words
      3. Assign a strength score (0.0 to 1.0) indicating how strongly they are related
      
      Only include relationships with a strength of at least 0.3.
      
      Return your analysis as a JSON array of objects, each with 'source', 'target', 'relationship', and 'strength' properties.
    `;

    const response = await this.callLLM('Analyze topic relationships', prompt);

    try {
      const relationships = JSON.parse(response);

      // Validate relationships
      return relationships.filter(
        (rel: any) =>
          topics.some((t) => t.id === rel.source) &&
          topics.some((t) => t.id === rel.target) &&
          rel.strength >= 0.3,
      );
    } catch (error) {
      this.logger.error(
        `Error parsing topic relationships: ${error instanceof Error ? error.message : String(error)}`,
      );
      return []; // Return empty relationships on error
    }
  }

  /**
   * Track topic transitions throughout the meeting
   */
  private async trackTopicTransitions(
    transcript: MeetingTranscript,
    topics: Array<{
      id: string;
      name: string;
    }>,
  ): Promise<
    Array<{
      fromTopic: string | null;
      toTopic: string;
      timestamp: number;
      segmentId: string;
      transitionType: 'smooth' | 'abrupt' | 'digression' | 'return';
    }>
  > {
    this.logger.info('Tracking topic transitions');

    if (topics.length <= 1 || transcript.segments.length <= 5) {
      return []; // No meaningful transitions with only one topic or few segments
    }

    // Select sample segments to analyze transitions
    const sampleSegments = this.selectRepresentativeSegments(
      transcript.segments,
      15,
    );

    const prompt = `
      Analyze the topic transitions in this meeting based on the transcript segments below.
      
      TOPICS:
      ${topics.map((t) => `${t.id}: ${t.name}`).join('\n')}
      
      TRANSCRIPT SEGMENTS (in chronological order):
      ${sampleSegments.map((s) => `Segment ${s.id} [${s.startTime}ms]: ${s.content}`).join('\n\n')}
      
      For each significant topic transition you identify:
      1. The topic being transitioned from (null if it's the first topic)
      2. The topic being transitioned to
      3. The timestamp when the transition occurred
      4. The segment ID where the transition happens
      5. The type of transition: 'smooth', 'abrupt', 'digression', or 'return'
      
      Return the transitions as a JSON array ordered by timestamp.
    `;

    const response = await this.callLLM('Track topic transitions', prompt);

    try {
      const transitions = JSON.parse(response);

      // Validate transitions
      return transitions.filter(
        (transition: any) =>
          (transition.fromTopic === null ||
            topics.some((t) => t.id === transition.fromTopic)) &&
          topics.some((t) => t.id === transition.toTopic) &&
          transcript.segments.some((s) => s.id === transition.segmentId),
      );
    } catch (error) {
      this.logger.error(
        `Error parsing topic transitions: ${error instanceof Error ? error.message : String(error)}`,
      );
      return []; // Return empty transitions on error
    }
  }

  /**
   * Calculate time allocation for each topic
   */
  private calculateTimeAllocation(
    transcript: MeetingTranscript,
    topics: Array<{ id: string; name: string }>,
    topicSegments: Record<string, string[]>,
  ): Record<
    string,
    {
      totalTime: number;
      percentage: number;
      speakerDistribution: Record<string, number>;
    }
  > {
    this.logger.info('Calculating time allocation for topics');

    const timeAllocation: Record<
      string,
      {
        totalTime: number;
        percentage: number;
        speakerDistribution: Record<string, number>;
      }
    > = {};

    // Initialize with zero time for all topics
    for (const topic of topics) {
      timeAllocation[topic.id] = {
        totalTime: 0,
        percentage: 0,
        speakerDistribution: {},
      };
    }

    // Calculate total meeting time
    const totalMeetingTime = transcript.segments.reduce(
      (total, segment) => total + (segment.endTime - segment.startTime),
      0,
    );

    // Calculate time for each topic based on segments
    for (const topic of topics) {
      const segmentIds = topicSegments[topic.id] || [];

      // Track time by speaker
      const speakerTime: Record<string, number> = {};

      for (const segmentId of segmentIds) {
        const segment = transcript.segments.find((s) => s.id === segmentId);

        if (segment) {
          const segmentDuration = segment.endTime - segment.startTime;
          timeAllocation[topic.id].totalTime += segmentDuration;

          // Track speaker distribution
          const speakerId = segment.speakerId;
          speakerTime[speakerId] =
            (speakerTime[speakerId] || 0) + segmentDuration;
        }
      }

      // Calculate percentages
      if (totalMeetingTime > 0) {
        timeAllocation[topic.id].percentage =
          (timeAllocation[topic.id].totalTime / totalMeetingTime) * 100;
      }

      // Set speaker distribution
      timeAllocation[topic.id].speakerDistribution = speakerTime;
    }

    return timeAllocation;
  }

  /**
   * Select representative segments for analysis
   */
  private selectRepresentativeSegments(
    segments: MeetingTranscript['segments'],
    maxSegments: number,
  ): MeetingTranscript['segments'] {
    if (segments.length <= maxSegments) {
      return segments;
    }

    // Simple algorithm: take the first, last, and evenly distributed segments in between
    const selectedSegments: MeetingTranscript['segments'] = [];
    selectedSegments.push(segments[0]); // First segment

    if (segments.length >= 3) {
      // Select evenly distributed segments
      const step = Math.floor((segments.length - 2) / (maxSegments - 2));
      for (let i = step; i < segments.length - 1; i += step) {
        if (selectedSegments.length < maxSegments - 1) {
          selectedSegments.push(segments[i]);
        }
      }
    }

    selectedSegments.push(segments[segments.length - 1]); // Last segment

    return selectedSegments;
  }

  /**
   * Analyze a specific segment of the transcript
   */
  async analyzeTranscriptSegment(
    segment: string,
    context?: any,
  ): Promise<AgentOutput> {
    this.logger.info('Analyzing transcript segment for topics');

    const prompt = `
      Identify the discussion topics in this meeting transcript segment.
      
      If provided, use the existing topics for context and determine which ones are present in this segment.
      If no existing topics are provided, identify new topics.
      
      For each topic found in this segment:
      1. Provide a concise name (2-5 words)
      2. Write a brief description (1-2 sentences)
      3. List key terms/keywords (4-6 terms)
      4. Assign a relevance score (0.0 to 1.0) specific to this segment
      
      CONTEXT (Existing Topics):
      ${context?.existingTopics ? JSON.stringify(context.existingTopics, null, 2) : 'No existing topics provided'}
      
      TRANSCRIPT SEGMENT:
      ${segment}
      
      Return your analysis as a JSON object.
    `;

    const response = await this.callLLM('Analyze segment for topics', prompt);

    try {
      const segmentAnalysis = JSON.parse(response);

      // Assess confidence in the analysis
      const confidence = await this.assessConfidence(segmentAnalysis);

      return {
        content: segmentAnalysis,
        confidence,
        reasoning: `Identified ${segmentAnalysis.topics?.length || 0} topics in this segment based on content analysis and keyword frequency.`,
        metadata: {
          segmentLength: segment.length,
          hasExistingContext: !!context?.existingTopics,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(
        `Error analyzing transcript segment: ${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        content: {
          topics: [],
        },
        confidence: ConfidenceLevel.LOW,
        reasoning:
          'Failed to properly analyze the segment due to parsing error.',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          segmentLength: segment.length,
        },
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Merge multiple analyses into a consolidated result
   */
  async mergeAnalyses(analyses: AgentOutput[]): Promise<AgentOutput> {
    this.logger.info(`Merging ${analyses.length} topic analyses`);

    if (analyses.length === 0) {
      throw new Error('No analyses to merge');
    }

    if (analyses.length === 1) {
      return analyses[0];
    }

    // Extract topics from all analyses
    const allTopics: any[] = [];
    for (const analysis of analyses) {
      if (analysis.content.topics) {
        allTopics.push(...analysis.content.topics);
      }
    }

    const prompt = `
      Merge the following topic analyses into a cohesive result.
      
      TOPICS FROM MULTIPLE ANALYSES:
      ${JSON.stringify(allTopics, null, 2)}
      
      Create a consolidated list that:
      1. Combines similar topics
      2. Removes duplicates
      3. Preserves unique topics
      4. Adjusts relevance scores to reflect overall importance
      5. Merges keyword lists appropriately
      
      Return a JSON object with merged 'topics' array.
      Limit to a maximum of ${this.maxTopics} topics, prioritizing by relevance.
    `;

    const response = await this.callLLM('Merge topic analyses', prompt);

    try {
      const mergedAnalysis = JSON.parse(response);

      // Calculate average confidence from input analyses
      const avgConfidence =
        analyses.reduce(
          (sum, analysis) =>
            sum +
            (analysis.confidence === ConfidenceLevel.HIGH
              ? 1.0
              : analysis.confidence === ConfidenceLevel.MEDIUM
                ? 0.7
                : analysis.confidence === ConfidenceLevel.LOW
                  ? 0.4
                  : 0.2),
          0,
        ) / analyses.length;

      const confidence =
        avgConfidence > 0.8
          ? ConfidenceLevel.HIGH
          : avgConfidence > 0.5
            ? ConfidenceLevel.MEDIUM
            : ConfidenceLevel.LOW;

      return {
        content: mergedAnalysis,
        confidence,
        reasoning: `Merged ${analyses.length} analyses containing a total of ${allTopics.length} topics into ${mergedAnalysis.topics.length} consolidated topics.`,
        metadata: {
          sourceAnalyses: analyses.length,
          originalTopicCount: allTopics.length,
          mergedTopicCount: mergedAnalysis.topics.length,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(
        `Error merging topic analyses: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fall back to first analysis if merging fails
      return analyses[0];
    }
  }

  /**
   * Prioritize information based on relevance
   */
  async prioritizeInformation(output: any): Promise<any> {
    this.logger.info('Prioritizing topic information');

    if (!output.topics || !Array.isArray(output.topics)) {
      return output;
    }

    // Sort topics by relevance
    output.topics.sort((a: any, b: any) => b.relevance - a.relevance);

    // Keep only the most relevant topics
    if (output.topics.length > this.maxTopics) {
      output.topics = output.topics.slice(0, this.maxTopics);
    }

    // Update topic relationships to only include remaining topics
    if (output.topicRelationships) {
      const topicIds = output.topics.map((t: any) => t.id);
      output.topicRelationships = output.topicRelationships.filter(
        (rel: any) =>
          topicIds.includes(rel.source) && topicIds.includes(rel.target),
      );
    }

    return output;
  }

  /**
   * Notify coordinator of task completion
   */
  private async notifyTaskCompletion(
    taskId: string,
    output: AgentOutput,
  ): Promise<void> {
    const message = this.createMessage(MessageType.RESPONSE, ['coordinator'], {
      messageType: 'TASK_COMPLETED',
      taskId,
      output,
    });

    await this.sendMessage(message);
  }

  /**
   * Get default system prompt for topic discovery
   */
  protected getDefaultSystemPrompt(): string {
    return `You are the Topic Discovery Agent, specialized in identifying and analyzing discussion topics in meeting transcripts.
Your responsibilities include:
- Identifying main topics of discussion and their relevance
- Mapping relationships between different topics
- Tracking topic transitions throughout the meeting
- Measuring time allocation for each topic
- Evaluating the importance and relevance of topics

When analyzing topics, focus on substantive discussion points rather than procedural elements.
Be thorough in your analysis, but prioritize topics by relevance to avoid overwhelming users with minor points.`;
  }
}
