/**
 * Decision Analysis Agent for the Agentic Meeting Analysis System
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
 * Configuration options for DecisionAnalysisAgent
 */
export interface DecisionAnalysisAgentConfig {
  id?: string;
  name?: string;
  logger?: Logger;
  llm?: ChatOpenAI;
  systemPrompt?: string;
  minConfidence?: number;
  enableRationaleExtraction?: boolean;
  enableStakeholderIdentification?: boolean;
  enableQualityEvaluation?: boolean;
  enablePatternAnalysis?: boolean;
}

/**
 * Implementation of the Decision Analysis Agent
 * This agent is responsible for:
 * - Extracting formal and informal decisions from transcripts
 * - Identifying decision rationales
 * - Analyzing decision patterns
 * - Identifying stakeholders for decisions
 * - Evaluating decision quality
 */
export class DecisionAnalysisAgent
  extends BaseMeetingAnalysisAgent
  implements ISpecialistAnalysisAgent
{
  public readonly role: AgentRole = AgentRole.WORKER;
  private minConfidence: number;
  private enableRationaleExtraction: boolean;
  private enableStakeholderIdentification: boolean;
  private enableQualityEvaluation: boolean;
  private enablePatternAnalysis: boolean;

  /**
   * Create a new Decision Analysis Agent
   */
  constructor(config: DecisionAnalysisAgentConfig) {
    super({
      id: config.id,
      name: config.name || 'Decision Analysis Agent',
      expertise: [AgentExpertise.DECISION_TRACKING],
      capabilities: [AnalysisGoalType.EXTRACT_DECISIONS],
      logger: config.logger,
      llm: config.llm,
      systemPrompt: config.systemPrompt,
    });

    this.minConfidence = config.minConfidence || 0.6;
    this.enableRationaleExtraction = config.enableRationaleExtraction !== false;
    this.enableStakeholderIdentification =
      config.enableStakeholderIdentification !== false;
    this.enableQualityEvaluation = config.enableQualityEvaluation !== false;
    this.enablePatternAnalysis = config.enablePatternAnalysis !== false;

    this.logger.info(
      `Initialized ${this.name} with features: rationales=${this.enableRationaleExtraction}, stakeholders=${this.enableStakeholderIdentification}`,
    );
  }

  /**
   * Initialize the decision analysis agent
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
   * Process a decision extraction task
   */
  async processTask(task: AnalysisTask): Promise<AgentOutput> {
    this.logger.info(`Processing decision analysis task: ${task.id}`);

    if (task.type !== AnalysisGoalType.EXTRACT_DECISIONS) {
      throw new Error(
        `Decision Analysis Agent cannot process task type: ${task.type}`,
      );
    }

    try {
      // Get transcript data
      const transcript = await this.readMemory('transcript', 'meeting');
      const metadata = await this.readMemory('metadata', 'meeting');

      if (!transcript) {
        throw new Error('Meeting transcript not found in memory');
      }

      // Get topics for context if available
      let topics = null;
      const topicsData = await this.readMemory('analysis.topics', 'meeting');
      topics = topicsData?.topics || null;

      // Initial decision extraction
      const decisions = await this.extractDecisions(transcript, metadata);

      // Enhance with rationales if enabled
      if (this.enableRationaleExtraction) {
        await this.extractRationales(decisions, transcript);
      }

      // Identify stakeholders if enabled
      if (this.enableStakeholderIdentification) {
        await this.identifyStakeholders(decisions, transcript, metadata);
      }

      // Evaluate decision quality if enabled
      if (this.enableQualityEvaluation) {
        await this.evaluateDecisionQuality(decisions, transcript);
      }

      // Analyze decision patterns if enabled
      if (this.enablePatternAnalysis && decisions.length > 1) {
        await this.analyzeDecisionPatterns(decisions, transcript);
      }

      // Link decisions to topics if available
      if (topics) {
        await this.linkDecisionsToTopics(decisions, topics, transcript);
      }

      // Create complete decision analysis
      const decisionAnalysis = {
        decisions,
        metadata: {
          extractionTime: Date.now(),
          totalDecisions: decisions.length,
          withRationales: decisions.filter((decision) => decision.rationale)
            .length,
          withStakeholders: decisions.filter(
            (decision) =>
              decision.stakeholders && decision.stakeholders.length > 0,
          ).length,
        },
      };

      // Assess confidence in the analysis
      const confidence = await this.assessConfidence(decisionAnalysis);

      // Explain reasoning
      const reasoning = await this.explainReasoning(decisionAnalysis);

      // Create output
      const output: AgentOutput = {
        content: decisionAnalysis,
        confidence,
        reasoning,
        metadata: {
          taskId: task.id,
          decisionCount: decisions.length,
          meetingId: metadata?.meetingId || 'unknown',
        },
        timestamp: Date.now(),
      };

      // Notify coordinator of task completion
      await this.notifyTaskCompletion(task.id, output);

      return output;
    } catch (error) {
      this.logger.error(
        `Error processing decision analysis: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Extract decisions from the transcript
   */
  private async extractDecisions(
    transcript: MeetingTranscript,
    metadata: any,
  ): Promise<
    Array<{
      id: string;
      description: string;
      category: 'formal' | 'informal';
      rationale?: string;
      stakeholders?: string[];
      impact?: string;
      segmentId: string;
      relatedTopics?: string[];
      quality?: {
        score: number;
        factors: Record<string, number>;
        comments: string;
      };
      confidenceScore: number;
    }>
  > {
    this.logger.info('Extracting decisions from transcript');

    // Simplified implementation that extracts decisions and their basic attributes

    // Get participants for context
    const participants = metadata?.participants || [];

    const prompt = `
      Extract all decisions made during the meeting from the transcript below.
      
      Look for:
      1. Formal decisions (explicit agreements, approvals, or conclusions)
      2. Informal decisions (implicit agreements or direction changes)
      
      For each decision:
      - Provide a clear, concise description
      - Classify as "formal" or "informal"
      - Note the segment ID where the decision appears
      - Assess a confidence score (0.0 to 1.0) for each identified decision
      
      Only include decisions with a confidence score of at least ${this.minConfidence}.
      
      MEETING PARTICIPANTS:
      ${participants.map((p: any) => `- ${p.name || p.id} (${p.role || 'Unknown role'})`).join('\n')}
      
      TRANSCRIPT:
      ${transcript.segments
        .map(
          (s) =>
            `[SEGMENT: ${s.id} | SPEAKER: ${s.speakerName || s.speakerId}]\n${s.content}`,
        )
        .join('\n\n')}
      
      Return your analysis as a JSON array of decision objects.
    `;

    const response = await this.callLLM(
      'Extract decisions from transcript',
      prompt,
    );

    try {
      let decisions = JSON.parse(response);

      // Ensure each decision has an ID and required fields
      decisions = decisions.map((decision: any) => ({
        id: decision.id || `decision-${uuidv4().substring(0, 8)}`,
        description: decision.description,
        category: decision.category || 'informal',
        segmentId: decision.segmentId,
        confidenceScore: decision.confidenceScore || this.minConfidence,
        // These will be populated later if enabled
        rationale: decision.rationale,
        stakeholders: decision.stakeholders || [],
        impact: decision.impact,
        relatedTopics: decision.relatedTopics || [],
      }));

      // Filter by minimum confidence
      decisions = decisions.filter(
        (decision: any) => decision.confidenceScore >= this.minConfidence,
      );

      return decisions;
    } catch (error) {
      this.logger.error(
        `Error parsing decision extraction response: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Return a minimal valid result if parsing fails
      return [];
    }
  }

  /**
   * Extract rationales for decisions
   */
  private async extractRationales(
    decisions: Array<any>,
    transcript: MeetingTranscript,
  ): Promise<void> {
    // Implementation left as a stub
  }

  /**
   * Identify stakeholders for decisions
   */
  private async identifyStakeholders(
    decisions: Array<any>,
    transcript: MeetingTranscript,
    metadata: any,
  ): Promise<void> {
    // Implementation left as a stub
  }

  /**
   * Evaluate decision quality
   */
  private async evaluateDecisionQuality(
    decisions: Array<any>,
    transcript: MeetingTranscript,
  ): Promise<void> {
    // Implementation left as a stub
  }

  /**
   * Analyze decision patterns
   */
  private async analyzeDecisionPatterns(
    decisions: Array<any>,
    transcript: MeetingTranscript,
  ): Promise<void> {
    // Implementation left as a stub
  }

  /**
   * Link decisions to discussion topics
   */
  private async linkDecisionsToTopics(
    decisions: Array<any>,
    topics: Array<any>,
    transcript: MeetingTranscript,
  ): Promise<void> {
    // Implementation left as a stub
  }

  /**
   * Analyze a specific segment of the transcript
   */
  async analyzeTranscriptSegment(
    segment: string,
    context?: any,
  ): Promise<AgentOutput> {
    this.logger.info('Analyzing transcript segment for decisions');

    const prompt = `
      Identify any decisions made in this meeting transcript segment.
      
      Look for both:
      - Formal decisions (explicit agreements, approvals, or conclusions)
      - Informal decisions (implicit agreements or direction changes)
      
      For each decision found:
      1. Provide a concise description of the decision
      2. Classify it as "formal" or "informal"
      3. Extract any rationale mentioned for the decision
      4. Identify the stakeholders (people affected by or involved in the decision)
      5. Provide a confidence score (0.0 to 1.0)
      
      Additional context:
      ${context?.participantInfo ? `Participants: ${context.participantInfo}` : 'No participant information available'}
      ${context?.previousDecisions ? `Previous decisions: ${JSON.stringify(context.previousDecisions)}` : ''}
      
      TRANSCRIPT SEGMENT:
      ${segment}
      
      Return your analysis as a JSON object.
    `;

    const response = await this.callLLM(
      'Analyze segment for decisions',
      prompt,
    );

    try {
      const segmentAnalysis = JSON.parse(response);

      // Ensure each decision has an ID
      if (segmentAnalysis.decisions) {
        segmentAnalysis.decisions = segmentAnalysis.decisions.map(
          (decision: any) => ({
            ...decision,
            id: decision.id || `decision-${uuidv4().substring(0, 8)}`,
          }),
        );
      }

      // Assess confidence in the analysis
      const confidence = await this.assessConfidence(segmentAnalysis);

      return {
        content: segmentAnalysis,
        confidence,
        reasoning: `Identified ${segmentAnalysis.decisions?.length || 0} decisions in this segment based on explicit agreements and implicit direction changes.`,
        metadata: {
          segmentLength: segment.length,
          hasParticipantContext: !!context?.participantInfo,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(
        `Error analyzing transcript segment: ${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        content: {
          decisions: [],
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
    this.logger.info(`Merging ${analyses.length} decision analyses`);

    if (analyses.length === 0) {
      throw new Error('No analyses to merge');
    }

    if (analyses.length === 1) {
      return analyses[0];
    }

    // Extract decisions from all analyses
    const allDecisions: any[] = [];
    for (const analysis of analyses) {
      if (analysis.content.decisions) {
        allDecisions.push(...analysis.content.decisions);
      }
    }

    const prompt = `
      Merge the following decision analyses into a cohesive result.
      
      DECISIONS FROM MULTIPLE ANALYSES:
      ${JSON.stringify(allDecisions, null, 2)}
      
      Create a consolidated list that:
      1. Combines similar or duplicate decisions
      2. Preserves unique details from each source
      3. Resolves any conflicts in stakeholders or rationales
      4. Maintains the highest confidence version of each decision
      
      Return a JSON object with a merged 'decisions' array.
    `;

    const response = await this.callLLM('Merge decision analyses', prompt);

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
        reasoning: `Merged ${analyses.length} analyses containing a total of ${allDecisions.length} decisions into ${mergedAnalysis.decisions.length} consolidated decisions.`,
        metadata: {
          sourceAnalyses: analyses.length,
          originalDecisionCount: allDecisions.length,
          mergedDecisionCount: mergedAnalysis.decisions.length,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(
        `Error merging decision analyses: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fall back to first analysis if merging fails
      return analyses[0];
    }
  }

  /**
   * Prioritize information based on importance
   */
  async prioritizeInformation(output: any): Promise<any> {
    this.logger.info('Prioritizing decision information');

    if (!output.decisions || !Array.isArray(output.decisions)) {
      return output;
    }

    // Sort by confidence score and category (formal before informal)
    output.decisions.sort((a: any, b: any) => {
      // First by formal vs informal
      if (a.category !== b.category) {
        return a.category === 'formal' ? -1 : 1;
      }

      // Then by confidence score
      return b.confidenceScore - a.confidenceScore;
    });

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
   * Get default system prompt for decision analysis
   */
  protected getDefaultSystemPrompt(): string {
    return `You are the Decision Analysis Agent, specialized in identifying and analyzing decisions in meeting transcripts.
Your responsibilities include:
- Detecting formal and informal decisions made during meetings
- Extracting the rationale behind each decision
- Identifying stakeholders affected by or involved in decisions
- Analyzing decision patterns across the meeting
- Evaluating the quality of decision-making processes

When analyzing decisions, focus on substantive choices and agreements rather than procedural matters.
Be thorough in identifying both explicit (formal) and implicit (informal) decisions.`;
  }
}
