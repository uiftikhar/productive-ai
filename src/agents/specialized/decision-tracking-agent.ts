import { v4 as uuidv4 } from 'uuid';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { BaseAgent } from '../base/base-agent';
import { AgentRequest, AgentResponse } from '../interfaces/agent.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { MeetingContextService } from '../../shared/user-context/services/meeting-context.service';
import { OpenAIAdapter } from '../adapters/openai-adapter';
import { EmbeddingService } from '../../shared/embedding/embedding.service';
import { ContextType } from '../../shared/user-context/types/context.types';
import {
  RagPromptManager,
  RagRetrievalStrategy,
} from '../../shared/services/rag-prompt-manager.service';
import { SystemRole, SystemRoleEnum } from '../../shared/prompts/prompt-types';
import {
  InstructionTemplateName,
  InstructionTemplateNameEnum,
} from '../../shared/prompts/instruction-templates';
import { MessageConfig } from '../adapters/language-model-adapter.interface';
import {
  Decision,
  DecisionCategory,
  DecisionQueryParams,
  DecisionReportConfig,
  DecisionReport,
  ImpactAssessment,
  DecisionStatus,
  DecisionTrackingParams,
} from './types/decision-tracking.types';
import { MeetingAnalysis } from './types/meeting-analysis.types';
import {
  AgentCommunicationChannel,
  AgentCommunicationMessage,
  DecisionTrackingRequest,
  DecisionTrackingResponse,
} from './interfaces/agent-communication.interface';
import { InjectLogger } from '../../shared/logger/inject-logger.decorator';

/**
 * DecisionTrackingAgent
 *
 * Analyzes and tracks decisions across meetings, categorizes them,
 * assesses their impact, and generates reports.
 */
export class DecisionTrackingAgent extends BaseAgent {
  private meetingContextService: MeetingContextService;
  private embeddingService: EmbeddingService;
  private ragPromptManager: RagPromptManager;
  private communicationChannel?: AgentCommunicationChannel;
  private readonly logger: Logger;
  private openaiAdapter: OpenAIAdapter;

  constructor(
    name: string = 'Decision Tracking Agent',
    description: string = 'Analyzes and tracks decisions across meetings',
    options: {
      id?: string;
      logger?: Logger;
      openaiAdapter?: OpenAIAdapter;
      meetingContextService?: MeetingContextService;
      embeddingService?: EmbeddingService;
      ragPromptManager?: RagPromptManager;
    } = {},
    @InjectLogger() logger: Logger,
  ) {
    super(name, description, {
      id: options.id || 'decision-tracking-agent',
      logger: options.logger,
      openaiAdapter: options.openaiAdapter,
    });

    this.openaiAdapter = options.openaiAdapter || new OpenAIAdapter();
    this.meetingContextService =
      options.meetingContextService || new MeetingContextService();

    // Use provided embedding service or create a new one with the OpenAI adapter
    if (options.embeddingService) {
      this.embeddingService = options.embeddingService;
    } else if (this.openaiAdapter) {
      this.embeddingService = new EmbeddingService(
        this.openaiAdapter,
        this.logger,
      );
    } else {
      this.embeddingService = new EmbeddingService({} as any, this.logger);
      this.logger.warn(
        'No embeddingService or openaiAdapter provided, embedding functionality will be limited',
      );
    }

    // Initialize RAG prompt manager
    this.ragPromptManager = options.ragPromptManager || new RagPromptManager();

    this.logger = logger;

    // Register capabilities
    this.registerCapability({
      name: 'analyze_decisions',
      description: 'Analyzes decisions from meeting transcripts',
      parameters: {
        meetingAnalysis:
          'The analysis of a meeting containing transcript and context',
        identifyOnly:
          'Only identify decisions without categorizing or analyzing them',
        performImpactAssessment: 'Assess the impact of identified decisions',
        categorize: 'Categorize decisions into different types',
        trackDependencies: 'Track dependencies between decisions',
      },
    });

    this.registerCapability({
      name: 'generate_report',
      description: 'Generates a report of tracked decisions',
      parameters: {
        format:
          'Report format (summary, detailed, timeline, impact, dashboard)',
        groupBy: 'How to group decisions in the report',
        includeRationale: 'Include decision rationale in the report',
        includeImpact: 'Include impact assessment in the report',
        dateRange: 'Date range for decisions to include',
        filters: 'Additional filters for the report',
      },
    });

    this.registerCapability({
      name: 'query_decisions',
      description: 'Queries decisions based on criteria',
      parameters: {
        status: 'Filter by decision status',
        categories: 'Filter by decision categories',
        impact: 'Filter by impact level',
        fromDate: 'Filter by start date',
        toDate: 'Filter by end date',
        decisionMakers: 'Filter by decision makers',
        tags: 'Filter by tags',
        searchText: 'Search within decision text',
        meetingIds: 'Filter by meeting IDs',
      },
    });

    this.registerCapability('trackDecisions', {
      description: 'Track and manage decisions made in meetings',
      parameters: {
        meetingId: {
          type: 'string',
          required: true,
          description: 'ID of the meeting to track decisions for',
        },
        transcript: {
          type: 'string',
          required: true,
          description: 'Transcript of the meeting',
        },
        userId: {
          type: 'string',
          required: true,
          description: 'ID of the user',
        },
      },
    });

    this.registerCapability('generateDecisionReport', {
      description: 'Generate a report of tracked decisions',
      parameters: {
        userId: {
          type: 'string',
          required: true,
          description: 'ID of the user requesting the report',
        },
        timeframe: {
          type: 'string',
          required: false,
          description:
            'Timeframe for decisions to include (e.g., "last_week", "last_month")',
        },
        confidenceThreshold: {
          type: 'number',
          required: false,
          description:
            'Minimum confidence threshold for decisions to include (0-100)',
        },
        performImpactAssessment: {
          type: 'boolean',
          required: false,
          description: 'Whether to include impact assessment in the report',
        },
      },
    });

    // Don't auto-initialize to allow for testing with mocks
    // this.initialize();
  }

  /**
   * Set the communication channel for agent-to-agent communication
   */
  setCommunicationChannel(channel: AgentCommunicationChannel): void {
    this.communicationChannel = channel;
    this.registerMessageHandler();
  }

  /**
   * Register message handler for agent-to-agent communication
   */
  private registerMessageHandler(): void {
    if (!this.communicationChannel) return;

    this.communicationChannel.registerHandler(
      async (message: AgentCommunicationMessage) => {
        if (message.type === 'request') {
          const request = message as DecisionTrackingRequest;

          if (request.content.requestType === 'analyze_decisions') {
            const { meetingAnalysis, parameters } = request.content;

            const decisions = await this.analyzeDecisions(
              meetingAnalysis,
              parameters || {},
            );

            const response: DecisionTrackingResponse = {
              id: uuidv4(),
              from: this.id,
              to: message.from,
              timestamp: Date.now(),
              type: 'response',
              correlationId: message.id,
              content: {
                responseType: 'decisions_analyzed',
                meetingId: meetingAnalysis.meetingId,
                decisions,
              },
            };

            return response;
          }

          if (request.content.requestType === 'generate_report') {
            const { parameters } = request.content;

            const report = await this.generateReport(parameters);

            return {
              id: uuidv4(),
              from: this.id,
              to: message.from,
              timestamp: Date.now(),
              type: 'response',
              correlationId: message.id,
              content: {
                responseType: 'report_generated',
                report,
              },
            };
          }
        }
      },
    );
  }

  /**
   * Implementation of the abstract executeInternal method
   * required by BaseAgent
   */
  protected async executeInternal(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const capability = request.capability || 'analyze_decisions';

    if (!this.canHandle(capability)) {
      throw new Error(`Capability not supported: ${capability}`);
    }

    const userId = request.context?.userId;
    if (!userId) {
      throw new Error('User ID is required');
    }

    try {
      switch (capability) {
        case 'analyze_decisions': {
          // Parse the input to get the meeting analysis
          const meetingAnalysis =
            typeof request.input === 'string'
              ? (JSON.parse(request.input) as MeetingAnalysis)
              : (request.parameters?.meetingAnalysis as MeetingAnalysis);

          if (!meetingAnalysis) {
            throw new Error('Meeting analysis is required');
          }

          const decisions = await this.analyzeDecisions(
            meetingAnalysis,
            request.parameters as DecisionTrackingParams,
          );

          return {
            output: JSON.stringify({ decisions }),
          };
        }

        case 'generate_report': {
          const reportConfig = request.parameters as DecisionReportConfig;

          if (!reportConfig || !reportConfig.format) {
            // Create default report config if none provided
            const defaultConfig: DecisionReportConfig = {
              format: 'summary',
              includeRationale: false,
              includeImpact: false,
            };

            const report = await this.generateReport(defaultConfig);
            return {
              output: JSON.stringify({ report }),
            };
          }

          const report = await this.generateReport(reportConfig);

          return {
            output: JSON.stringify({ report }),
          };
        }

        case 'query_decisions': {
          const queryParams = request.parameters as DecisionQueryParams;

          if (!queryParams) {
            throw new Error('Query parameters are required');
          }

          const decisions = await this.queryDecisions(queryParams);

          return {
            output: JSON.stringify({ decisions }),
          };
        }

        case 'trackDecisions': {
          const { meetingId, transcript, userId } = request.parameters as {
            meetingId: string;
            transcript: string;
            userId: string;
          };

          await this.trackDecisions(meetingId, transcript, userId);

          return {
            output: JSON.stringify({
              message: 'Decisions tracked successfully',
            }),
          };
        }

        case 'generateDecisionReport': {
          const {
            userId,
            timeframe,
            confidenceThreshold,
            performImpactAssessment,
          } = request.parameters as {
            userId: string;
            timeframe: string;
            confidenceThreshold: number;
            performImpactAssessment: boolean;
          };

          const report = await this.generateDecisionReport(
            userId,
            timeframe,
            confidenceThreshold,
            performImpactAssessment,
          );

          return {
            output: JSON.stringify({ report }),
          };
        }

        default:
          throw new Error(`Unsupported capability: ${capability}`);
      }
    } catch (error) {
      this.logger.error('Error executing DecisionTrackingAgent', {
        error: error instanceof Error ? error.message : String(error),
        capability,
        userId,
      });
      throw error;
    }
  }

  /**
   * Analyze decisions from meeting analysis
   */
  async analyzeDecisions(
    meetingAnalysis: MeetingAnalysis,
    params: DecisionTrackingParams = {},
  ): Promise<Decision[]> {
    this.logger.info(
      `Analyzing decisions for meeting ${meetingAnalysis.meetingId}`,
    );

    try {
      // Extract potential decisions from the meeting analysis
      let decisions: Decision[] = [];

      // If meeting analysis has decisions, convert them to our decision type
      if (meetingAnalysis.decisions && meetingAnalysis.decisions.length > 0) {
        decisions = meetingAnalysis.decisions.map((d) =>
          this.convertMeetingDecisionToTrackingDecision(d),
        );
      }

      // If no decisions provided or explicitly asked to identify, run identification
      if (decisions.length === 0 || params.identifyOnly) {
        decisions = await this.identifyDecisions(meetingAnalysis);
      }

      // Categorize decisions
      if (params.categorize !== false) {
        decisions = await this.categorizeDecisions(decisions);
      }

      // Assess decision impact
      if (params.performImpactAssessment) {
        decisions = await this.assessImpact(decisions);
      }

      // Track dependencies between decisions
      if (params.trackDependencies) {
        decisions = await this.trackDependencies(decisions);
      }

      // Store decisions in the context service
      await this.storeDecisions(decisions);

      return decisions;
    } catch (error) {
      this.logger.error('Error analyzing decisions', {
        error: error instanceof Error ? error.message : String(error),
        meetingId: meetingAnalysis.meetingId,
      });
      throw error;
    }
  }

  /**
   * Identify decisions from meeting transcript
   */
  private async identifyDecisions(
    meetingAnalysis: MeetingAnalysis,
  ): Promise<Decision[]> {
    this.logger.info('Identifying decisions from transcript');

    const transcript = meetingAnalysis.transcript
      .map((segment) => `${segment.speaker}: ${segment.text}`)
      .join('\n');

    // Check if we have an OpenAI adapter
    if (!this.openaiAdapter) {
      throw new Error('OpenAI adapter is required for decision identification');
    }

    try {
      // Format the prompt
      const prompt = `Analyze the following meeting transcript and identify all decisions made during the meeting. 
        A decision is a clear conclusion or determination that was agreed upon by participants.
        
        Transcript:
        ${transcript}
        
        For each decision, provide:
        1. The text of the decision
        2. Who made or approved the decision (if identified)
        3. Any context around the decision
        
        Format your response as a JSON array with objects containing text, decisionMaker, and context fields.`;

      // Use the OpenAI adapter directly
      const response = await this.openaiAdapter.generateChatCompletion(
        [{ role: 'user', content: prompt }],
        {
          temperature: 0.2,
          maxTokens: 2000,
        },
      );

      // Parse the JSON response
      let content = '';
      if (typeof response === 'string') {
        content = response;
      } else if (response && typeof response === 'object') {
        // Handle different response formats
        if ('content' in response) {
          content = response.content as string;
        } else if ('text' in response) {
          content = response.text as string;
        } else {
          content = JSON.stringify(response);
        }
      } else {
        throw new Error('Unexpected response format from OpenAI adapter');
      }

      const parsedDecisions = JSON.parse(content);

      // Convert to Decision objects
      if (Array.isArray(parsedDecisions)) {
        return parsedDecisions.map((decision: any) => ({
          id: uuidv4(),
          text: decision.text,
          decisionMaker: decision.decisionMaker,
          context: decision.context,
          timestamp: Date.now(),
          status: 'proposed' as DecisionStatus,
          source: {
            meetingId: meetingAnalysis.meetingId,
            segmentId: 'unknown',
            rawText: decision.text,
          },
          relatedTopics: [],
          category: 'other' as DecisionCategory,
          impact: 'medium',
        }));
      }

      return [];
    } catch (error) {
      this.logger.error('Error identifying decisions', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Categorize decisions into different types
   */
  async categorizeDecisions(decisions: Decision[]): Promise<Decision[]> {
    this.logger.info('Categorizing decisions...');

    try {
      const prompt = `As a decision analysis expert, categorize the following decisions 
      and assess their impact. For each decision, provide:
      1. A category (Technical, Business, Process, Resource, or Other)
      2. Impact assessment (High, Medium, Low)
      3. A brief explanation of your assessment
      
      Decisions to analyze:
      ${decisions.map((d) => `- ${d.text}`).join('\n')}
      
      Format each response as JSON with "category", "impact", and "explanation" fields.
      Return an array of objects with these fields.`;

      // Use the OpenAI adapter directly
      const response = await this.openaiAdapter.generateChatCompletion(
        [{ role: 'user', content: prompt }],
        {
          temperature: 0.1,
          maxTokens: 2000,
        },
      );

      let responseText = '';
      if (typeof response === 'object' && response !== null) {
        if ('content' in response && response.content) {
          responseText = response.content;
        } else if ('text' in response && response.text) {
          responseText = response.text;
        } else {
          responseText = JSON.stringify(response);
        }
      } else if (typeof response === 'string') {
        responseText = response;
      } else {
        throw new Error('Unexpected response format from OpenAI');
      }

      // Parse the response
      const parsedResult =
        this.parseJsonResponse<
          { category: string; impact: string; explanation: string }[]
        >(responseText);

      // Update the decisions with the categorization info
      return decisions.map((decision, i) => {
        if (parsedResult && parsedResult[i]) {
          return {
            ...decision,
            category: parsedResult[i].category,
            impact: parsedResult[i].impact,
            explanation: parsedResult[i].explanation,
          };
        }
        return decision;
      });
    } catch (error) {
      this.logger.error('Error categorizing decisions', error);
      return decisions;
    }
  }

  /**
   * Convert MeetingAnalysis Decision to DecisionTracking Decision
   */
  private convertMeetingDecisionToTrackingDecision(decision: any): Decision {
    return {
      id: decision.id || uuidv4(),
      text: decision.text,
      summary: decision.summary,
      decisionMaker: decision.decisionMaker,
      approvers: decision.approvers || [],
      category: decision.category || ('other' as DecisionCategory),
      impact: decision.impact || 'medium',
      status: decision.status || ('proposed' as DecisionStatus),
      statusHistory: decision.statusHistory || [],
      source: decision.source || { meetingId: 'unknown', segmentId: 'unknown' },
      relatedTopics: decision.relatedTopics || [],
      context: decision.context,
      timestamp: decision.timestamp || Date.now(),
      tags: decision.tags || [],
      dependencies: decision.dependencies || [],
      impactAssessment: decision.impactAssessment,
    };
  }

  /**
   * Assess the impact of decisions
   */
  async assessImpact(decisions: Decision[]): Promise<Decision[]> {
    this.logger.info('Assessing impact of decisions...');

    try {
      const prompt = `As a decision impact analyst, assess the potential impact of these decisions 
      on the organization, project, or team. For each decision, provide:
      1. Impact level (High, Medium, Low)
      2. A brief explanation of your assessment
      
      Decisions to analyze:
      ${decisions.map((d) => `- ${d.text} (Category: ${d.category || 'Unknown'})`).join('\n')}
      
      Format each response as JSON with "impact" and "explanation" fields.
      Return an array of objects with these fields.`;

      // Use the OpenAI adapter directly
      const response = await this.openaiAdapter.generateChatCompletion(
        [{ role: 'user', content: prompt }],
        {
          temperature: 0.2,
          maxTokens: 2000,
        },
      );

      let responseText = '';
      if (typeof response === 'object' && response !== null) {
        if ('content' in response && response.content) {
          responseText = response.content;
        } else if ('text' in response && response.text) {
          responseText = response.text;
        } else {
          responseText = JSON.stringify(response);
        }
      } else if (typeof response === 'string') {
        responseText = response;
      } else {
        throw new Error('Unexpected response format from OpenAI');
      }

      // Parse the response
      const parsedResult =
        this.parseJsonResponse<{ impact: string; explanation: string }[]>(
          responseText,
        );

      // Update the decisions with the impact assessment
      return decisions.map((decision, i) => {
        if (parsedResult && parsedResult[i]) {
          return {
            ...decision,
            impact: parsedResult[i].impact,
            explanation: parsedResult[i].explanation,
          };
        }
        return decision;
      });
    } catch (error) {
      this.logger.error('Error assessing impact of decisions', error);
      return decisions;
    }
  }

  /**
   * Track dependencies between decisions
   */
  async trackDependencies(decisions: Decision[]): Promise<Decision[]> {
    this.logger.info('Tracking dependencies between decisions...');

    try {
      const prompt = `Analyze the following decisions and identify any dependencies between them.
      For each decision, list the IDs of other decisions it depends on.
      
      Decisions:
      ${decisions.map((d) => `ID: ${d.id}\nText: ${d.text}\nCategory: ${d.category || 'Unknown'}\nImpact: ${d.impact || 'Unknown'}`).join('\n\n')}
      
      Format the response as a JSON array where each object has an "id" field and a "dependencies" array of IDs.
      Return an array of objects with these fields.`;

      const messages = [{ role: 'user', content: prompt }];

      const response = await this.openaiAdapter.generateChatCompletion(
        messages,
        {
          temperature: 0.3,
          maxTokens: 3000,
        },
      );

      let responseText = '';
      if (typeof response === 'object' && response !== null) {
        if ('content' in response && response.content) {
          responseText = response.content;
        } else if ('text' in response && response.text) {
          responseText = response.text;
        } else {
          responseText = JSON.stringify(response);
        }
      } else if (typeof response === 'string') {
        responseText = response;
      } else {
        throw new Error('Unexpected response format from OpenAI');
      }

      // Parse the response
      const parsedResult =
        this.parseJsonResponse<{ id: string; dependencies: string[] }[]>(
          responseText,
        );

      // Update the decisions with dependency information
      return decisions.map((decision) => {
        const dependencyInfo = parsedResult?.find((d) => d.id === decision.id);
        if (dependencyInfo) {
          return {
            ...decision,
            dependencies: dependencyInfo.dependencies,
          };
        }
        return decision;
      });
    } catch (error) {
      this.logger.error('Error tracking dependencies between decisions', error);
      return decisions;
    }
  }

  /**
   * Store decisions in the context service
   */
  private async storeDecisions(decisions: Decision[]): Promise<void> {
    for (const decision of decisions) {
      try {
        await this.meetingContextService.storeDecision({
          id: decision.id,
          description: decision.text,
          context: decision.context,
        });

        this.logger.debug(`Stored decision ${decision.id}`);
      } catch (error) {
        this.logger.error(`Error storing decision ${decision.id}`, error);
      }
    }
  }

  /**
   * Query decisions based on parameters
   */
  async queryDecisions(params: DecisionQueryParams): Promise<Decision[]> {
    this.logger.info('Querying decisions', params);

    // Start timing execution
    this.startExecution();

    try {
      // Get all decisions from the context service
      const allDecisions = await this.meetingContextService.getDecisions();

      // Filter decisions based on query parameters
      let filteredDecisions = allDecisions;

      // Filter by status
      if (params.status && params.status.length > 0) {
        filteredDecisions = filteredDecisions.filter((decision) =>
          params.status?.includes(decision.status as DecisionStatus),
        );
      }

      // Filter by category
      if (params.categories && params.categories.length > 0) {
        filteredDecisions = filteredDecisions.filter((decision) =>
          params.categories?.includes(decision.category as DecisionCategory),
        );
      }

      // Filter by impact
      if (params.impact && params.impact.length > 0) {
        filteredDecisions = filteredDecisions.filter((decision) =>
          params.impact?.includes(decision.impact as 'low' | 'medium' | 'high'),
        );
      }

      // Filter by date range
      if (params.fromDate) {
        filteredDecisions = filteredDecisions.filter(
          (decision) => decision.timestamp >= params.fromDate!.getTime(),
        );
      }

      if (params.toDate) {
        filteredDecisions = filteredDecisions.filter(
          (decision) => decision.timestamp <= params.toDate!.getTime(),
        );
      }

      // Filter by decision makers
      if (params.decisionMakers && params.decisionMakers.length > 0) {
        filteredDecisions = filteredDecisions.filter(
          (decision) =>
            decision.decisionMaker &&
            params.decisionMakers?.includes(decision.decisionMaker),
        );
      }

      // Filter by tags
      if (params.tags && params.tags.length > 0) {
        filteredDecisions = filteredDecisions.filter(
          (decision) =>
            decision.tags &&
            params.tags?.some((tag) => decision.tags?.includes(tag)),
        );
      }

      // Filter by meeting IDs
      if (params.meetingIds && params.meetingIds.length > 0) {
        filteredDecisions = filteredDecisions.filter((decision) =>
          params.meetingIds?.includes(decision.source.meetingId),
        );
      }

      // Search by text
      if (params.searchText) {
        const searchText = params.searchText.toLowerCase();
        filteredDecisions = filteredDecisions.filter(
          (decision) =>
            decision.text.toLowerCase().includes(searchText) ||
            (decision.summary &&
              decision.summary.toLowerCase().includes(searchText)),
        );
      }

      return filteredDecisions;
    } catch (error) {
      this.logger.error('Error querying decisions', error);
      throw error;
    } finally {
      // End timing execution
      this.endExecution();
    }
  }

  /**
   * Generate a report of decisions
   */
  async generateReport(config: DecisionReportConfig): Promise<DecisionReport> {
    this.logger.info('Generating decision report', config);

    // Start timing execution
    this.startExecution();

    try {
      // Query decisions based on filters
      const decisions = await this.queryDecisions(config.filters || {});

      // Calculate summary statistics
      const summary = this.calculateReportSummary(decisions);

      // Generate insights if requested
      let insights: string[] | undefined;

      if (config.format === 'dashboard' || config.format === 'detailed') {
        insights = await this.generateInsights(decisions, config);
      }

      // Create the report
      const report: DecisionReport = {
        title: `Decision Report - ${config.format.charAt(0).toUpperCase() + config.format.slice(1)}`,
        generateTime: Date.now(),
        parameters: config,
        summary,
        decisions,
        insights,
      };

      return report;
    } catch (error) {
      this.logger.error('Error generating report', error);
      throw error;
    } finally {
      // End timing execution
      this.endExecution();
    }
  }

  /**
   * Calculate summary statistics for report
   */
  private calculateReportSummary(
    decisions: Decision[],
  ): DecisionReport['summary'] {
    // Count by status
    const byStatus: Record<DecisionStatus, number> = {
      proposed: 0,
      under_review: 0,
      approved: 0,
      rejected: 0,
      implemented: 0,
      blocked: 0,
      deferred: 0,
      superseded: 0,
    };

    // Count by category
    const byCategory: Record<DecisionCategory, number> = {
      strategic: 0,
      tactical: 0,
      operational: 0,
      technical: 0,
      financial: 0,
      personnel: 0,
      policy: 0,
      other: 0,
    };

    // Count by impact
    const byImpact: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
    };

    // Process each decision
    decisions.forEach((decision) => {
      // Count by status
      if (decision.status) {
        byStatus[decision.status as DecisionStatus] =
          (byStatus[decision.status as DecisionStatus] || 0) + 1;
      }

      // Count by category
      if (decision.category) {
        byCategory[decision.category as DecisionCategory] =
          (byCategory[decision.category as DecisionCategory] || 0) + 1;
      }

      // Count by impact
      if (decision.impact) {
        byImpact[decision.impact] = (byImpact[decision.impact] || 0) + 1;
      }
    });

    // Create timeline data (if there are decisions)
    let timeline;

    if (decisions.length > 0) {
      // Sort decisions by timestamp
      const sortedDecisions = [...decisions].sort(
        (a, b) => a.timestamp - b.timestamp,
      );

      // Create timeline with monthly buckets
      const timelineMap = new Map<string, number>();

      sortedDecisions.forEach((decision) => {
        const date = new Date(decision.timestamp);
        const month = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

        timelineMap.set(month, (timelineMap.get(month) || 0) + 1);
      });

      // Convert to arrays for the report
      const labels = Array.from(timelineMap.keys());
      const counts = labels.map((label) => timelineMap.get(label) || 0);

      timeline = { labels, counts };
    }

    return {
      totalDecisions: decisions.length,
      byStatus,
      byCategory,
      byImpact,
      timeline,
    };
  }

  /**
   * Generate insights from decisions
   */
  private async generateInsights(
    decisions: Decision[],
    config: DecisionReportConfig,
  ): Promise<string[]> {
    if (decisions.length === 0) {
      return ['No decisions available to generate insights.'];
    }

    const messages: BaseMessage[] = [
      new HumanMessage({
        content: `Analyze the following ${decisions.length} decisions and generate key insights:
        
        ${decisions
          .map(
            (d) =>
              `ID: ${d.id}
          Category: ${d.category}
          Impact: ${d.impact}
          Status: ${d.status}
          Text: ${d.text}
          ${d.context ? `Context: ${d.context}` : ''}
          `,
          )
          .join('\n\n')}
        
        Format:
        - Generate 5-7 key insights about these decisions
        - Focus on patterns, trends, and notable observations
        - Be specific and actionable
        - Return as a JSON array of strings`,
      }),
    ];

    const messageConfig: MessageConfig = {
      messages,
      temperature: 0.5,
      maxTokens: 2000,
    };

    const response =
      await this.openaiAdapter.generateChatCompletion(messageConfig);

    try {
      const insights = JSON.parse(response.content);

      if (Array.isArray(insights)) {
        return insights;
      }

      return ['Unable to generate insights from the available decisions.'];
    } catch (error) {
      this.logger.error('Error parsing insights response', error);
      return ['Error generating insights from the available decisions.'];
    }
  }

  // Add parseJsonResponse helper method
  private parseJsonResponse<T>(responseText: string): T | null {
    try {
      return JSON.parse(responseText) as T;
    } catch (error) {
      this.logger.error('Error parsing JSON response', error);
      return null;
    }
  }

  async trackDecisions(
    meetingId: string,
    transcript: string,
    userId: string,
  ): Promise<void> {
    // Implementation of trackDecisions method
  }

  async generateDecisionReport(
    userId: string,
    timeframe: string,
    confidenceThreshold: number,
    performImpactAssessment: boolean,
  ): Promise<string> {
    // Implementation of generateDecisionReport method
  }
}
