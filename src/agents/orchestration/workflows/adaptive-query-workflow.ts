import { WorkflowDefinition } from '../workflow-definition.service.ts';
import { AgentRegistryService } from '../../services/agent-registry.service.ts';
import { ModelRouterService, ModelSelectionCriteria } from '../model-router.service.ts';
import { KnowledgeRetrievalAgent } from '../../specialized/knowledge-retrieval-agent.ts';
import { ConsoleLogger } from '../../../shared/logger/console-logger.ts';
import { RagRetrievalStrategy } from '../../../shared/services/rag-prompt-manager.service.ts';
import { BaseAgent } from '../../base/base-agent.ts';
import { AgentRequest, AgentResponse } from '../../interfaces/agent.interface.ts';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { v4 as uuid } from 'uuid';

/**
 * Query Analyzer Agent
 * Specializes in analyzing query complexity and requirements
 */
class QueryAnalyzerAgent extends BaseAgent {
  constructor() {
    super(
      'Query Analyzer',
      'Analyzes queries to determine complexity and requirements'
    );
    
    this.registerCapability({
      name: 'analyze_query_complexity',
      description: 'Analyze a query to determine its complexity and processing requirements',
      parameters: {
        query: 'The query to analyze',
        userId: 'The ID of the user making the query'
      }
    });
  }
  
  async execute(request: AgentRequest): Promise<AgentResponse> {
    const query = typeof request.input === 'string' ? request.input : '';
    
    // Simple complexity analysis - in a real system this would be more sophisticated
    const wordCount = query.split(/\s+/).length;
    const containsCodeRequest = /code|function|implement|program|script/i.test(query);
    const requiresCreativity = /creative|imagine|design|story|novel/i.test(query);
    const requiresFactualAnswer = /what is|how does|explain|when did|who is/i.test(query);
    
    // Determine task complexity
    let taskComplexity: 'simple' | 'medium' | 'complex' = 'medium';
    if (wordCount > 30 || containsCodeRequest) {
      taskComplexity = 'complex';
    } else if (wordCount < 10 && !containsCodeRequest && !requiresCreativity) {
      taskComplexity = 'simple';
    }
    
    // Determine if streaming is valuable for this query
    const streamingRequired = wordCount > 20 || containsCodeRequest || requiresCreativity;
    
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
        requiresKnowledgeRetrieval
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
          requiresSpecialCapabilities: specialCapabilities
        }
      }
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
      'Selects appropriate models based on query characteristics'
    );
    
    this.modelRouter = ModelRouterService.getInstance();
    
    this.registerCapability({
      name: 'select_model',
      description: 'Select the most appropriate model based on query criteria',
      parameters: {
        criteria: 'The selection criteria for the model',
        retrievedContext: 'Context items retrieved for the query',
        userId: 'The ID of the user making the query',
        conversationId: 'The conversation ID'
      }
    });
  }
  
  async execute(request: AgentRequest): Promise<AgentResponse> {
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
        contextSize
      );
    }
    
    return {
      output: JSON.stringify({ selectedModel: selectedModel.modelName }),
      artifacts: {
        selectedModel,
        availableContext,
        promptReady: true
      }
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
      'Generates responses using selected models and context'
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
        conversationId: 'The conversation ID'
      }
    });
  }
  
  async execute(request: AgentRequest): Promise<AgentResponse> {
    const params = request.parameters || {};
    const selectedModel = params.selectedModel;
    const availableContext = params.availableContext || [];
    const contextAvailable = params.contextAvailable === true;
    const taskComplexity = params.taskComplexity || 'medium';
    const streamingRequired = params.streamingRequired === true;
    const streamingHandler = params.streamingHandler;
    const modelCriteria = params.modelSelectionCriteria;
    
    if (!selectedModel && !modelCriteria) {
      throw new Error('Either selected model or model criteria must be provided');
    }
    
    // Prepare messages for the model
    const messages: BaseMessage[] = [
      new SystemMessage(
        `You are a helpful assistant that provides accurate and helpful responses.${
          contextAvailable ? 
          ' Use the provided context to answer the question accurately.' :
          ' If you do not know the answer, say so clearly.'
        }${
          taskComplexity === 'complex' ?
          ' Provide detailed and comprehensive responses for complex queries.' :
          ''
        }`
      )
    ];
    
    // Add context if available
    if (contextAvailable && availableContext.length > 0) {
      let contextStr = 'Here is some relevant information to help answer the query:\n\n';
      
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
    messages.push(new HumanMessage(typeof request.input === 'string' ? request.input : ''));
    
    try {
      // Process the request with the Model Router
      const response = await this.modelRouter.processRequest(
        messages,
        modelCriteria,
        streamingRequired ? streamingHandler : undefined
      );
      
      return {
        output: response,
        artifacts: {
          contextUsed: contextAvailable,
          modelUsed: selectedModel?.modelName || modelCriteria
        }
      };
    } catch (error) {
      this.logger.error('Response generation failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Return an error response without the 'error' property
      return {
        output: "I'm sorry, I wasn't able to generate a complete response due to an error."
      };
    }
  }
}

/**
 * AdaptiveQueryWorkflow
 * 
 * A workflow that demonstrates integration with the Model Router for adaptive query processing
 * This workflow:
 * 1. Analyzes the user query
 * 2. Retrieves relevant knowledge
 * 3. Dynamically selects an appropriate model based on the query characteristics
 * 4. Generates a response with streaming support
 */
export class AdaptiveQueryWorkflow {
  private registry: AgentRegistryService;
  private modelRouter: ModelRouterService;
  private logger: ConsoleLogger;
  private agentInstances: Map<string, BaseAgent> = new Map();
  
  constructor() {
    this.registry = AgentRegistryService.getInstance();
    this.modelRouter = ModelRouterService.getInstance();
    this.logger = new ConsoleLogger();
    
    // Register the specialized agents
    this.registerAgents();
  }
  
  /**
   * Register specialized agents needed for the workflow
   */
  private registerAgents(): void {
    // Create agent instances
    const queryAnalyzer = new QueryAnalyzerAgent();
    const modelSelector = new ModelSelectorAgent();
    const responseGenerator = new ResponseGeneratorAgent();
    
    // Store instances for cleanup later if needed
    this.agentInstances.set('query-analyzer', queryAnalyzer);
    this.agentInstances.set('model-selector', modelSelector);
    this.agentInstances.set('response-generator', responseGenerator);
    
    // Register with the registry
    this.registry.registerAgent(queryAnalyzer);
    this.registry.registerAgent(modelSelector);
    this.registry.registerAgent(responseGenerator);
  }
  
  /**
   * Create an instance of the workflow definition
   */
  public createWorkflowDefinition(): WorkflowDefinition {
    return {
      id: uuid(),
      name: 'adaptive-query-workflow',
      description: 'Process queries with adaptive model selection and knowledge retrieval',
      startAt: 'analyzeQuery',
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      
      steps: [
        {
          id: 'analyzeQuery',
          name: 'Analyze Query Complexity',
          description: 'Analyze the user query to determine its complexity and requirements',
          agentId: 'query-analyzer',
          capability: 'analyze_query_complexity',
          input: (state: Record<string, any>) => state.input,
          parameters: (state: Record<string, any>) => ({
            query: state.input,
            userId: state.userId
          }),
          onSuccess: ['retrieveKnowledge']
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
            conversationId: state.conversationId
          }),
          onSuccess: ['selectModel']
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
            conversationId: state.conversationId
          }),
          onSuccess: ['generateResponse']
        },
        
        {
          id: 'generateResponse',
          name: 'Generate Response',
          description: 'Generate a response using the selected model and retrieved context',
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
            conversationId: state.conversationId
          })
        }
      ],
      
      branches: []
    };
  }
} 