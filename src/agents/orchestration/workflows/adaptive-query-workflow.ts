import { WorkflowDefinition } from '../workflow-definition.service';
import { AgentRegistryService } from '../../services/agent-registry.service';
import {
  ModelRouterService,
  ModelSelectionCriteria,
} from '../model-router.service';
import { KnowledgeRetrievalAgent } from '../../specialized/knowledge-retrieval-agent';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { RagRetrievalStrategy } from '../../../shared/services/rag-prompt-manager.service';
import { BaseAgent } from '../../base/base-agent';
import { AgentRequest, AgentResponse } from '../../interfaces/agent.interface';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { v4 as uuid } from 'uuid';
import { Logger } from '../../../shared/logger/logger.interface';
import { StreamAggregationStrategy } from '../multi-agent-streaming-aggregator';

/**
 * Query Analyzer Agent
 * Specializes in analyzing query complexity and requirements
 */
class QueryAnalyzerAgent extends BaseAgent {
  constructor() {
    super(
      'Query Analyzer',
      'Analyzes queries to determine complexity and requirements',
    );

    this.registerCapability({
      name: 'analyze_query_complexity',
      description:
        'Analyze a query to determine its complexity and processing requirements',
      parameters: {
        query: 'The query to analyze',
        userId: 'The ID of the user making the query',
      },
    });

    // Initialize the agent by default
    this.initialize();
  }

  protected async executeInternal(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const query = typeof request.input === 'string' ? request.input : '';

    // Simple complexity analysis - in a real system this would be more sophisticated
    const wordCount = query.split(/\s+/).length;
    const containsCodeRequest = /code|function|implement|program|script/i.test(
      query,
    );
    const requiresCreativity = /creative|imagine|design|story|novel/i.test(
      query,
    );
    const requiresFactualAnswer =
      /what is|how does|explain|when did|who is/i.test(query);

    // Determine task complexity
    let taskComplexity: 'simple' | 'medium' | 'complex' = 'medium';
    if (wordCount > 30 || containsCodeRequest) {
      taskComplexity = 'complex';
    } else if (wordCount < 10 && !containsCodeRequest && !requiresCreativity) {
      taskComplexity = 'simple';
    }

    // Determine if streaming is valuable for this query
    const streamingRequired =
      wordCount > 20 || containsCodeRequest || requiresCreativity;

    // Determine response time preference
    let responseTime: 'fast' | 'balanced' | 'thorough' = 'balanced';
    if (requiresFactualAnswer && wordCount < 15) {
      responseTime = 'fast';
    } else if (containsCodeRequest || requiresCreativity || wordCount > 30) {
      responseTime = 'thorough';
    }

    // Determine special capabilities needed
    const specialCapabilities: string[] = [];
    if (containsCodeRequest) specialCapabilities.push('code');
    if (requiresCreativity) specialCapabilities.push('creative');
    if (requiresFactualAnswer) specialCapabilities.push('analysis');

    // Determine whether knowledge retrieval is needed
    const requiresKnowledgeRetrieval =
      requiresFactualAnswer ||
      /reference|context|information about|remember/i.test(query);

    // Return the analysis results
    return {
      output: JSON.stringify({
        taskComplexity,
        responseTime,
        streamingRequired,
        requiresKnowledgeRetrieval,
      }),
      artifacts: {
        taskComplexity,
        responseTime,
        specialCapabilities,
        streamingRequired,
        requiresKnowledgeRetrieval,
        modelSelectionCriteria: {
          taskComplexity,
          responseTime,
          costSensitivity: 'medium',
          streamingRequired,
          contextSize: taskComplexity === 'complex' ? 16000 : 8000,
          requiresSpecialCapabilities: specialCapabilities,
        },
      },
    };
  }
}

/**
 * Model Selector Agent
 * Specializes in selecting the appropriate model based on query characteristics
 */
class ModelSelectorAgent extends BaseAgent {
  private modelRouter: ModelRouterService;

  constructor() {
    super(
      'Model Selector',
      'Selects appropriate models based on query characteristics',
    );

    this.modelRouter = ModelRouterService.getInstance();

    this.registerCapability({
      name: 'select_model',
      description: 'Select the most appropriate model based on query criteria',
      parameters: {
        criteria: 'The selection criteria for the model',
        retrievedContext: 'Context items retrieved for the query',
        userId: 'The ID of the user making the query',
        conversationId: 'The conversation ID',
      },
    });

    // Initialize the agent by default
    this.initialize();
  }

  protected async executeInternal(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const criteria = request.parameters?.criteria as ModelSelectionCriteria;
    const retrievedContext = request.parameters?.retrievedContext || [];

    if (!criteria) {
      throw new Error('Model selection criteria must be provided');
    }

    // Select the model using Model Router
    const selectedModel = this.modelRouter.selectModel(criteria);

    // Prepare context for the model
    let availableContext = retrievedContext;
    const contextSize = selectedModel.contextWindow - 2000; // Reserve tokens for prompt and response

    if (availableContext.length > 0) {
      // Use the Model Router to select optimal context
      availableContext = await this.modelRouter.manageContextWindow(
        typeof request.input === 'string' ? request.input : '',
        availableContext,
        contextSize,
      );
    }

    return {
      output: JSON.stringify({ selectedModel: selectedModel.modelName }),
      artifacts: {
        selectedModel,
        availableContext,
        promptReady: true,
      },
    };
  }
}

/**
 * Response Generator Agent
 * Specializes in generating responses using the selected model and context
 */
class ResponseGeneratorAgent extends BaseAgent {
  private modelRouter: ModelRouterService;

  constructor() {
    super(
      'Response Generator',
      'Generates responses using selected models and context',
    );

    this.modelRouter = ModelRouterService.getInstance();

    this.registerCapability({
      name: 'generate_response',
      description: 'Generate a response using the selected model and context',
      parameters: {
        selectedModel: 'The selected model configuration',
        availableContext: 'Context items available for the query',
        contextAvailable: 'Whether context is available',
        taskComplexity: 'The complexity of the task',
        streamingRequired: 'Whether streaming is required',
        streamingHandler: 'Handler for streaming responses',
        modelSelectionCriteria: 'The model selection criteria',
        userId: 'The ID of the user making the query',
        conversationId: 'The conversation ID',
      },
    });

    // Initialize the agent by default
    this.initialize();
  }

  protected async executeInternal(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const params = request.parameters || {};
    const selectedModel = params.selectedModel;
    const availableContext = params.availableContext || [];
    const contextAvailable = params.contextAvailable === true;
    const taskComplexity = params.taskComplexity || 'medium';
    const streamingRequired = params.streamingRequired === true;
    const streamingHandler = params.streamingHandler;
    const modelCriteria = params.modelSelectionCriteria;

    if (!selectedModel && !modelCriteria) {
      throw new Error(
        'Either selected model or model criteria must be provided',
      );
    }

    // Prepare messages for the model
    const messages: BaseMessage[] = [
      new SystemMessage(
        `You are a helpful assistant that provides accurate and helpful responses.${
          contextAvailable
            ? ' Use the provided context to answer the question accurately.'
            : ' If you do not know the answer, say so clearly.'
        }${
          taskComplexity === 'complex'
            ? ' Provide detailed and comprehensive responses for complex queries.'
            : ''
        }`,
      ),
    ];

    // Add context if available
    if (contextAvailable && availableContext.length > 0) {
      let contextStr =
        'Here is some relevant information to help answer the query:\n\n';

      availableContext.forEach((item: any, index: number) => {
        contextStr += `[${index + 1}] ${item.content}\n`;
        if (item.source) {
          contextStr += `Source: ${item.source}\n`;
        }
        contextStr += '\n';
      });

      messages.push(new SystemMessage(contextStr));
    }

    // Add the user query
    messages.push(
      new HumanMessage(typeof request.input === 'string' ? request.input : ''),
    );

    try {
      // Process the request with the Model Router
      const response = await this.modelRouter.processRequest(
        messages,
        modelCriteria,
        streamingRequired ? streamingHandler : undefined,
      );

      return {
        output: response,
        artifacts: {
          contextUsed: contextAvailable,
          modelUsed: selectedModel?.modelName || modelCriteria,
        },
      };
    } catch (error) {
      this.logger.error('Response generation failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return an error response without the 'error' property
      return {
        output:
          "I'm sorry, I wasn't able to generate a complete response due to an error.",
      };
    }
  }
}

/**
 * Creates an adaptive query workflow that handles complex queries with
 * multiple specialized agents and optimized response generation
 */
export class AdaptiveQueryWorkflow {
  private registry: AgentRegistryService;
  private logger: Logger;

  constructor(
    options: {
      registry?: AgentRegistryService;
      logger?: Logger;
    } = {},
  ) {
    this.registry = options.registry || AgentRegistryService.getInstance();
    this.logger = options.logger || new ConsoleLogger();
  }

  /**
   * Initialize the agents required for this workflow
   */
  public async initialize(): Promise<void> {
    // Register required agents if they don't exist
    this.ensureAgentsRegistered();
    this.logger.info('Adaptive Query Workflow initialized');
  }

  /**
   * Create an instance of the workflow definition
   */
  public createWorkflowDefinition(): WorkflowDefinition {
    return {
      id: uuid(),
      name: 'adaptive-query-workflow',
      description:
        'Process queries with adaptive model selection and knowledge retrieval',
      startAt: 'analyzeQuery',
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),

      steps: [
        {
          id: 'analyzeQuery',
          name: 'Analyze Query Complexity',
          description:
            'Analyze the user query to determine its complexity and requirements',
          agentId: 'query-analyzer',
          capability: 'analyze_query_complexity',
          input: (state: Record<string, any>) => state.input,
          parameters: (state: Record<string, any>) => ({
            query: state.input,
            userId: state.userId,
          }),
          onSuccess: ['retrieveKnowledge'],
          streaming: false,
        },

        {
          id: 'retrieveKnowledge',
          name: 'Retrieve Knowledge',
          description: 'Retrieve relevant knowledge for the query if needed',
          agentId: 'knowledge-retrieval',
          capability: 'retrieve_knowledge',
          condition: (state: Record<string, any>) =>
            state.variables.requiresKnowledgeRetrieval === true,
          input: (state: Record<string, any>) => state.input,
          parameters: (state: Record<string, any>) => ({
            userId: state.userId,
            strategy: RagRetrievalStrategy.HYBRID,
            maxItems: state.variables.taskComplexity === 'complex' ? 10 : 5,
            minRelevanceScore: 0.6,
            conversationId: state.conversationId,
          }),
          onSuccess: ['selectModel'],
          streaming: false,
        },

        {
          id: 'selectModel',
          name: 'Select Model',
          description: 'Select the appropriate model based on query analysis',
          agentId: 'model-selector',
          capability: 'select_model',
          input: (state: Record<string, any>) => state.input,
          parameters: (state: Record<string, any>) => ({
            criteria: state.variables.modelSelectionCriteria,
            retrievedContext: state.variables.retrievedContext || [],
            userId: state.userId,
            conversationId: state.conversationId,
          }),
          onSuccess: ['analyzeMultiagent'],
          streaming: false,
        },

        {
          id: 'analyzeMultiagent',
          name: 'Analyze Multi-Agent Need',
          description: 'Determine if multiple agents are needed for this query',
          agentId: 'query-analyzer',
          capability: 'analyze_multiagent_need',
          input: (state: Record<string, any>) => state.input,
          parameters: (state: Record<string, any>) => ({
            query: state.input,
            taskComplexity: state.variables.taskComplexity,
            retrievedContext: state.variables.retrievedContext || [],
          }),
          onSuccess: ['routeQuery'],
          streaming: false,
        },

        {
          id: 'routeQuery',
          name: 'Route Query',
          description: 'Route the query to single or multi-agent processing',
          condition: (state: Record<string, any>) => {
            return state.variables.requiresMultiagent === true;
          },
          onSuccess: ['generateMultiResponse'],
          onFailure: ['generateResponse'],
          streaming: false,
        },

        {
          id: 'generateResponse',
          name: 'Generate Response',
          description:
            'Generate a response using the selected model and retrieved context',
          agentId: 'response-generator',
          capability: 'generate_response',
          input: (state: Record<string, any>) => state.input,
          parameters: (state: Record<string, any>) => ({
            selectedModel: state.variables.selectedModel,
            availableContext: state.variables.availableContext,
            contextAvailable: state.variables.contextAvailable,
            taskComplexity: state.variables.taskComplexity,
            streamingRequired: state.variables.streamingRequired,
            streamingHandler: state.variables.streamingHandler,
            modelSelectionCriteria: state.variables.modelSelectionCriteria,
            userId: state.userId,
            conversationId: state.conversationId,
          }),
          streaming: true,
        },

        {
          id: 'generateMultiResponse',
          name: 'Generate Multi-Agent Response',
          description: 'Generate responses from multiple specialized agents',
          onSuccess: ['creativityAgent', 'analyticAgent', 'factualAgent'],
          streaming: false,
        },

        {
          id: 'creativityAgent',
          name: 'Creative Analysis',
          description: 'Provide creative insights and ideas',
          agentId: 'creativity-agent',
          capability: 'generate_creative_insights',
          input: (state: Record<string, any>) => state.input,
          parameters: (state: Record<string, any>) => ({
            userId: state.userId,
            context: state.variables.availableContext,
            streamingAggregator: state.variables.streamingAggregator,
          }),
          onSuccess: ['aggregateResponses'],
          streaming: true,
          streamingRole: 'parallel',
        },

        {
          id: 'analyticAgent',
          name: 'Analytical Response',
          description: 'Provide analytical reasoning and evaluation',
          agentId: 'analytical-agent',
          capability: 'generate_analytical_response',
          input: (state: Record<string, any>) => state.input,
          parameters: (state: Record<string, any>) => ({
            userId: state.userId,
            context: state.variables.availableContext,
            streamingAggregator: state.variables.streamingAggregator,
          }),
          onSuccess: ['aggregateResponses'],
          streaming: true,
          streamingRole: 'leader',
        },

        {
          id: 'factualAgent',
          name: 'Factual Response',
          description: 'Provide factual information and references',
          agentId: 'factual-agent',
          capability: 'generate_factual_response',
          input: (state: Record<string, any>) => state.input,
          parameters: (state: Record<string, any>) => ({
            userId: state.userId,
            context: state.variables.availableContext,
            streamingAggregator: state.variables.streamingAggregator,
          }),
          onSuccess: ['aggregateResponses'],
          streaming: true,
          streamingRole: 'follower',
        },

        {
          id: 'aggregateResponses',
          name: 'Aggregate Responses',
          description: 'Combine and refine all agent responses',
          agentId: 'response-aggregator',
          capability: 'aggregate_responses',
          parameters: (state: Record<string, any>) => ({
            streamingRequired: state.variables.streamingRequired,
            streamingHandler: state.variables.streamingHandler,
            streamingAggregator: state.variables.streamingAggregator,
          }),
          streaming: true,
        },
      ],

      branches: [],

      // Add streaming configuration to the workflow
      streaming: {
        enabled: true,
        multiAgent: true,
        strategy: StreamAggregationStrategy.LEADER_FOLLOWER,
        showAgentNames: true,
        aggregateAsTable: false,
      },

      // Mark as multi-agent streaming enabled
      metadata: {
        multiAgentStreaming: true,
        complexQueryHandling: true,
        description:
          'Enhanced query workflow with multi-agent streaming support',
      },
    };
  }

  /**
   * Ensure all required agents are registered in the registry
   */
  private ensureAgentsRegistered(): void {
    // Register agents if they don't exist
    // Implementation depends on actual agent registry implementation
    // This method would register necessary agents for this workflow
    // such as query-analyzer, knowledge-retrieval, model-selector, etc.
  }
}
