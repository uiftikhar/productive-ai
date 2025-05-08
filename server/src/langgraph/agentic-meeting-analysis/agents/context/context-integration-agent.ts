/**
 * Context Integration Agent for the Agentic Meeting Analysis System
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
 * Configuration options for ContextIntegrationAgent
 */
export interface ContextIntegrationAgentConfig {
  id?: string;
  name?: string;
  logger?: Logger;
  llm?: ChatOpenAI;
  systemPrompt?: string;
  enableHistoricalConnection?: boolean;
  enableExternalReferenceIdentification?: boolean;
  enableOngoingInitiativeTracking?: boolean;
  enableOrganizationalContextIntegration?: boolean;
  enablePriorityShiftDetection?: boolean;
  minConfidence?: number;
}

/**
 * Implementation of the Context Integration Agent
 * This agent is responsible for:
 * - Connecting current meeting topics to historical contexts
 * - Identifying external references and resources
 * - Tracking ongoing initiatives across meetings
 * - Integrating organizational context
 * - Detecting priority shifts over time
 */
export class ContextIntegrationAgent
  extends BaseMeetingAnalysisAgent
  implements ISpecialistAnalysisAgent
{
  public readonly role: AgentRole = AgentRole.WORKER;
  private enableHistoricalConnection: boolean;
  private enableExternalReferenceIdentification: boolean;
  private enableOngoingInitiativeTracking: boolean;
  private enableOrganizationalContextIntegration: boolean;
  private enablePriorityShiftDetection: boolean;
  private minConfidence: number;
  private ragPromptManager: RagPromptManager;

  /**
   * Create a new Context Integration Agent
   */
  constructor(config: ContextIntegrationAgentConfig) {
    super({
      id: config.id,
      name: config.name || 'Context Integration Agent',
      expertise: [AgentExpertise.CONTEXT_INTEGRATION],
      capabilities: [AnalysisGoalType.INTEGRATE_CONTEXT],
      logger: config.logger,
      llm: config.llm,
      systemPrompt: config.systemPrompt,
    });

    this.enableHistoricalConnection =
      config.enableHistoricalConnection !== false;
    this.enableExternalReferenceIdentification =
      config.enableExternalReferenceIdentification !== false;
    this.enableOngoingInitiativeTracking =
      config.enableOngoingInitiativeTracking !== false;
    this.enableOrganizationalContextIntegration =
      config.enableOrganizationalContextIntegration !== false;
    this.enablePriorityShiftDetection =
      config.enablePriorityShiftDetection !== false;
    this.minConfidence = config.minConfidence || 0.6;

    this.ragPromptManager = new RagPromptManager();

    this.logger.info(
      `Initialized ${this.name} with features: historicalConnection=${this.enableHistoricalConnection}, externalReferences=${this.enableExternalReferenceIdentification}`,
    );
  }

  /**
   * Initialize the context integration agent
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
   * Process a context integration task
   */
  async processTask(task: AnalysisTask): Promise<AgentOutput> {
    this.logger.info(`Processing context integration task: ${task.id}`);

    if (task.type !== AnalysisGoalType.INTEGRATE_CONTEXT) {
      throw new Error(
        `Context Integration Agent cannot process task type: ${task.type}`,
      );
    }

    try {
      // Get transcript data
      const transcript = await this.readMemory('transcript', 'meeting');
      const metadata = await this.readMemory('metadata', 'meeting');

      if (!transcript) {
        throw new Error('Meeting transcript not found in memory');
      }

      // Get topics and decisions for context
      const topicsData = await this.readMemory('analysis.topics', 'meeting');
      const topics = topicsData?.topics || [];

      const decisionsData = await this.readMemory(
        'analysis.decisions',
        'meeting',
      );
      const decisions = decisionsData?.decisions || [];

      // Get previous meetings data if available
      const previousMeetingsData = await this.readMemory(
        'previous.meetings',
        'meeting',
      );
      const previousMeetings = previousMeetingsData || [];

      // Connect to historical context
      let historicalConnections = null;
      if (this.enableHistoricalConnection && previousMeetings.length > 0) {
        historicalConnections = await this.connectToHistoricalContext(
          transcript,
          topics,
          decisions,
          previousMeetings,
        );
      }

      // Identify external references
      let externalReferences = null;
      if (this.enableExternalReferenceIdentification) {
        externalReferences = await this.identifyExternalReferences(transcript);
      }

      // Track ongoing initiatives
      let ongoingInitiatives = null;
      if (this.enableOngoingInitiativeTracking && previousMeetings.length > 0) {
        ongoingInitiatives = await this.trackOngoingInitiatives(
          transcript,
          topics,
          decisions,
          previousMeetings,
        );
      }

      // Integrate organizational context
      let organizationalContext = null;
      if (this.enableOrganizationalContextIntegration) {
        organizationalContext = await this.integrateOrganizationalContext(
          transcript,
          metadata,
        );
      }

      // Detect priority shifts
      let priorityShifts = null;
      if (this.enablePriorityShiftDetection && previousMeetings.length > 0) {
        priorityShifts = await this.detectPriorityShifts(
          transcript,
          decisions,
          previousMeetings,
        );
      }

      // Create complete context integration analysis
      const contextAnalysis = {
        historicalConnections,
        externalReferences,
        ongoingInitiatives,
        organizationalContext,
        priorityShifts,
        metadata: {
          analysisTimes: Date.now(),
          previousMeetingsCount: previousMeetings.length,
          topicCount: topics.length,
          decisionCount: decisions.length,
        },
      };

      // Assess confidence in the analysis
      const confidence = await this.assessConfidence(contextAnalysis);

      // Explain reasoning
      const reasoning = await this.explainReasoning(contextAnalysis);

      // Create output
      const output: AgentOutput = {
        content: contextAnalysis,
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
        `Error processing context integration: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Connect to historical context
   */
  private async connectToHistoricalContext(
    transcript: MeetingTranscript,
    topics: Array<any>,
    decisions: Array<any>,
    previousMeetings: Array<any>,
  ): Promise<{
    topicContinuity: Array<{
      currentTopic: string;
      previousMentions: Array<{
        meetingId: string;
        meetingDate: string;
        context: string;
      }>;
      evolutionSummary: string;
    }>;
    decisionContinuity: Array<{
      currentDecision: string;
      relatedPreviousDecisions: Array<{
        meetingId: string;
        meetingDate: string;
        decision: string;
        relationship: 'supports' | 'contradicts' | 'modifies' | 'implements';
      }>;
    }>;
  }> {
    this.logger.info('Connecting to historical context');

    // Generate a RAG-optimized prompt to connect current meeting to historical context
    const instructionContent = `
      Analyze the current meeting topics and decisions in relation to previous meetings.
      
      Identify:
      1. Topic continuity - how topics in this meeting connect to discussions in previous meetings
      2. Decision continuity - how decisions in this meeting relate to previous decisions
      
      For each current topic, find relevant mentions in previous meetings and summarize how the topic has evolved.
      For each current decision, find related previous decisions and explain their relationship.
      
      CURRENT MEETING TOPICS:
      ${topics.map((t) => `- ${t.name}: ${t.description}`).join('\n')}
      
      CURRENT MEETING DECISIONS:
      ${decisions.map((d) => `- ${d.description}`).join('\n')}
      
      PREVIOUS MEETINGS:
      ${previousMeetings
        .map(
          (m) => `
        Meeting ID: ${m.id}
        Date: ${m.date}
        Topics: ${m.topics?.map((t: any) => t.name).join(', ')}
        Decisions: ${m.decisions?.map((d: any) => d.description).join(', ')}
      `,
        )
        .join('\n')}
    `;

    // Generate dummy embedding for simplicity
    const dummyEmbedding = new Array(1536)
      .fill(0)
      .map(() => Math.random() - 0.5);

    // Create RAG options
    const ragOptions = {
      userId: 'system',
      queryText: 'Connect current meeting to historical context',
      queryEmbedding: dummyEmbedding,
      strategy: RagRetrievalStrategy.RECENCY,
      timeWindow: 30 * 24 * 60 * 60 * 1000, // 30 days
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
        'Connect to historical context',
        ragPrompt.messages[0].content,
      );

      try {
        return JSON.parse(response);
      } catch (error) {
        this.logger.error(
          `Error parsing historical context connections: ${error instanceof Error ? error.message : String(error)}`,
        );

        // Return default response on error
        return {
          topicContinuity: [],
          decisionContinuity: [],
        };
      }
    } catch (error) {
      this.logger.error(
        `Error using RAG prompt manager: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Return default response on error
      return {
        topicContinuity: [],
        decisionContinuity: [],
      };
    }
  }

  /**
   * Identify external references
   */
  private async identifyExternalReferences(
    transcript: MeetingTranscript,
  ): Promise<{
    documents: Array<{
      type: string;
      name: string;
      description: string;
      referenceContext: string;
      segmentId: string;
    }>;
    systems: Array<{
      name: string;
      description: string;
      referenceContext: string;
      segmentId: string;
    }>;
    projects: Array<{
      name: string;
      description: string;
      referenceContext: string;
      segmentId: string;
    }>;
    urls: Array<{
      url: string;
      context: string;
      segmentId: string;
    }>;
  }> {
    this.logger.info('Identifying external references');

    // Create RAG-optimized prompt for external reference identification
    const instructionContent = `
      Identify external references mentioned in the meeting transcript.
      
      Look for mentions of:
      1. Documents (files, reports, presentations, etc.)
      2. Systems or software applications
      3. Projects or initiatives
      4. URLs or websites
      
      For each reference, capture:
      - The name/identifier
      - A brief description or context
      - The segment where it was mentioned
      
      TRANSCRIPT:
      ${transcript.segments
        .map(
          (s) =>
            `[SEGMENT: ${s.id} | SPEAKER: ${s.speakerName || s.speakerId}]\n${s.content}`,
        )
        .join('\n\n')}
      
      Return your analysis as a JSON object with 'documents', 'systems', 'projects', and 'urls' arrays.
    `;

    // Generate dummy embedding for simplicity
    const dummyEmbedding = new Array(1536)
      .fill(0)
      .map(() => Math.random() - 0.5);

    // Create RAG options
    const ragOptions = {
      userId: 'system',
      queryText: 'Identify external references in meeting transcript',
      queryEmbedding: dummyEmbedding,
      strategy: RagRetrievalStrategy.CUSTOM,
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
        'Identify external references',
        ragPrompt.messages[0].content,
      );

      try {
        return JSON.parse(response);
      } catch (error) {
        this.logger.error(
          `Error parsing external references: ${error instanceof Error ? error.message : String(error)}`,
        );

        // Return empty results on error
        return {
          documents: [],
          systems: [],
          projects: [],
          urls: [],
        };
      }
    } catch (error) {
      this.logger.error(
        `Error using RAG prompt manager: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fall back to direct prompt
      const fallbackPrompt = `
        Identify external references (documents, systems, projects, URLs) mentioned in the meeting.
        Return a JSON object with the results.
      `;

      const fallbackResponse = await this.callLLM(
        'Identify external references (fallback)',
        fallbackPrompt,
      );

      try {
        return JSON.parse(fallbackResponse);
      } catch (error) {
        // Return empty results on all errors
        return {
          documents: [],
          systems: [],
          projects: [],
          urls: [],
        };
      }
    }
  }

  /**
   * Track ongoing initiatives
   */
  private async trackOngoingInitiatives(
    transcript: MeetingTranscript,
    topics: Array<any>,
    decisions: Array<any>,
    previousMeetings: Array<any>,
  ): Promise<{
    initiatives: Array<{
      name: string;
      status: 'not_started' | 'in_progress' | 'on_hold' | 'completed';
      owner: string;
      firstMentioned: string;
      recentUpdates: string;
      progressSummary: string;
      relatedTopics: string[];
      nextSteps: string;
    }>;
  }> {
    this.logger.info('Tracking ongoing initiatives');

    // Create RAG-optimized prompt for tracking ongoing initiatives
    const instructionContent = `
      Track ongoing initiatives mentioned in this meeting and connect them to previous meetings.
      
      Identify initiatives that:
      1. Continue from previous meetings
      2. Are newly introduced in this meeting
      3. Have updates on status or progress
      
      For each initiative, provide:
      - Name and description
      - Current status
      - Owner/responsible person
      - When first mentioned
      - Recent updates
      - Progress summary
      - Related topics
      - Next steps
      
      CURRENT MEETING TOPICS:
      ${topics.map((t) => `- ${t.name}: ${t.description}`).join('\n')}
      
      CURRENT MEETING DECISIONS:
      ${decisions.map((d) => `- ${d.description}`).join('\n')}
      
      PREVIOUS MEETINGS:
      ${previousMeetings
        .map(
          (m) => `
        Meeting ID: ${m.id}
        Date: ${m.date}
        Topics: ${m.topics?.map((t: any) => t.name).join(', ')}
        Decisions: ${m.decisions?.map((d: any) => d.description).join(', ')}
      `,
        )
        .join('\n')}
      
      TRANSCRIPT:
      ${transcript.segments
        .map(
          (s) =>
            `[SEGMENT: ${s.id} | SPEAKER: ${s.speakerName || s.speakerId}]\n${s.content.substring(0, 200)}${s.content.length > 200 ? '...' : ''}`,
        )
        .join('\n\n')}
      
      Return your analysis as a JSON object with an 'initiatives' array.
    `;

    // Generate dummy embedding for simplicity
    const dummyEmbedding = new Array(1536)
      .fill(0)
      .map(() => Math.random() - 0.5);

    // Create RAG options
    const ragOptions = {
      userId: 'system',
      queryText: 'Track ongoing initiatives across meetings',
      queryEmbedding: dummyEmbedding,
      strategy: RagRetrievalStrategy.RECENCY,
      timeWindow: 30 * 24 * 60 * 60 * 1000, // 30 days
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
        'Track ongoing initiatives',
        ragPrompt.messages[0].content,
      );

      try {
        return JSON.parse(response);
      } catch (error) {
        this.logger.error(
          `Error parsing ongoing initiatives: ${error instanceof Error ? error.message : String(error)}`,
        );

        // Return empty results on error
        return {
          initiatives: [],
        };
      }
    } catch (error) {
      this.logger.error(
        `Error using RAG prompt manager: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fall back to direct prompt
      const fallbackPrompt = `
        Track ongoing initiatives mentioned in this meeting.
        Return a simple JSON object with an initiatives array.
      `;

      const fallbackResponse = await this.callLLM(
        'Track ongoing initiatives (fallback)',
        fallbackPrompt,
      );

      try {
        return JSON.parse(fallbackResponse);
      } catch (error) {
        return {
          initiatives: [],
        };
      }
    }
  }

  /**
   * Integrate organizational context
   */
  private async integrateOrganizationalContext(
    transcript: MeetingTranscript,
    metadata: any,
  ): Promise<{
    teamContext: {
      teamName: string;
      teamObjectives: string[];
      keyStakeholders: string[];
    };
    businessDrivers: string[];
    relevantPolicies: Array<{
      name: string;
      applicability: string;
    }>;
    strategicAlignment: {
      alignedGoals: string[];
      potentialMisalignments: string[];
    };
  }> {
    this.logger.info('Integrating organizational context');

    // In a real implementation, this would retrieve organizational
    // context from knowledge bases, databases, etc.
    // For brevity, we'll provide a stub implementation

    return {
      teamContext: {
        teamName: metadata?.teamName || 'Unknown Team',
        teamObjectives: [],
        keyStakeholders: [],
      },
      businessDrivers: [],
      relevantPolicies: [],
      strategicAlignment: {
        alignedGoals: [],
        potentialMisalignments: [],
      },
    };
  }

  /**
   * Detect priority shifts
   */
  private async detectPriorityShifts(
    transcript: MeetingTranscript,
    decisions: Array<any>,
    previousMeetings: Array<any>,
  ): Promise<{
    priorityShifts: Array<{
      focus: string;
      previousPriority: string;
      currentPriority: string;
      trigger: string;
      impact: string;
    }>;
    deprioritizedItems: string[];
    newPriorities: string[];
  }> {
    this.logger.info('Detecting priority shifts');

    // Implementation using RAG and instruction templates
    // For brevity, we'll provide a simplified implementation

    const prompt = `
      Analyze how priorities have shifted between this meeting and previous meetings.
      
      Identify:
      1. Topics or initiatives that have changed in priority
      2. Items that have been deprioritized
      3. New priorities that have emerged
      
      For each priority shift, note:
      - What the focus area is
      - Previous vs. current priority level
      - What triggered the shift
      - Potential impact of the shift
      
      Return your analysis as a JSON object.
    `;

    const response = await this.callLLM('Detect priority shifts', prompt);

    try {
      return JSON.parse(response);
    } catch (error) {
      this.logger.error(
        `Error parsing priority shifts: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Return empty results on error
      return {
        priorityShifts: [],
        deprioritizedItems: [],
        newPriorities: [],
      };
    }
  }

  /**
   * Analyze a specific segment of the transcript
   */
  async analyzeTranscriptSegment(
    segment: string,
    context?: any,
  ): Promise<AgentOutput> {
    this.logger.info('Analyzing transcript segment for context integration');

    const prompt = `
      Analyze this meeting transcript segment for context integration.
      
      Look for:
      1. References to previous meetings or decisions
      2. External documents, systems, or resources mentioned
      3. Ongoing initiatives being discussed
      4. Organizational context that's relevant
      5. Indications of priority shifts
      
      TRANSCRIPT SEGMENT:
      ${segment}
      
      Return your analysis as a JSON object.
    `;

    const response = await this.callLLM(
      'Analyze segment for context integration',
      prompt,
    );

    try {
      const segmentAnalysis = JSON.parse(response);

      // Assess confidence in the analysis
      const confidence = await this.assessConfidence(segmentAnalysis);

      return {
        content: segmentAnalysis,
        confidence,
        reasoning: `Identified contextual elements based on references to external entities, previous decisions, and organizational factors.`,
        metadata: {
          segmentLength: segment.length,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(
        `Error analyzing segment for context: ${error instanceof Error ? error.message : String(error)}`,
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
    this.logger.info(`Merging ${analyses.length} context integration analyses`);

    if (analyses.length === 0) {
      throw new Error('No analyses to merge');
    }

    if (analyses.length === 1) {
      return analyses[0];
    }

    // For brevity, we'll implement a simple merging strategy

    const prompt = `
      Merge the following context integration analyses into a cohesive result.
      
      ${analyses.map((a, i) => `ANALYSIS ${i + 1}:\n${JSON.stringify(a.content, null, 2)}`).join('\n\n')}
      
      Create a consolidated analysis that:
      1. Combines all unique contextual references
      2. Eliminates duplicates
      3. Resolves any contradictions
      4. Prioritizes by relevance
      
      Return a JSON object with the merged analysis.
    `;

    const response = await this.callLLM('Merge context analyses', prompt);

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
        reasoning: `Merged ${analyses.length} context integration analyses into a unified contextual view.`,
        metadata: {
          sourceAnalyses: analyses.length,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(
        `Error merging context analyses: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fall back to first analysis if merging fails
      return analyses[0];
    }
  }

  /**
   * Prioritize information based on importance
   */
  async prioritizeInformation(output: any): Promise<any> {
    this.logger.info('Prioritizing context information');

    // For brevity, we'll implement a simple prioritization strategy
    const prioritized = { ...output };

    // Limit external references to most relevant ones
    if (prioritized.externalReferences?.documents?.length > 5) {
      prioritized.externalReferences.documents =
        prioritized.externalReferences.documents.slice(0, 5);
    }

    if (prioritized.externalReferences?.systems?.length > 3) {
      prioritized.externalReferences.systems =
        prioritized.externalReferences.systems.slice(0, 3);
    }

    if (prioritized.externalReferences?.projects?.length > 3) {
      prioritized.externalReferences.projects =
        prioritized.externalReferences.projects.slice(0, 3);
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
   * Get default system prompt for context integration
   */
  protected getDefaultSystemPrompt(): string {
    return `You are the Context Integration Agent, specialized in connecting meeting discussions to broader organizational and historical context.
Your responsibilities include:
- Connecting current meeting topics to historical discussions
- Identifying external references to documents, systems, and resources
- Tracking ongoing initiatives across multiple meetings
- Integrating organizational context and strategic goals
- Detecting shifts in priorities over time

When analyzing context, you should aim to provide the bigger picture view that helps teams understand the broader implications and connections of their discussions.
Focus on continuity, evolution of ideas, and alignment with organizational objectives.`;
  }
}
