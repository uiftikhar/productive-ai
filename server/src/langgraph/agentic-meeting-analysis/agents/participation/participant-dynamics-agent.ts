/**
 * Participant Dynamics Agent for the Agentic Meeting Analysis System
 */
import { v4 as uuidv4 } from 'uuid';
import {
  ISpecialistAnalysisAgent,
  AgentExpertise,
  AgentOutput,
  AnalysisGoalType,
  AnalysisTask,
  // TODO: Why is this oimported? Should this be used in the agent
  AnalysisTaskStatus,
  ConfidenceLevel,
  MessageType,
  AgentRole,
} from '../../interfaces/agent.interface';
import { MeetingTranscript } from '../../interfaces/state.interface';
import { BaseMeetingAnalysisAgent } from '../base-meeting-analysis-agent';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ChatOpenAI } from '@langchain/openai';
import { InstructionTemplateNameEnum } from '../../../../shared/prompts/instruction-templates';
import {
  RagPromptManager,
  RagRetrievalStrategy,
} from '../../../../shared/services/rag-prompt-manager.service';
import { SystemRoleEnum } from '../../../../shared/prompts/prompt-types';

/**
 * Configuration options for ParticipantDynamicsAgent
 */
export interface ParticipantDynamicsAgentConfig {
  id?: string;
  name?: string;
  logger?: Logger;
  llm?: ChatOpenAI;
  systemPrompt?: string;
  enableCollaborationDetection?: boolean;
  enableInfluenceAnalysis?: boolean;
  enableDisengagementDetection?: boolean;
  enableInterruptionAnalysis?: boolean;
  minConfidence?: number;
}

/**
 * Implementation of the Participant Dynamics Agent
 * This agent is responsible for:
 * - Tracking speaking time distribution
 * - Identifying participation patterns
 * - Detecting collaboration and conflict
 * - Analyzing influence dynamics
 * - Detecting disengagement patterns
 */
export class ParticipantDynamicsAgent
  extends BaseMeetingAnalysisAgent
  implements ISpecialistAnalysisAgent
{
  public readonly role: AgentRole = AgentRole.WORKER;
  private enableCollaborationDetection: boolean;
  private enableInfluenceAnalysis: boolean;
  private enableDisengagementDetection: boolean;
  private enableInterruptionAnalysis: boolean;
  private minConfidence: number;
  private ragPromptManager: RagPromptManager;

  /**
   * Create a new Participant Dynamics Agent
   */
  constructor(config: ParticipantDynamicsAgentConfig) {
    super({
      id: config.id,
      name: config.name || 'Participant Dynamics Agent',
      expertise: [AgentExpertise.PARTICIPANT_DYNAMICS],
      capabilities: [AnalysisGoalType.ANALYZE_PARTICIPATION],
      logger: config.logger,
      llm: config.llm,
      systemPrompt: config.systemPrompt,
    });

    this.enableCollaborationDetection =
      config.enableCollaborationDetection !== false;
    this.enableInfluenceAnalysis = config.enableInfluenceAnalysis !== false;
    this.enableDisengagementDetection =
      config.enableDisengagementDetection !== false;
    this.enableInterruptionAnalysis =
      config.enableInterruptionAnalysis !== false;
    this.minConfidence = config.minConfidence || 0.6;

    this.ragPromptManager = new RagPromptManager();

    this.logger.info(
      `Initialized ${this.name} with features: collaborationDetection=${this.enableCollaborationDetection}, influenceAnalysis=${this.enableInfluenceAnalysis}`,
    );
  }

  /**
   * Initialize the participant dynamics agent
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
   * Process a participation analysis task
   */
  async processTask(task: AnalysisTask): Promise<AgentOutput> {
    this.logger.info(`Processing participation dynamics task: ${task.id}`);

    if (task.type !== AnalysisGoalType.ANALYZE_PARTICIPATION) {
      throw new Error(
        `Participant Dynamics Agent cannot process task type: ${task.type}`,
      );
    }

    try {
      // Get transcript data
      const transcript = await this.readMemory('transcript', 'meeting');
      const metadata = await this.readMemory('metadata', 'meeting');

      if (!transcript) {
        throw new Error('Meeting transcript not found in memory');
      }

      // Track speaking time distribution
      const speakingTimeDistribution =
        this.trackSpeakingTimeDistribution(transcript);

      // Identify participation patterns
      const participationPatterns = await this.identifyParticipationPatterns(
        transcript,
        metadata,
      );

      // Detect collaboration and conflicts
      let collaborationConflicts = null;
      if (this.enableCollaborationDetection) {
        collaborationConflicts = await this.detectCollaborationAndConflict(
          transcript,
          metadata,
        );
      }

      // Analyze influence dynamics
      let influenceAnalysis = null;
      if (this.enableInfluenceAnalysis) {
        influenceAnalysis = await this.analyzeInfluenceDynamics(
          transcript,
          metadata,
        );
      }

      // Detect disengagement patterns
      let disengagementPatterns = null;
      if (this.enableDisengagementDetection) {
        disengagementPatterns = await this.detectDisengagementPatterns(
          transcript,
          metadata,
        );
      }

      // Analyze interruptions
      let interruptionAnalysis = null;
      if (this.enableInterruptionAnalysis) {
        interruptionAnalysis = await this.analyzeInterruptions(transcript);
      }

      // Create complete participation analysis
      const participationAnalysis = {
        speakingTimeDistribution,
        participationPatterns,
        collaborationConflicts,
        influenceAnalysis,
        disengagementPatterns,
        interruptionAnalysis,
        metadata: {
          analysisTime: Date.now(),
          participantCount: metadata?.participants?.length || 0,
          segmentCount: transcript.segments.length,
        },
      };

      // Assess confidence in the analysis
      const confidence = await this.assessConfidence(participationAnalysis);

      // Explain reasoning
      const reasoning = await this.explainReasoning(participationAnalysis);

      // Create output
      const output: AgentOutput = {
        content: participationAnalysis,
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
        `Error processing participation analysis: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Track speaking time distribution
   */
  private trackSpeakingTimeDistribution(transcript: MeetingTranscript): Record<
    string,
    {
      totalTime: number;
      percentageOfMeeting: number;
      segmentCount: number;
      avgSegmentLength: number;
    }
  > {
    this.logger.info('Tracking speaking time distribution');

    const distribution: Record<
      string,
      {
        totalTime: number;
        percentageOfMeeting: number;
        segmentCount: number;
        avgSegmentLength: number;
      }
    > = {};

    // Calculate total meeting time
    const totalMeetingTime = transcript.segments.reduce(
      (total, segment) => total + (segment.endTime - segment.startTime),
      0,
    );

    // Group by speaker
    const segmentsBySpeaker: Record<string, MeetingTranscript['segments']> = {};

    for (const segment of transcript.segments) {
      const speakerId = segment.speakerId;

      if (!segmentsBySpeaker[speakerId]) {
        segmentsBySpeaker[speakerId] = [];
      }

      segmentsBySpeaker[speakerId].push(segment);
    }

    // Calculate stats for each speaker
    for (const [speakerId, segments] of Object.entries(segmentsBySpeaker)) {
      const speakerTotalTime = segments.reduce(
        (total, segment) => total + (segment.endTime - segment.startTime),
        0,
      );

      distribution[speakerId] = {
        totalTime: speakerTotalTime,
        percentageOfMeeting:
          totalMeetingTime > 0
            ? (speakerTotalTime / totalMeetingTime) * 100
            : 0,
        segmentCount: segments.length,
        avgSegmentLength:
          segments.length > 0 ? speakerTotalTime / segments.length : 0,
      };
    }

    return distribution;
  }

  /**
   * Identify participation patterns
   */
  private async identifyParticipationPatterns(
    transcript: MeetingTranscript,
    metadata: any,
  ): Promise<{
    dominantSpeakers: string[];
    leastActiveSpeakers: string[];
    engagementPatterns: Record<
      string,
      'dominant' | 'active' | 'responsive' | 'passive' | 'inactive'
    >;
    participationTrends: Array<{
      speakerId: string;
      trend: 'increasing' | 'decreasing' | 'consistent';
      description: string;
    }>;
  }> {
    this.logger.info('Identifying participation patterns');

    // Get participant information
    const participants = metadata?.participants || [];

    // Create a time-ordered array of segments
    const orderedSegments = [...transcript.segments].sort(
      (a, b) => a.startTime - b.startTime,
    );

    // Create content for RAG prompt
    const instructionContent = `
      Analyze the participation patterns in this meeting transcript.
      
      For each participant, determine:
      1. Their level of engagement (dominant, active, responsive, passive, or inactive)
      2. Their participation trend over time (increasing, decreasing, or consistent)
      3. Notable participation behaviors
      
      Also identify:
      - The most dominant speakers (who spoke the most or had the most influence)
      - The least active speakers (who participated minimally)
      
      Consider not just speaking time, but also conversation dynamics, initiative in discussions,
      and responsiveness to others.
      
      MEETING PARTICIPANTS:
      ${participants.map((p: any) => `- ${p.name || p.id} (${p.role || 'Unknown role'})`).join('\n')}
      
      SPEAKING TIME DISTRIBUTION:
      ${Object.entries(this.trackSpeakingTimeDistribution(transcript))
        .map(([speakerId, stats]) => {
          const speaker = participants.find((p: any) => p.id === speakerId) || {
            name: speakerId,
          };
          return `- ${speaker.name || speakerId}: ${stats.totalTime}ms (${stats.percentageOfMeeting.toFixed(1)}% of meeting), ${stats.segmentCount} turns`;
        })
        .join('\n')}
    `;

    // Generate dummy embedding for simplicity
    const dummyEmbedding = new Array(1536)
      .fill(0)
      .map(() => Math.random() - 0.5);

    // Create RAG options
    const ragOptions = {
      userId: metadata.userId || 'system',
      queryText: 'Identify participation patterns in meeting',
      queryEmbedding: dummyEmbedding,
      strategy: RagRetrievalStrategy.CUSTOM,
      customFilter: {
        meetingId: metadata.meetingId,
      },
    };

    try {
      // Add transcript context to the instruction content
      const transcript_context = orderedSegments
        .map(
          (s) =>
            `[${new Date(s.startTime).toISOString()}] ${s.speakerName || s.speakerId}: ${s.content.substring(0, 100)}${s.content.length > 100 ? '...' : ''}`,
        )
        .join('\n\n');

      const enhancedContent = `${instructionContent}\n\nTRANSCRIPT SAMPLE (time-ordered):\n${transcript_context}`;

      // Use RAG prompt manager with enhanced content including transcript context
      const ragPrompt = await this.ragPromptManager.createRagPrompt(
        SystemRoleEnum.MEETING_ANALYST,
        InstructionTemplateNameEnum.CUSTOM,
        enhancedContent,
        ragOptions,
      );

      // Call LLM with the RAG-optimized prompt
      const response = await this.callLLM(
        'Identify participation patterns',
        ragPrompt.messages[0].content,
      );

      try {
        const analysis = JSON.parse(response);

        return {
          dominantSpeakers: analysis.dominantSpeakers || [],
          leastActiveSpeakers: analysis.leastActiveSpeakers || [],
          engagementPatterns: analysis.engagementPatterns || {},
          participationTrends: analysis.participationTrends || [],
        };
      } catch (error) {
        this.logger.error(
          `Error parsing participation patterns: ${error instanceof Error ? error.message : String(error)}`,
        );

        // Return default analysis on error
        return {
          dominantSpeakers: [],
          leastActiveSpeakers: [],
          engagementPatterns: {},
          participationTrends: [],
        };
      }
    } catch (error) {
      this.logger.error(
        `Error using RAG prompt manager: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Return default analysis on error
      return {
        dominantSpeakers: [],
        leastActiveSpeakers: [],
        engagementPatterns: {},
        participationTrends: [],
      };
    }
  }

  /**
   * Detect collaboration and conflict
   */
  private async detectCollaborationAndConflict(
    transcript: MeetingTranscript,
    metadata: any,
  ): Promise<{
    collaborationInstances: Array<{
      participants: string[];
      segmentIds: string[];
      type: string;
      description: string;
    }>;
    conflictInstances: Array<{
      participants: string[];
      segmentIds: string[];
      type: string;
      description: string;
      resolution?: string;
    }>;
    teamDynamics: {
      overallCollaborationScore: number;
      tensionAreas: string[];
      synergisticPairs: Array<[string, string]>;
    };
  }> {
    this.logger.info('Detecting collaboration and conflict patterns');

    // Create RAG-optimized prompt for collaboration/conflict detection
    const instructionContent = `
      Analyze the meeting transcript to identify instances of collaboration and conflict.
      
      Look for:
      1. Collaboration patterns: agreement, building on ideas, offering support, etc.
      2. Conflict patterns: disagreement, interrupting, dismissing ideas, etc.
      3. Team dynamics: overall collaboration level, tension areas, synergistic relationships
      
      TRANSCRIPT:
      ${transcript.segments
        .map(
          (s) =>
            `[SPEAKER: ${s.speakerName || s.speakerId} | SEGMENT: ${s.id}] ${s.content}`,
        )
        .join('\n\n')}
      
      Return your analysis as a JSON object with 'collaborationInstances', 'conflictInstances', and 'teamDynamics' properties.
    `;

    // Generate dummy embedding for simplicity
    const dummyEmbedding = new Array(1536)
      .fill(0)
      .map(() => Math.random() - 0.5);

    // Create RAG options
    const ragOptions = {
      userId: metadata.userId || 'system',
      queryText: 'Detect collaboration and conflict patterns in meeting',
      queryEmbedding: dummyEmbedding,
      strategy: RagRetrievalStrategy.CUSTOM,
      customFilter: {
        meetingId: metadata.meetingId,
      },
    };

    try {
      // Use RAG prompt manager
      const ragPrompt = await this.ragPromptManager.createRagPrompt(
        SystemRoleEnum.MEETING_ANALYST,
        InstructionTemplateNameEnum.CUSTOM,
        instructionContent,
        ragOptions,
      );

      // Call LLM with the RAG-optimized prompt
      const response = await this.callLLM(
        'Detect collaboration and conflict',
        ragPrompt.messages[0].content,
      );

      try {
        return JSON.parse(response);
      } catch (error) {
        this.logger.error(
          `Error parsing collaboration and conflict: ${error instanceof Error ? error.message : String(error)}`,
        );

        // Return default analysis on error
        return {
          collaborationInstances: [],
          conflictInstances: [],
          teamDynamics: {
            overallCollaborationScore: 0.5,
            tensionAreas: [],
            synergisticPairs: [],
          },
        };
      }
    } catch (error) {
      this.logger.error(
        `Error using RAG prompt manager: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fall back to direct prompt
      const fallbackPrompt = `
        Analyze the meeting transcript to identify key collaboration and conflict patterns.
        Return a simple JSON object with the analysis.
      `;

      const fallbackResponse = await this.callLLM(
        'Detect collaboration and conflict (fallback)',
        fallbackPrompt,
      );

      try {
        return JSON.parse(fallbackResponse);
      } catch (error) {
        // Return default analysis on all errors
        return {
          collaborationInstances: [],
          conflictInstances: [],
          teamDynamics: {
            overallCollaborationScore: 0.5,
            tensionAreas: [],
            synergisticPairs: [],
          },
        };
      }
    }
  }

  /**
   * Analyze influence dynamics
   */
  private async analyzeInfluenceDynamics(
    transcript: MeetingTranscript,
    metadata: any,
  ): Promise<{
    influenceRanking: Array<{
      participantId: string;
      influenceScore: number;
      influenceMechanisms: string[];
    }>;
    decisionInfluencers: Record<string, string[]>;
    persuasiveTactics: Array<{
      participantId: string;
      tactic: string;
      examples: string[];
      effectiveness: number;
    }>;
  }> {
    this.logger.info('Analyzing influence dynamics');

    // Create RAG-optimized prompt for influence dynamics analysis
    const instructionContent = `
      Analyze the influence dynamics in this meeting.
      
      For each participant, determine:
      1. Their level of influence (score from 0-1)
      2. How they exert influence (mechanisms/tactics)
      3. Their effectiveness at influencing decisions
      
      Also identify:
      - Who influenced specific decisions
      - Persuasive tactics used and their effectiveness
      
      MEETING PARTICIPANTS:
      ${metadata?.participants?.map((p: any) => `- ${p.name || p.id} (${p.role || 'Unknown role'})`).join('\n') || 'No participant information available'}
      
      TRANSCRIPT:
      ${transcript.segments
        .map(
          (s) =>
            `[SPEAKER: ${s.speakerName || s.speakerId} | SEGMENT: ${s.id}] ${s.content}`,
        )
        .join('\n\n')}
      
      Return your analysis as a JSON object with 'influenceRanking', 'decisionInfluencers', and 'persuasiveTactics' properties.
    `;

    // Generate dummy embedding for simplicity
    const dummyEmbedding = new Array(1536)
      .fill(0)
      .map(() => Math.random() - 0.5);

    // Create RAG options
    const ragOptions = {
      userId: metadata.userId || 'system',
      queryText: 'Analyze influence dynamics in meeting',
      queryEmbedding: dummyEmbedding,
      strategy: RagRetrievalStrategy.CUSTOM,
      customFilter: {
        meetingId: metadata.meetingId,
      },
    };

    try {
      // Use RAG prompt manager
      const ragPrompt = await this.ragPromptManager.createRagPrompt(
        SystemRoleEnum.MEETING_ANALYST,
        InstructionTemplateNameEnum.CUSTOM,
        instructionContent,
        ragOptions,
      );

      // Call LLM with the RAG-optimized prompt
      const response = await this.callLLM(
        'Analyze influence dynamics',
        ragPrompt.messages[0].content,
      );

      try {
        return JSON.parse(response);
      } catch (error) {
        this.logger.error(
          `Error parsing influence dynamics: ${error instanceof Error ? error.message : String(error)}`,
        );

        // Return default analysis on error
        return {
          influenceRanking: [],
          decisionInfluencers: {},
          persuasiveTactics: [],
        };
      }
    } catch (error) {
      this.logger.error(
        `Error using RAG prompt manager: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fall back to direct prompt
      const fallbackPrompt = `
        Analyze who had the most influence in this meeting and how they exerted it.
        Return a simple JSON object with the analysis.
      `;

      const fallbackResponse = await this.callLLM(
        'Analyze influence dynamics (fallback)',
        fallbackPrompt,
      );

      try {
        return JSON.parse(fallbackResponse);
      } catch (error) {
        // Return default analysis on all errors
        return {
          influenceRanking: [],
          decisionInfluencers: {},
          persuasiveTactics: [],
        };
      }
    }
  }

  /**
   * Detect disengagement patterns
   */
  private async detectDisengagementPatterns(
    transcript: MeetingTranscript,
    metadata: any,
  ): Promise<{
    disengagedParticipants: Array<{
      participantId: string;
      signs: string[];
      timeRanges: Array<{
        start: number;
        end: number;
      }>;
      possibleReasons: string[];
    }>;
    reengagementTriggers: Array<{
      triggerType: string;
      examples: string[];
      effectiveFor: string[];
    }>;
  }> {
    this.logger.info('Detecting disengagement patterns');

    // Implementation with RAG and instruction templates
    // For brevity, we'll provide a stub implementation

    return {
      disengagedParticipants: [],
      reengagementTriggers: [],
    };
  }

  /**
   * Analyze interruptions
   */
  private async analyzeInterruptions(transcript: MeetingTranscript): Promise<{
    interruptionCount: number;
    interruptionsByParticipant: Record<
      string,
      {
        initiated: number;
        received: number;
      }
    >;
    interruptions: Array<{
      interrupter: string;
      interrupted: string;
      segmentId: string;
      type: 'clarifying' | 'supportive' | 'disruptive';
    }>;
  }> {
    this.logger.info('Analyzing interruptions');

    // Implementation with RAG and instruction templates
    // For brevity, we'll provide a stub implementation

    return {
      interruptionCount: 0,
      interruptionsByParticipant: {},
      interruptions: [],
    };
  }

  /**
   * Analyze a specific segment of the transcript
   */
  async analyzeTranscriptSegment(
    segment: string,
    context?: any,
  ): Promise<AgentOutput> {
    this.logger.info('Analyzing transcript segment for participation dynamics');

    const prompt = `
      Analyze the participation dynamics in this meeting transcript segment.
      
      Look for:
      1. Collaboration or conflict between participants
      2. Influence dynamics and persuasion attempts
      3. Engagement levels and potential disengagement signs
      4. Interruption patterns
      
      TRANSCRIPT SEGMENT:
      ${segment}
      
      Return your analysis as a JSON object.
    `;

    const response = await this.callLLM(
      'Analyze segment participation dynamics',
      prompt,
    );

    try {
      const segmentAnalysis = JSON.parse(response);

      // Assess confidence in the analysis
      const confidence = await this.assessConfidence(segmentAnalysis);

      return {
        content: segmentAnalysis,
        confidence,
        reasoning: `Identified participation dynamics based on interaction patterns, language use, and communication flow.`,
        metadata: {
          segmentLength: segment.length,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(
        `Error analyzing segment participation: ${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        content: {},
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
    this.logger.info(`Merging ${analyses.length} participation analyses`);

    if (analyses.length === 0) {
      throw new Error('No analyses to merge');
    }

    if (analyses.length === 1) {
      return analyses[0];
    }

    // For brevity, we'll implement a simple merging strategy
    // This would be more sophisticated in a complete implementation

    const prompt = `
      Merge the following participation dynamics analyses into a cohesive result.
      
      ${analyses.map((a, i) => `ANALYSIS ${i + 1}:\n${JSON.stringify(a.content, null, 2)}`).join('\n\n')}
      
      Create a consolidated analysis that integrates insights from all sources.
      
      Return a JSON object with the merged analysis.
    `;

    const response = await this.callLLM('Merge participation analyses', prompt);

    try {
      const mergedContent = JSON.parse(response);

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
        reasoning: `Merged ${analyses.length} participation analyses integrating insights across segments.`,
        metadata: {
          sourceAnalyses: analyses.length,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(
        `Error merging participation analyses: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fall back to first analysis if merging fails
      return analyses[0];
    }
  }

  /**
   * Prioritize information based on importance
   */
  async prioritizeInformation(output: any): Promise<any> {
    this.logger.info('Prioritizing participation information');

    // For brevity, we'll implement a simple prioritization strategy
    const prioritized = { ...output };

    // Keep only the most important collaboration and conflict instances
    if (
      prioritized.collaborationConflicts?.collaborationInstances?.length > 3
    ) {
      prioritized.collaborationConflicts.collaborationInstances =
        prioritized.collaborationConflicts.collaborationInstances.slice(0, 3);
    }

    if (prioritized.collaborationConflicts?.conflictInstances?.length > 3) {
      prioritized.collaborationConflicts.conflictInstances =
        prioritized.collaborationConflicts.conflictInstances.slice(0, 3);
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
   * Get default system prompt for participant dynamics
   */
  protected getDefaultSystemPrompt(): string {
    return `You are the Participant Dynamics Agent, specialized in analyzing participation patterns in meeting transcripts.
Your responsibilities include:
- Tracking speaking time distribution among participants
- Identifying participation patterns and engagement levels
- Detecting collaboration and conflict dynamics
- Analyzing influence and persuasion patterns
- Identifying disengagement signals and reengagement triggers

When analyzing participation, focus on both quantitative measures (speaking time) and qualitative aspects (interaction styles, influence, engagement).
Provide nuanced insights that help teams improve their collaboration practices.`;
  }
}
