/**
 * Summary Synthesis Agent for the Agentic Meeting Analysis System
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
 * Configuration options for SummarySynthesisAgent
 */
export interface SummarySynthesisAgentConfig {
  id?: string;
  name?: string;
  logger?: Logger;
  llm?: ChatOpenAI;
  systemPrompt?: string;
  detailLevels?: ('executive' | 'detailed' | 'comprehensive')[];
  enableAudienceSpecificFormatting?: boolean;
  enableInsightSynthesis?: boolean;
  enableHighlightExtraction?: boolean;
  enableActionableRecommendations?: boolean;
  minConfidence?: number;
}

/**
 * Implementation of the Summary Synthesis Agent
 * This agent is responsible for:
 * - Synthesizing insights from specialist agent outputs
 * - Prioritizing information for different audiences
 * - Generating summaries at multiple detail levels
 * - Formatting summaries for specific audiences
 * - Extracting key highlights and actionable recommendations
 */
export class SummarySynthesisAgent
  extends BaseMeetingAnalysisAgent
  implements ISpecialistAnalysisAgent
{
  public readonly role: AgentRole = AgentRole.WORKER;
  private detailLevels: ('executive' | 'detailed' | 'comprehensive')[];
  private enableAudienceSpecificFormatting: boolean;
  private enableInsightSynthesis: boolean;
  private enableHighlightExtraction: boolean;
  private enableActionableRecommendations: boolean;
  private minConfidence: number;
  private ragPromptManager: RagPromptManager;

  /**
   * Create a new Summary Synthesis Agent
   */
  constructor(config: SummarySynthesisAgentConfig) {
    super({
      id: config.id,
      name: config.name || 'Summary Synthesis Agent',
      expertise: [AgentExpertise.SUMMARY_GENERATION],
      capabilities: [AnalysisGoalType.GENERATE_SUMMARY],
      logger: config.logger,
      llm: config.llm,
      systemPrompt: config.systemPrompt,
    });

    this.detailLevels = config.detailLevels || ['executive', 'detailed'];
    this.enableAudienceSpecificFormatting =
      config.enableAudienceSpecificFormatting !== false;
    this.enableInsightSynthesis = config.enableInsightSynthesis !== false;
    this.enableHighlightExtraction = config.enableHighlightExtraction !== false;
    this.enableActionableRecommendations =
      config.enableActionableRecommendations !== false;
    this.minConfidence = config.minConfidence || 0.6;

    this.ragPromptManager = new RagPromptManager();

    this.logger.info(
      `Initialized ${this.name} with detail levels: ${this.detailLevels.join(', ')}`,
    );
  }

  /**
   * Initialize the summary synthesis agent
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
   * Process a summary generation task
   */
  async processTask(task: AnalysisTask): Promise<AgentOutput> {
    this.logger.info(`Processing summary synthesis task: ${task.id}`);

    if (task.type !== AnalysisGoalType.GENERATE_SUMMARY) {
      throw new Error(
        `Summary Synthesis Agent cannot process task type: ${task.type}`,
      );
    }

    try {
      // Get transcript data
      const transcript = await this.readMemory('transcript', 'meeting');
      const metadata = await this.readMemory('metadata', 'meeting');

      if (!transcript) {
        throw new Error('Meeting transcript not found in memory');
      }

      // Gather all specialist analyses
      const topicsAnalysis = await this.readMemory(
        'analysis.topics',
        'meeting',
      );
      const actionItemsAnalysis = await this.readMemory(
        'analysis.actionItems',
        'meeting',
      );
      const decisionsAnalysis = await this.readMemory(
        'analysis.decisions',
        'meeting',
      );
      const sentimentAnalysis = await this.readMemory(
        'analysis.sentiment',
        'meeting',
      );
      const participationAnalysis = await this.readMemory(
        'analysis.participation',
        'meeting',
      );
      const contextAnalysis = await this.readMemory(
        'analysis.context',
        'meeting',
      );

      // Combine all analyses into a consolidated input
      const analysesInput = {
        topics: topicsAnalysis?.topics || [],
        actionItems: actionItemsAnalysis?.actionItems || [],
        decisions: decisionsAnalysis?.decisions || [],
        sentiment: sentimentAnalysis?.overall || {},
        participation: participationAnalysis || {},
        context: contextAnalysis || {},
      };

      // Synthesize insights from specialist outputs
      let insights = null;
      if (this.enableInsightSynthesis) {
        insights = await this.synthesizeInsights(analysesInput, transcript);
      }

      // Extract key highlights
      let highlights = null;
      if (this.enableHighlightExtraction) {
        highlights = await this.extractHighlights(analysesInput, transcript);
      }

      // Generate actionable recommendations
      let recommendations = null;
      if (this.enableActionableRecommendations) {
        recommendations = await this.generateRecommendations(
          analysesInput,
          transcript,
        );
      }

      // Generate summaries at different detail levels
      const summaries: Record<string, string> = {};

      for (const level of this.detailLevels) {
        summaries[level] = await this.generateSummary(
          level,
          analysesInput,
          transcript,
          metadata,
        );
      }

      // Format for specific audiences if enabled
      let audienceSpecificSummaries: Record<string, string> | null = null;
      if (this.enableAudienceSpecificFormatting) {
        audienceSpecificSummaries = await this.formatForAudiences(
          summaries,
          analysesInput,
          metadata,
        );
      }

      // Create complete summary output
      const summaryOutput = {
        summaries,
        audienceSpecificSummaries,
        insights,
        highlights,
        recommendations,
        meetingMetadata: {
          title: metadata?.title || 'Meeting',
          date: metadata?.date || new Date().toISOString(),
          participants: metadata?.participants || [],
          duration:
            transcript.segments.length > 0
              ? transcript.segments[transcript.segments.length - 1].endTime -
                transcript.segments[0].startTime
              : 0,
        },
      };

      // Assess confidence in the summary
      const confidence = await this.assessConfidence(summaryOutput);

      // Explain reasoning
      const reasoning = await this.explainReasoning(summaryOutput);

      // Create output
      const output: AgentOutput = {
        content: summaryOutput,
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
        `Error processing summary synthesis: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Synthesize insights from specialist outputs
   */
  private async synthesizeInsights(
    analyses: any,
    transcript: MeetingTranscript,
  ): Promise<
    Array<{
      insight: string;
      category: string;
      confidence: number;
      supportingEvidence: string[];
      relevance: string;
    }>
  > {
    this.logger.info('Synthesizing insights from specialist outputs');

    // Create RAG-optimized prompt for insight synthesis
    const instructionContent = `
      Synthesize key insights from the following analysis outputs.
      
      Extract insights that:
      1. Reveal important patterns or connections
      2. Highlight significant findings that might not be immediately obvious
      3. Connect different aspects of the meeting (topics, decisions, participation, etc.)
      4. Provide actionable intelligence
      
      For each insight:
      - Provide a clear, concise statement of the insight
      - Categorize it (e.g., "team dynamics", "project risk", "opportunity", etc.)
      - Rate confidence (0-1 scale)
      - List supporting evidence
      - Explain relevance/importance
      
      TOPICS ANALYSIS:
      ${JSON.stringify(analyses.topics, null, 2)}
      
      ACTION ITEMS ANALYSIS:
      ${JSON.stringify(analyses.actionItems, null, 2)}
      
      DECISIONS ANALYSIS:
      ${JSON.stringify(analyses.decisions, null, 2)}
      
      SENTIMENT ANALYSIS:
      ${JSON.stringify(analyses.sentiment, null, 2)}
      
      PARTICIPATION ANALYSIS:
      ${JSON.stringify(analyses.participation, null, 2)}
      
      CONTEXT ANALYSIS:
      ${JSON.stringify(analyses.context, null, 2)}
    `;

    // Generate dummy embedding for simplicity
    const dummyEmbedding = new Array(1536)
      .fill(0)
      .map(() => Math.random() - 0.5);

    // Create RAG options
    const ragOptions = {
      userId: 'system',
      queryText: 'Synthesize insights from meeting analyses',
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
        'Synthesize insights',
        ragPrompt.messages[0].content,
      );

      try {
        const parsedInsights = JSON.parse(response);
        return Array.isArray(parsedInsights)
          ? parsedInsights
          : parsedInsights.insights || [];
      } catch (error) {
        this.logger.error(
          `Error parsing insights: ${error instanceof Error ? error.message : String(error)}`,
        );
        return [];
      }
    } catch (error) {
      this.logger.error(
        `Error using RAG prompt manager: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fall back to direct LLM call
      const fallbackPrompt = `
        Synthesize 3-5 key insights from these meeting analyses.
        Return as a JSON array of objects with 'insight', 'category', 'confidence', 'supportingEvidence', and 'relevance' fields.
      `;

      const fallbackResponse = await this.callLLM(
        'Synthesize insights (fallback)',
        fallbackPrompt,
      );

      try {
        const parsedInsights = JSON.parse(fallbackResponse);
        return Array.isArray(parsedInsights)
          ? parsedInsights
          : parsedInsights.insights || [];
      } catch (error) {
        return [];
      }
    }
  }

  /**
   * Extract key highlights
   */
  private async extractHighlights(
    analyses: any,
    transcript: MeetingTranscript,
  ): Promise<
    Array<{
      highlight: string;
      category:
        | 'key_decision'
        | 'major_action_item'
        | 'important_topic'
        | 'notable_dynamic';
      importance: number;
    }>
  > {
    this.logger.info('Extracting key highlights');

    // Create RAG-optimized prompt for highlight extraction
    const instructionContent = `
      Extract the most important highlights from this meeting.
      
      Focus on:
      1. Key decisions that will have significant impact
      2. Major action items with near-term deadlines
      3. Important topics that received substantial discussion
      4. Notable team dynamics or participation patterns
      
      For each highlight:
      - Provide a clear, concise statement
      - Categorize it (key_decision, major_action_item, important_topic, or notable_dynamic)
      - Rate importance on a scale of 0-10
      
      Limit to a maximum of 5 highlights, prioritizing by importance.
      
      TOPICS ANALYSIS:
      ${JSON.stringify(analyses.topics, null, 2)}
      
      ACTION ITEMS ANALYSIS:
      ${JSON.stringify(analyses.actionItems, null, 2)}
      
      DECISIONS ANALYSIS:
      ${JSON.stringify(analyses.decisions, null, 2)}
      
      Return your highlights as a JSON array.
    `;

    // Generate dummy embedding for simplicity
    const dummyEmbedding = new Array(1536)
      .fill(0)
      .map(() => Math.random() - 0.5);

    // Create RAG options
    const ragOptions = {
      userId: 'system',
      queryText: 'Extract key highlights from meeting',
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
        'Extract key highlights',
        ragPrompt.messages[0].content,
      );

      try {
        const highlights = JSON.parse(response);
        return Array.isArray(highlights)
          ? highlights
          : highlights.highlights || [];
      } catch (error) {
        this.logger.error(
          `Error parsing highlights: ${error instanceof Error ? error.message : String(error)}`,
        );
        return [];
      }
    } catch (error) {
      this.logger.error(
        `Error using RAG prompt manager: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fall back to direct LLM call
      const fallbackPrompt = `
        Extract 3-5 key highlights from this meeting.
        Return as a JSON array of objects with 'highlight', 'category', and 'importance' fields.
      `;

      const fallbackResponse = await this.callLLM(
        'Extract key highlights (fallback)',
        fallbackPrompt,
      );

      try {
        const highlights = JSON.parse(fallbackResponse);
        return Array.isArray(highlights)
          ? highlights
          : highlights.highlights || [];
      } catch (error) {
        return [];
      }
    }
  }

  /**
   * Generate actionable recommendations
   */
  private async generateRecommendations(
    analyses: any,
    transcript: MeetingTranscript,
  ): Promise<
    Array<{
      recommendation: string;
      rationale: string;
      beneficiaries: string[];
      difficulty: 'low' | 'medium' | 'high';
      impact: 'low' | 'medium' | 'high';
    }>
  > {
    this.logger.info('Generating actionable recommendations');

    // Create RAG-optimized prompt for recommendations
    const instructionContent = `
      Generate actionable recommendations based on the meeting analysis.
      
      For each recommendation:
      1. Provide a clear, specific, and actionable recommendation
      2. Explain the rationale behind it
      3. Identify who would benefit from implementing it
      4. Assess difficulty of implementation (low, medium, high)
      5. Evaluate potential impact (low, medium, high)
      
      Focus on recommendations that:
      - Address issues or opportunities identified in the meeting
      - Could improve team effectiveness or project outcomes
      - Are concrete and implementable
      
      Limit to 3-5 high-quality recommendations.
      
      TOPICS ANALYSIS:
      ${JSON.stringify(analyses.topics, null, 2)}
      
      ACTION ITEMS ANALYSIS:
      ${JSON.stringify(analyses.actionItems, null, 2)}
      
      DECISIONS ANALYSIS:
      ${JSON.stringify(analyses.decisions, null, 2)}
      
      SENTIMENT ANALYSIS:
      ${JSON.stringify(analyses.sentiment, null, 2)}
      
      PARTICIPATION ANALYSIS:
      ${JSON.stringify(analyses.participation, null, 2)}
      
      Return your recommendations as a JSON array.
    `;

    // Generate dummy embedding for simplicity
    const dummyEmbedding = new Array(1536)
      .fill(0)
      .map(() => Math.random() - 0.5);

    // Create RAG options
    const ragOptions = {
      userId: 'system',
      queryText: 'Generate recommendations from meeting analysis',
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
        'Generate recommendations',
        ragPrompt.messages[0].content,
      );

      try {
        const recommendations = JSON.parse(response);
        return Array.isArray(recommendations)
          ? recommendations
          : recommendations.recommendations || [];
      } catch (error) {
        this.logger.error(
          `Error parsing recommendations: ${error instanceof Error ? error.message : String(error)}`,
        );
        return [];
      }
    } catch (error) {
      this.logger.error(
        `Error using RAG prompt manager: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fall back to direct LLM call
      const fallbackPrompt = `
        Generate 3-5 actionable recommendations based on the meeting.
        Return as a JSON array of objects with 'recommendation', 'rationale', 'beneficiaries', 'difficulty', and 'impact' fields.
      `;

      const fallbackResponse = await this.callLLM(
        'Generate recommendations (fallback)',
        fallbackPrompt,
      );

      try {
        const recommendations = JSON.parse(fallbackResponse);
        return Array.isArray(recommendations)
          ? recommendations
          : recommendations.recommendations || [];
      } catch (error) {
        return [];
      }
    }
  }

  /**
   * Generate summary at specified detail level
   */
  private async generateSummary(
    level: 'executive' | 'detailed' | 'comprehensive',
    analyses: any,
    transcript: MeetingTranscript,
    metadata: any,
  ): Promise<string> {
    this.logger.info(`Generating ${level} summary`);

    // Create a RAG-optimized prompt for summary generation
    let instructionTemplate;

    switch (level) {
      case 'executive':
        // Use FINAL_MEETING_SUMMARY template with shorter format
        instructionTemplate = InstructionTemplateNameEnum.FINAL_MEETING_SUMMARY;
        break;
      case 'detailed':
        // Use FINAL_MEETING_SUMMARY template with detailed format
        instructionTemplate = InstructionTemplateNameEnum.FINAL_MEETING_SUMMARY;
        break;
      case 'comprehensive':
        // Use MEETING_ANALYSIS_CHUNK template for more comprehensive output
        instructionTemplate =
          InstructionTemplateNameEnum.MEETING_ANALYSIS_CHUNK;
        break;
      default:
        instructionTemplate = InstructionTemplateNameEnum.FINAL_MEETING_SUMMARY;
    }

    // Create audience-specific instructions based on detail level
    let detailInstructions = '';

    switch (level) {
      case 'executive':
        detailInstructions = `
          Create a concise executive summary (250-500 words) focusing on:
          - Key decisions made
          - Critical action items with owners
          - High-level insights
          - Strategic implications
          
          Use an executive-friendly tone and highlight only the most important points.
        `;
        break;
      case 'detailed':
        detailInstructions = `
          Create a detailed summary (500-1000 words) including:
          - Meeting objectives and context
          - All key topics discussed with brief summaries
          - All decisions with rationales
          - All action items with owners and deadlines
          - Team dynamics and participation patterns
          - Key insights and recommendations
          
          Balance comprehensiveness with readability.
        `;
        break;
      case 'comprehensive':
        detailInstructions = `
          Create a comprehensive record of the meeting (1000+ words) with:
          - Full context and background
          - Detailed discussion of each topic
          - All decisions with full rationales and stakeholder concerns
          - Complete list of action items with all details
          - Thorough analysis of team dynamics and participation
          - Complete insights, connections to previous meetings
          - All recommendations with implementation details
          
          Prioritize completeness over brevity.
        `;
        break;
    }

    const instructionContent = `
      ${detailInstructions}
      
      MEETING METADATA:
      Title: ${metadata?.title || 'Meeting'}
      Date: ${metadata?.date || new Date().toISOString()}
      Participants: ${metadata?.participants?.map((p: any) => p.name || p.id).join(', ') || 'Unknown'}
      
      ANALYSIS OUTPUTS:
      Topics: ${analyses.topics?.length || 0} topics identified
      Action Items: ${analyses.actionItems?.length || 0} action items identified
      Decisions: ${analyses.decisions?.length || 0} decisions recorded
    `;

    // Generate dummy embedding for simplicity
    const dummyEmbedding = new Array(1536)
      .fill(0)
      .map(() => Math.random() - 0.5);

    // Create RAG options
    const ragOptions = {
      userId: 'system',
      queryText: `Generate ${level} meeting summary`,
      queryEmbedding: dummyEmbedding,
      strategy: RagRetrievalStrategy.CUSTOM,
    };

    try {
      // Use RAG prompt manager
      const ragPrompt = await this.ragPromptManager.createRagPrompt(
        SystemRoleEnum.FINAL_SUMMARY_GENERATOR,
        instructionTemplate,
        instructionContent,
        ragOptions,
      );

      // Call LLM with the RAG-optimized prompt
      const response = await this.callLLM(
        `Generate ${level} summary`,
        ragPrompt.messages[0].content,
      );

      // Process response - may be JSON or plain text depending on the template
      try {
        const parsedResponse = JSON.parse(response);
        return parsedResponse.summary || parsedResponse.content || response;
      } catch (error) {
        // Not JSON, return as is
        return response;
      }
    } catch (error) {
      this.logger.error(
        `Error generating ${level} summary: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fall back to direct prompt
      const fallbackPrompt = `Please provide a ${level} summary of the meeting.`;
      return await this.callLLM(
        `Generate ${level} summary (fallback)`,
        fallbackPrompt,
      );
    }
  }

  /**
   * Format summaries for specific audiences
   */
  private async formatForAudiences(
    summaries: Record<string, string>,
    analyses: any,
    metadata: any,
  ): Promise<Record<string, string>> {
    this.logger.info('Formatting summaries for specific audiences');

    // Identify audience types from metadata or infer them
    const audienceTypes = this.identifyAudienceTypes(metadata, analyses);

    const audienceSummaries: Record<string, string> = {};

    for (const audience of audienceTypes) {
      // Choose the most appropriate detail level for this audience
      const detailLevel =
        audience === 'executive'
          ? 'executive'
          : audience === 'team_member'
            ? 'detailed'
            : audience === 'stakeholder'
              ? 'detailed'
              : 'executive';

      const baseSummary = summaries[detailLevel] || summaries.executive || '';

      // Create a RAG-optimized prompt for audience-specific formatting
      const instructionContent = `
        Reformat this meeting summary for a "${audience}" audience.
        
        Original summary:
        ${baseSummary}
        
        Adapt the content, tone, and focus to best serve a ${audience} audience by:
        ${this.getAudienceSpecificInstructions(audience)}
        
        Keep the same information but adjust presentation, emphasis, and framing.
      `;

      // Generate dummy embedding for simplicity
      const dummyEmbedding = new Array(1536)
        .fill(0)
        .map(() => Math.random() - 0.5);

      // Create RAG options
      const ragOptions = {
        userId: 'system',
        queryText: `Format summary for ${audience} audience`,
        queryEmbedding: dummyEmbedding,
        strategy: RagRetrievalStrategy.CUSTOM,
      };

      try {
        // Use RAG prompt manager
        const ragPrompt = await this.ragPromptManager.createRagPrompt(
          SystemRoleEnum.FINAL_SUMMARY_GENERATOR,
          InstructionTemplateNameEnum.CUSTOM,
          instructionContent,
          ragOptions,
        );

        // Call LLM with the RAG-optimized prompt
        const response = await this.callLLM(
          `Format for ${audience} audience`,
          ragPrompt.messages[0].content,
        );
        audienceSummaries[audience] = response;
      } catch (error) {
        this.logger.error(
          `Error formatting for ${audience} audience: ${error instanceof Error ? error.message : String(error)}`,
        );

        // Fall back to direct prompt
        const fallbackResponse = await this.callLLM(
          `Format for ${audience} audience (fallback)`,
          instructionContent,
        );
        audienceSummaries[audience] = fallbackResponse;
      }
    }

    return audienceSummaries;
  }

  /**
   * Identify audience types for formatting
   */
  private identifyAudienceTypes(metadata: any, analyses: any): string[] {
    // Default audiences
    const defaultAudiences = ['executive', 'team_member', 'stakeholder'];

    // Try to identify specific audience types from metadata
    const identifiedAudiences: string[] = [];

    if (metadata?.participants) {
      const hasExecutives = metadata.participants.some(
        (p: any) =>
          p.role?.toLowerCase().includes('executive') ||
          p.role?.toLowerCase().includes('director') ||
          p.role?.toLowerCase().includes('vp') ||
          p.role?.toLowerCase().includes('head'),
      );

      if (hasExecutives) {
        identifiedAudiences.push('executive');
      }

      // Check for technical team members
      const hasTechnical = metadata.participants.some(
        (p: any) =>
          p.role?.toLowerCase().includes('engineer') ||
          p.role?.toLowerCase().includes('developer') ||
          p.role?.toLowerCase().includes('technical'),
      );

      if (hasTechnical) {
        identifiedAudiences.push('technical');
      }

      // Check for product team members
      const hasProduct = metadata.participants.some(
        (p: any) =>
          p.role?.toLowerCase().includes('product') ||
          p.role?.toLowerCase().includes('design') ||
          p.role?.toLowerCase().includes('ux'),
      );

      if (hasProduct) {
        identifiedAudiences.push('product');
      }
    }

    // Return identified audiences or default ones
    return identifiedAudiences.length > 0
      ? identifiedAudiences
      : defaultAudiences;
  }

  /**
   * Get audience-specific formatting instructions
   */
  private getAudienceSpecificInstructions(audience: string): string {
    switch (audience) {
      case 'executive':
        return `
          - Emphasize strategic implications and business impact
          - Focus on decisions and high-level outcomes
          - Be concise and direct
          - Include executive-relevant metrics and KPIs
          - Highlight resource implications and risks
        `;
      case 'technical':
        return `
          - Include more technical details and implementation considerations
          - Emphasize technical decisions and their rationales
          - Highlight technical dependencies and challenges
          - Use more technical terminology where appropriate
          - Focus on technical action items and next steps
        `;
      case 'product':
        return `
          - Emphasize user/customer impact and product decisions
          - Highlight feature discussions and roadmap implications
          - Focus on design considerations and user experience
          - Include market and competitive insights
          - Emphasize product metrics and KPIs
        `;
      case 'team_member':
        return `
          - Focus on tactical details and immediate next steps
          - Highlight individual and team responsibilities
          - Include more details on discussion context
          - Emphasize timeline and delivery expectations
          - Make action items and accountabilities very clear
        `;
      case 'stakeholder':
        return `
          - Focus on progress, blockers, and support needed
          - Highlight decisions that affect stakeholder areas
          - Be diplomatic about challenges and conflicts
          - Emphasize cross-functional dependencies
          - Provide clear status updates and next steps
        `;
      default:
        return `
          - Focus on key decisions and action items
          - Provide clear context for why the meeting occurred
          - Highlight the most important outcomes
          - Make next steps and accountabilities clear
        `;
    }
  }

  /**
   * Analyze a specific segment of the transcript
   */
  async analyzeTranscriptSegment(
    segment: string,
    context?: any,
  ): Promise<AgentOutput> {
    this.logger.info('Analyzing transcript segment for summarization');

    const instructionContent = `
      Generate a concise summary of this meeting transcript segment.
      
      Include:
      1. Key topics discussed
      2. Decisions made (if any)
      3. Action items identified (if any)
      4. Notable points or insights
      
      TRANSCRIPT SEGMENT:
      ${segment}
      
      Return your summary as a concise paragraph.
    `;

    // Generate dummy embedding for simplicity
    const dummyEmbedding = new Array(1536)
      .fill(0)
      .map(() => Math.random() - 0.5);

    // Create RAG options
    const ragOptions = {
      userId: 'system',
      queryText: 'Summarize meeting transcript segment',
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
        'Summarize segment',
        ragPrompt.messages[0].content,
      );

      // Assess confidence in the summary
      const confidence = await this.assessConfidence({ summary: response });

      return {
        content: { summary: response },
        confidence,
        reasoning: `Generated segment summary based on key topics, decisions, and action items identified in the transcript.`,
        metadata: {
          segmentLength: segment.length,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(
        `Error analyzing transcript segment: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fall back to direct prompt
      const fallbackResponse = await this.callLLM(
        'Summarize segment (fallback)',
        instructionContent,
      );

      // Assess confidence in the fallback summary
      const fallbackConfidence = await this.assessConfidence({
        summary: fallbackResponse,
      });

      return {
        content: { summary: fallbackResponse },
        confidence: fallbackConfidence,
        reasoning: `Generated segment summary (fallback) based on transcript content.`,
        metadata: {
          segmentLength: segment.length,
          usedFallback: true,
        },
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Merge multiple analyses into a consolidated result
   */
  async mergeAnalyses(analyses: AgentOutput[]): Promise<AgentOutput> {
    this.logger.info(`Merging ${analyses.length} segment summaries`);

    if (analyses.length === 0) {
      throw new Error('No analyses to merge');
    }

    if (analyses.length === 1) {
      return analyses[0];
    }

    // Extract all segment summaries
    const summaries = analyses
      .map((a) => a.content?.summary || '')
      .filter(Boolean);

    // Create a RAG-optimized prompt for merging summaries
    const instructionContent = `
      Merge these segment summaries into a cohesive meeting summary.
      
      SEGMENT SUMMARIES:
      ${summaries.map((s, i) => `SEGMENT ${i + 1}:\n${s}`).join('\n\n')}
      
      Create a unified summary that:
      1. Flows logically from beginning to end
      2. Eliminates redundancy
      3. Preserves all key information
      4. Maintains chronological order where appropriate
      
      Return your merged summary as a comprehensive paragraph.
    `;

    // Generate dummy embedding for simplicity
    const dummyEmbedding = new Array(1536)
      .fill(0)
      .map(() => Math.random() - 0.5);

    // Create RAG options
    const ragOptions = {
      userId: 'system',
      queryText: 'Merge meeting segment summaries',
      queryEmbedding: dummyEmbedding,
      strategy: RagRetrievalStrategy.CUSTOM,
    };

    try {
      // Use RAG prompt manager
      const ragPrompt = await this.ragPromptManager.createRagPrompt(
        SystemRoleEnum.FINAL_SUMMARY_GENERATOR,
        InstructionTemplateNameEnum.CUSTOM,
        instructionContent,
        ragOptions,
      );

      // Call LLM with the RAG-optimized prompt
      const response = await this.callLLM(
        'Merge segment summaries',
        ragPrompt.messages[0].content,
      );

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
        content: { summary: response },
        confidence,
        reasoning: `Merged ${analyses.length} segment summaries into a cohesive whole.`,
        metadata: {
          sourceAnalyses: analyses.length,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(
        `Error merging segment summaries: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fall back to direct prompt
      const fallbackResponse = await this.callLLM(
        'Merge segment summaries (fallback)',
        instructionContent,
      );

      // Use medium confidence for fallback
      return {
        content: { summary: fallbackResponse },
        confidence: ConfidenceLevel.MEDIUM,
        reasoning: `Merged ${analyses.length} segment summaries using fallback approach.`,
        metadata: {
          sourceAnalyses: analyses.length,
          usedFallback: true,
        },
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Prioritize information based on importance
   */
  async prioritizeInformation(output: any): Promise<any> {
    this.logger.info('Prioritizing summary information');

    // For brevity, we'll implement a simple prioritization strategy
    const prioritized = { ...output };

    // Ensure highlights are limited and ordered by importance
    if (prioritized.highlights && Array.isArray(prioritized.highlights)) {
      prioritized.highlights.sort(
        (a: any, b: any) => (b.importance || 0) - (a.importance || 0),
      );

      if (prioritized.highlights.length > 5) {
        prioritized.highlights = prioritized.highlights.slice(0, 5);
      }
    }

    // Ensure recommendations are limited and ordered by impact
    if (
      prioritized.recommendations &&
      Array.isArray(prioritized.recommendations)
    ) {
      const impactValues = { high: 3, medium: 2, low: 1 };

      prioritized.recommendations.sort((a: any, b: any) => {
        const aValue = impactValues[a.impact as keyof typeof impactValues] || 0;
        const bValue = impactValues[b.impact as keyof typeof impactValues] || 0;
        return bValue - aValue;
      });

      if (prioritized.recommendations.length > 5) {
        prioritized.recommendations = prioritized.recommendations.slice(0, 5);
      }
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
   * Get default system prompt for summary synthesis
   */
  protected getDefaultSystemPrompt(): string {
    return `You are the Summary Synthesis Agent, specialized in distilling meeting analyses into clear, actionable summaries.
Your responsibilities include:
- Synthesizing insights from other specialist agents' analyses
- Creating summaries at different levels of detail for various audiences
- Extracting key highlights that deserve attention
- Generating actionable recommendations based on meeting content
- Formatting information appropriately for different stakeholders

When creating summaries, focus on clarity, actionability, and highlighting what truly matters.
Balance comprehensiveness with readability, and always prioritize information that will help teams move forward effectively.`;
  }
}
