/**
 * Sentiment Analysis Agent for the Agentic Meeting Analysis System
 */
import { v4 as uuidv4 } from 'uuid';
import {
  ISpecialistAnalysisAgent,
  AgentExpertise,
  AgentOutput,
  AnalysisGoalType,
  AnalysisTask,
  // TODO: Why is this oimported? Should this be used in the agent?
  AnalysisTaskStatus,
  ConfidenceLevel,
  MessageType,
  AgentRole,
} from '../../interfaces/agent.interface';
import { MeetingTranscript } from '../../interfaces/state.interface';
import { BaseMeetingAnalysisAgent } from '../base-meeting-analysis-agent';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ChatOpenAI } from '@langchain/openai';

/**
 * Configuration options for SentimentAnalysisAgent
 */
export interface SentimentAnalysisAgentConfig {
  id?: string;
  name?: string;
  logger?: Logger;
  llm?: ChatOpenAI;
  systemPrompt?: string;
  enableTopicSentiment?: boolean;
  enableParticipantSentiment?: boolean;
  enableSentimentShiftTracking?: boolean;
  enableAlignmentAnalysis?: boolean;
  enableEnthusiasmDetection?: boolean;
}

/**
 * Sentiment scale for analysis outputs
 */
export enum SentimentScale {
  VERY_NEGATIVE = 'very_negative',
  NEGATIVE = 'negative',
  SLIGHTLY_NEGATIVE = 'slightly_negative',
  NEUTRAL = 'neutral',
  SLIGHTLY_POSITIVE = 'slightly_positive',
  POSITIVE = 'positive',
  VERY_POSITIVE = 'very_positive',
}

/**
 * Implementation of the Sentiment Analysis Agent
 * This agent is responsible for:
 * - Evaluating sentiment for topics and decisions
 * - Tracking sentiment shifts throughout the meeting
 * - Identifying areas of concern or enthusiasm
 * - Detecting enthusiasm levels
 * - Analyzing participant alignment on issues
 */
export class SentimentAnalysisAgent
  extends BaseMeetingAnalysisAgent
  implements ISpecialistAnalysisAgent
{
  public readonly role: AgentRole = AgentRole.WORKER;
  private enableTopicSentiment: boolean;
  private enableParticipantSentiment: boolean;
  private enableSentimentShiftTracking: boolean;
  private enableAlignmentAnalysis: boolean;
  private enableEnthusiasmDetection: boolean;

  /**
   * Create a new Sentiment Analysis Agent
   */
  constructor(config: SentimentAnalysisAgentConfig) {
    super({
      id: config.id,
      name: config.name || 'Sentiment Analysis Agent',
      expertise: [AgentExpertise.SENTIMENT_ANALYSIS],
      capabilities: [AnalysisGoalType.ANALYZE_SENTIMENT],
      logger: config.logger,
      llm: config.llm,
      systemPrompt: config.systemPrompt,
    });

    this.enableTopicSentiment = config.enableTopicSentiment !== false;
    this.enableParticipantSentiment =
      config.enableParticipantSentiment !== false;
    this.enableSentimentShiftTracking =
      config.enableSentimentShiftTracking !== false;
    this.enableAlignmentAnalysis = config.enableAlignmentAnalysis !== false;
    this.enableEnthusiasmDetection = config.enableEnthusiasmDetection !== false;

    this.logger.info(
      `Initialized ${this.name} with features: topicSentiment=${this.enableTopicSentiment}, participantSentiment=${this.enableParticipantSentiment}`,
    );
  }

  /**
   * Initialize the sentiment analysis agent
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
   * Process a sentiment analysis task
   */
  async processTask(task: AnalysisTask): Promise<AgentOutput> {
    this.logger.info(`Processing sentiment analysis task: ${task.id}`);

    if (task.type !== AnalysisGoalType.ANALYZE_SENTIMENT) {
      throw new Error(
        `Sentiment Analysis Agent cannot process task type: ${task.type}`,
      );
    }

    try {
      // Get transcript data
      const transcript = await this.readMemory('transcript', 'meeting');
      const metadata = await this.readMemory('metadata', 'meeting');

      if (!transcript) {
        throw new Error('Meeting transcript not found in memory');
      }

      // Get topics if we need topic sentiment analysis
      let topics = null;
      if (this.enableTopicSentiment) {
        const topicsData = await this.readMemory('analysis.topics', 'meeting');
        topics = topicsData?.topics || null;
      }

      // Get decisions if available for context
      let decisions = null;
      const decisionsData = await this.readMemory(
        'analysis.decisions',
        'meeting',
      );
      decisions = decisionsData?.decisions || null;

      // Analyze overall sentiment
      const overallSentiment = await this.analyzeOverallSentiment(transcript);

      // Analyze sentiment by participant
      let participantSentiment = null;
      if (this.enableParticipantSentiment) {
        participantSentiment = await this.analyzeParticipantSentiment(
          transcript,
          metadata,
        );
      }

      // Analyze sentiment by topic
      let topicSentiment = null;
      if (this.enableTopicSentiment && topics) {
        topicSentiment = await this.analyzeTopicSentiment(transcript, topics);
      }

      // Track sentiment shifts
      let sentimentShifts = null;
      if (this.enableSentimentShiftTracking) {
        sentimentShifts = await this.trackSentimentShifts(transcript);
      }

      // Detect areas of enthusiasm
      let enthusiasmAreas = null;
      if (this.enableEnthusiasmDetection) {
        enthusiasmAreas = await this.detectEnthusiasmAreas(transcript, topics);
      }

      // Analyze participant alignment
      let participantAlignment = null;
      if (this.enableAlignmentAnalysis) {
        participantAlignment = await this.analyzeParticipantAlignment(
          transcript,
          metadata,
          topics,
        );
      }

      // Create complete sentiment analysis
      const sentimentAnalysis = {
        overall: overallSentiment,
        byParticipant: participantSentiment,
        byTopic: topicSentiment,
        shifts: sentimentShifts,
        enthusiasmAreas: enthusiasmAreas,
        alignment: participantAlignment,
        metadata: {
          analysisTime: Date.now(),
          participantCount: metadata?.participants?.length || 0,
          topicCount: topics?.length || 0,
        },
      };

      // Assess confidence in the analysis
      const confidence = await this.assessConfidence(sentimentAnalysis);

      // Explain reasoning
      const reasoning = await this.explainReasoning(sentimentAnalysis);

      // Create output
      const output: AgentOutput = {
        content: sentimentAnalysis,
        confidence,
        reasoning,
        metadata: {
          taskId: task.id,
          meetingId: metadata?.meetingId || 'unknown',
        },
        timestamp: Date.now(),
      };

      // Notify coordinator of task completion
      await this.notifyTaskCompletion(task.id, output);

      return output;
    } catch (error) {
      this.logger.error(
        `Error processing sentiment analysis: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Analyze overall sentiment of the meeting
   */
  private async analyzeOverallSentiment(
    transcript: MeetingTranscript,
  ): Promise<{
    sentiment: SentimentScale;
    score: number;
    summary: string;
  }> {
    this.logger.info('Analyzing overall sentiment of the meeting');

    // Combine segments for analysis
    const fullText = transcript.segments.map((s) => s.content).join('\n');

    const prompt = `
      Analyze the overall sentiment of this meeting transcript.
      
      Consider:
      - The tone of language and word choice
      - Emotional expressions by participants
      - Discussion topics and how they were approached
      - The general atmosphere of the meeting
      
      TRANSCRIPT:
      ${fullText.length > 6000 ? fullText.substring(0, 6000) + '...' : fullText}
      
      Provide:
      1. A sentiment category from these options: very_negative, negative, slightly_negative, neutral, slightly_positive, positive, very_positive
      2. A numerical sentiment score from -1.0 (most negative) to +1.0 (most positive)
      3. A brief summary of why you assessed this sentiment (2-3 sentences)
      
      Return your analysis as a JSON object with 'sentiment', 'score', and 'summary' fields.
    `;

    const response = await this.callLLM('Analyze overall sentiment', prompt);

    try {
      const sentimentAnalysis = JSON.parse(response);

      return {
        sentiment: sentimentAnalysis.sentiment as SentimentScale,
        score: sentimentAnalysis.score,
        summary: sentimentAnalysis.summary,
      };
    } catch (error) {
      this.logger.error(
        `Error parsing overall sentiment: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Return a neutral sentiment if parsing fails
      return {
        sentiment: SentimentScale.NEUTRAL,
        score: 0,
        summary: 'Unable to analyze sentiment due to parsing error.',
      };
    }
  }

  /**
   * Analyze sentiment by participant
   */
  private async analyzeParticipantSentiment(
    transcript: MeetingTranscript,
    metadata: any,
  ): Promise<
    Record<
      string,
      {
        sentiment: SentimentScale;
        score: number;
        summary: string;
        expressedSentiments: Array<{
          segmentId: string;
          sentiment: SentimentScale;
          trigger?: string;
        }>;
      }
    >
  > {
    this.logger.info('Analyzing sentiment by participant');

    // Get participants
    const participants = metadata?.participants || [];

    if (participants.length === 0) {
      this.logger.warn('No participants found for sentiment analysis');
      return {};
    }

    // Group segments by speaker
    const segmentsBySpeaker: Record<string, Array<any>> = {};

    for (const segment of transcript.segments) {
      const speakerId = segment.speakerId;

      if (!segmentsBySpeaker[speakerId]) {
        segmentsBySpeaker[speakerId] = [];
      }

      segmentsBySpeaker[speakerId].push({
        id: segment.id,
        content: segment.content,
        startTime: segment.startTime,
      });
    }

    // Process each participant's sentiment
    const participantSentiment: Record<string, any> = {};

    for (const participant of participants) {
      const speakerId = participant.id;
      const speakerSegments = segmentsBySpeaker[speakerId] || [];

      if (speakerSegments.length < 2) {
        // Not enough data for this participant
        participantSentiment[speakerId] = {
          sentiment: SentimentScale.NEUTRAL,
          score: 0,
          summary: 'Insufficient data to analyze sentiment.',
          expressedSentiments: [],
        };
        continue;
      }

      const prompt = `
        Analyze the sentiment expressed by participant "${participant.name || speakerId}" in their contributions to the meeting.
        
        PARTICIPANT CONTRIBUTIONS:
        ${speakerSegments.map((seg) => `[SEGMENT ${seg.id}]\n${seg.content}`).join('\n\n')}
        
        Provide:
        1. An overall sentiment category from these options: very_negative, negative, slightly_negative, neutral, slightly_positive, positive, very_positive
        2. A numerical sentiment score from -1.0 (most negative) to +1.0 (most positive)
        3. A brief summary of their sentiment (1-2 sentences)
        4. A list of up to 5 specific expressed sentiments, with segment ID and sentiment category
        
        Return your analysis as a JSON object.
      `;

      try {
        const response = await this.callLLM(
          `Analyze sentiment for ${participant.name || speakerId}`,
          prompt,
        );
        const analysis = JSON.parse(response);

        participantSentiment[speakerId] = {
          sentiment: analysis.sentiment,
          score: analysis.score,
          summary: analysis.summary,
          expressedSentiments: analysis.expressedSentiments || [],
        };
      } catch (error) {
        this.logger.error(
          `Error analyzing sentiment for participant ${speakerId}: ${error instanceof Error ? error.message : String(error)}`,
        );

        // Use neutral sentiment on error
        participantSentiment[speakerId] = {
          sentiment: SentimentScale.NEUTRAL,
          score: 0,
          summary: 'Error analyzing sentiment.',
          expressedSentiments: [],
        };
      }
    }

    return participantSentiment;
  }

  /**
   * Analyze sentiment by topic
   */
  private async analyzeTopicSentiment(
    transcript: MeetingTranscript,
    topics: Array<any>,
  ): Promise<
    Record<
      string,
      {
        sentiment: SentimentScale;
        score: number;
        summary: string;
        byParticipant?: Record<string, SentimentScale>;
      }
    >
  > {
    this.logger.info('Analyzing sentiment by topic');

    // Simple implementation for brevity
    if (!topics || topics.length === 0) {
      return {};
    }

    const topicSentiment: Record<string, any> = {};

    // Process a few topics at a time to avoid context length issues
    const batchSize = 3;
    for (let i = 0; i < topics.length; i += batchSize) {
      const topicBatch = topics.slice(i, i + batchSize);

      // Prepare context for each topic
      const topicsWithSegments = await Promise.all(
        topicBatch.map(async (topic) => {
          // Get segments related to this topic
          const topicSegments: string[] = topic.segments || [];

          // Get up to 5 segments for context
          const sampleSegments =
            topicSegments.length > 5
              ? topicSegments.slice(0, 5)
              : topicSegments;

          const segmentTexts = sampleSegments
            .map((segId) => {
              const segment = transcript.segments.find((s) => s.id === segId);
              return segment
                ? `[SPEAKER: ${segment.speakerName || segment.speakerId}]\n${segment.content}`
                : '';
            })
            .filter(Boolean);

          return {
            id: topic.id,
            name: topic.name,
            description: topic.description,
            relevance: topic.relevance,
            segments: segmentTexts,
          };
        }),
      );

      // Create prompt for batch
      const prompt = `
        Analyze the sentiment expressed around these topics in the meeting:
        
        ${topicsWithSegments
          .map(
            (topic, index) => `
        TOPIC ${index + 1}: ${topic.name}
        Description: ${topic.description}
        
        RELEVANT SEGMENTS:
        ${topic.segments.join('\n\n')}
        `,
          )
          .join('\n\n')}
        
        For each topic, provide:
        1. An overall sentiment category from these options: very_negative, negative, slightly_negative, neutral, slightly_positive, positive, very_positive
        2. A numerical sentiment score from -1.0 (most negative) to +1.0 (most positive)
        3. A brief summary of the sentiment around this topic (1-2 sentences)
        
        Return your analysis as a JSON object with an array of topic sentiment analyses.
      `;

      try {
        const response = await this.callLLM('Analyze topic sentiment', prompt);
        const topicAnalyses = JSON.parse(response);

        // Add to results
        for (const analysis of topicAnalyses) {
          if (analysis.topicId) {
            topicSentiment[analysis.topicId] = {
              sentiment: analysis.sentiment,
              score: analysis.score,
              summary: analysis.summary,
            };
          }
        }
      } catch (error) {
        this.logger.error(
          `Error analyzing topic sentiment: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Continue with next batch
      }
    }

    return topicSentiment;
  }

  /**
   * Track sentiment shifts throughout the meeting
   */
  private async trackSentimentShifts(transcript: MeetingTranscript): Promise<
    Array<{
      startTime: number;
      endTime: number;
      beforeSentiment: SentimentScale;
      afterSentiment: SentimentScale;
      magnitude: number;
      trigger?: string;
      description: string;
    }>
  > {
    this.logger.info('Tracking sentiment shifts');

    // Simple implementation that looks for significant sentiment changes
    // For a complete implementation, this would analyze the transcript in chunks

    if (transcript.segments.length < 10) {
      return []; // Not enough data to track shifts
    }

    // Divide transcript into quarters for analysis
    const totalSegments = transcript.segments.length;
    const chunkSize = Math.floor(totalSegments / 4);

    const chunks = [
      transcript.segments.slice(0, chunkSize),
      transcript.segments.slice(chunkSize, chunkSize * 2),
      transcript.segments.slice(chunkSize * 2, chunkSize * 3),
      transcript.segments.slice(chunkSize * 3),
    ];

    // Analyze sentiment for each chunk
    const chunkSentiments = await Promise.all(
      chunks.map(async (chunk, index) => {
        const chunkText = chunk.map((s) => s.content).join('\n');

        const prompt = `
        Analyze the sentiment in this section of the meeting transcript.
        
        TRANSCRIPT SECTION ${index + 1}/4:
        ${chunkText}
        
        Provide:
        1. A sentiment category from these options: very_negative, negative, slightly_negative, neutral, slightly_positive, positive, very_positive
        2. A numerical sentiment score from -1.0 (most negative) to +1.0 (most positive)
        
        Return a JSON object with 'sentiment' and 'score' fields.
      `;

        try {
          const response = await this.callLLM(
            `Analyze sentiment for chunk ${index + 1}`,
            prompt,
          );
          const analysis = JSON.parse(response);

          return {
            sentiment: analysis.sentiment,
            score: analysis.score,
            startTime: chunk[0].startTime,
            endTime: chunk[chunk.length - 1].endTime,
          };
        } catch (error) {
          this.logger.error(
            `Error analyzing chunk sentiment: ${error instanceof Error ? error.message : String(error)}`,
          );

          return {
            sentiment: SentimentScale.NEUTRAL,
            score: 0,
            startTime: chunk[0].startTime,
            endTime: chunk[chunk.length - 1].endTime,
          };
        }
      }),
    );

    // Identify significant shifts between chunks
    const shifts: Array<any> = [];

    for (let i = 0; i < chunkSentiments.length - 1; i++) {
      const current = chunkSentiments[i];
      const next = chunkSentiments[i + 1];

      // Calculate shift magnitude
      const magnitude = Math.abs(next.score - current.score);

      // Only record significant shifts (threshold of 0.3)
      if (magnitude >= 0.3) {
        // Find potential trigger segments between chunks
        const triggerSegmentIndex = (i + 1) * chunkSize - 1;
        const triggerSegment = transcript.segments[triggerSegmentIndex];

        shifts.push({
          startTime: current.startTime,
          endTime: next.endTime,
          beforeSentiment: current.sentiment,
          afterSentiment: next.sentiment,
          magnitude,
          trigger: triggerSegment?.content.substring(0, 100) + '...',
          description: `Sentiment shifted from ${current.sentiment} to ${next.sentiment}`,
        });
      }
    }

    return shifts;
  }

  /**
   * Detect areas of enthusiasm in the transcript
   */
  private async detectEnthusiasmAreas(
    transcript: MeetingTranscript,
    topics: Array<any> | null,
  ): Promise<
    Array<{
      type: 'topic' | 'segment' | 'discussion';
      referenceId?: string;
      description: string;
      level: 'low' | 'medium' | 'high';
      participants: string[];
    }>
  > {
    this.logger.info('Detecting enthusiasm areas');

    // Simplified implementation
    return [];
  }

  /**
   * Analyze participant alignment on topics
   */
  private async analyzeParticipantAlignment(
    transcript: MeetingTranscript,
    metadata: any,
    topics: Array<any> | null,
  ): Promise<
    Array<{
      topicId?: string;
      topicName?: string;
      alignedGroups: Array<{
        participants: string[];
        sentiment: SentimentScale;
        description: string;
      }>;
      disagreements: Array<{
        participants: string[];
        description: string;
      }>;
    }>
  > {
    this.logger.info('Analyzing participant alignment');

    // Simplified implementation
    return [];
  }

  /**
   * Analyze a specific segment of the transcript
   */
  async analyzeTranscriptSegment(
    segment: string,
    context?: any,
  ): Promise<AgentOutput> {
    this.logger.info('Analyzing transcript segment for sentiment');

    const prompt = `
      Analyze the sentiment expressed in this meeting transcript segment.
      
      For your analysis, consider:
      - The tone of language and word choice
      - Emotional expressions by speakers
      - Discussion topics and how they are approached
      
      Additional context:
      ${context?.speakerInfo ? `Speakers: ${context.speakerInfo}` : 'No speaker information available'}
      ${context?.topicInfo ? `Topic being discussed: ${context.topicInfo}` : ''}
      
      TRANSCRIPT SEGMENT:
      ${segment}
      
      Provide:
      1. An overall sentiment assessment
      2. Specific sentiment expressions by speaker
      3. Any emotional dynamics or shifts within this segment
      
      Return your analysis as a JSON object.
    `;

    const response = await this.callLLM('Analyze segment sentiment', prompt);

    try {
      const sentimentAnalysis = JSON.parse(response);

      // Assess confidence in the analysis
      const confidence = await this.assessConfidence(sentimentAnalysis);

      return {
        content: sentimentAnalysis,
        confidence,
        reasoning: `Identified sentiment patterns based on language tone, emotional expressions, and discussion approach.`,
        metadata: {
          segmentLength: segment.length,
          hasSpeakerContext: !!context?.speakerInfo,
          hasTopicContext: !!context?.topicInfo,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(
        `Error analyzing segment sentiment: ${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        content: {
          sentiment: SentimentScale.NEUTRAL,
          score: 0,
          expressions: [],
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
    this.logger.info(`Merging ${analyses.length} sentiment analyses`);

    if (analyses.length === 0) {
      throw new Error('No analyses to merge');
    }

    if (analyses.length === 1) {
      return analyses[0];
    }

    // Simple implementation that averages sentiment scores
    let totalScore = 0;
    let totalAnalyses = 0;
    const allExpressions: any[] = [];

    for (const analysis of analyses) {
      if (analysis.content.score !== undefined) {
        totalScore += analysis.content.score;
        totalAnalyses++;
      }

      if (analysis.content.expressions) {
        allExpressions.push(...analysis.content.expressions);
      }
    }

    const averageScore = totalAnalyses > 0 ? totalScore / totalAnalyses : 0;
    const averageSentiment = this.scoreToCategoricalSentiment(averageScore);

    // Create merged analysis
    const mergedContent = {
      sentiment: averageSentiment,
      score: averageScore,
      expressions: allExpressions.slice(0, 10), // Limit to top 10 expressions
      summary: `Merged sentiment from ${analyses.length} segment analyses.`,
    };

    // Calculate average confidence
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
      content: mergedContent,
      confidence,
      reasoning: `Merged ${analyses.length} sentiment analyses by averaging scores and combining key expressions.`,
      metadata: {
        sourceAnalyses: analyses.length,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Convert numerical score to categorical sentiment
   */
  private scoreToCategoricalSentiment(score: number): SentimentScale {
    if (score <= -0.75) return SentimentScale.VERY_NEGATIVE;
    if (score <= -0.4) return SentimentScale.NEGATIVE;
    if (score <= -0.1) return SentimentScale.SLIGHTLY_NEGATIVE;
    if (score < 0.1) return SentimentScale.NEUTRAL;
    if (score < 0.4) return SentimentScale.SLIGHTLY_POSITIVE;
    if (score < 0.75) return SentimentScale.POSITIVE;
    return SentimentScale.VERY_POSITIVE;
  }

  /**
   * Prioritize information based on importance
   */
  async prioritizeInformation(output: any): Promise<any> {
    this.logger.info('Prioritizing sentiment information');

    // Simple prioritization that puts overall sentiment first,
    // followed by shifts, then participant and topic sentiments

    const prioritized = { ...output };

    // Limit the number of expressions to reduce output size
    if (prioritized.expressions && prioritized.expressions.length > 5) {
      prioritized.expressions = prioritized.expressions.slice(0, 5);
    }

    // Limit sentiment shifts to the most significant
    if (prioritized.shifts && prioritized.shifts.length > 3) {
      prioritized.shifts.sort((a: any, b: any) => b.magnitude - a.magnitude);
      prioritized.shifts = prioritized.shifts.slice(0, 3);
    }

    return prioritized;
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
   * Get default system prompt for sentiment analysis
   */
  protected getDefaultSystemPrompt(): string {
    return `You are the Sentiment Analysis Agent, specialized in evaluating sentiment in meeting transcripts.
Your responsibilities include:
- Analyzing overall sentiment of the meeting
- Tracking sentiment patterns for individual participants
- Evaluating sentiment around specific topics
- Identifying shifts in sentiment throughout the meeting
- Detecting areas of enthusiasm or concern
- Analyzing alignment between participants on issues

When analyzing sentiment, be objective and nuanced. 
Focus on linguistic and contextual cues rather than making assumptions.
Consider both explicit emotional expressions and subtle indicators in your analysis.`;
  }
}
