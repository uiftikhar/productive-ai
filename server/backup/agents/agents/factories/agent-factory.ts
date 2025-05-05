/**
 * @deprecated This module is deprecated and will be removed in a future version.
 * Use the new agentic meeting analysis system in /langgraph/agentic-meeting-analysis instead.
 * 
 * Agent Factory
 *
 * A factory for creating and registering agent instances.
 * This centralized factory simplifies agent creation with consistent configuration
 * and automatic registration with the AgentRegistryService.
 *
 * @deprecated This factory approach will be replaced by a more flexible graph-based system
 */

import { ChatOpenAI } from '@langchain/openai';
import {
  BaseAgentInterface,
  WorkflowCompatibleAgent,
  MetacognitiveAgent,
} from '../interfaces/base-agent.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { AgentRegistryService } from '../services/agent-registry.service';
import { KnowledgeRetrievalAgent } from '../specialized/knowledge-retrieval-agent';
import { DocumentRetrievalAgent } from '../specialized/retrieval-agent';
import { MeetingAnalysisAgent } from '../specialized/meeting-analysis-agent';
import { DecisionTrackingAgent } from '../specialized/decision-tracking-agent';
import {
  SupervisorAgent,
  SupervisorAgentConfig,
} from '../specialized/facilitator-supervisor-agent';
import { IEmbeddingService } from '../../shared/services/embedding.interface';
import { EmbeddingServiceFactory } from '../../shared/services/embedding.factory';
import { OpenAIConnector } from '../integrations/openai-connector';
import { PineconeConnector } from '../integrations/pinecone-connector';
import { AgentWorkflow } from '../../langgraph/core/workflows/agent-workflow';
import { BaseAgent } from '../base/base-agent';
import { MetacognitiveBaseAgent } from '../base/metacognitive-base-agent';
import { MetacognitiveAgentImplementation } from '../base/metacognitive-agent-implementation';
import { ReflectionConfig } from '../interfaces/metacognition.interface';

/**
 * Represents a member of an agent team
 * @deprecated Will be replaced by graph-based agent collaboration in fully agentic implementation
 */
export interface TeamMember {
  /**
   * The agent itself
   */
  agent: BaseAgentInterface;

  /**
   * The role this agent plays in the team
   */
  role: string;

  /**
   * Priority level for task assignment (higher means more likely to be assigned)
   * Scale: 1-10 where 10 is highest priority
   */
  priority: number;

  /**
   * Whether this member is currently active in the team
   */
  active: boolean;

  /**
   * Optional capabilities this member is restricted to
   */
  allowedCapabilities?: string[];

  /**
   * Optional metadata for this member
   */
  metadata?: Record<string, any>;
}

/**
 * Options for configuring an agent team
 * @deprecated Will be replaced by graph-based agent collaboration in fully agentic implementation
 */
export interface TeamOptions {
  /**
   * Optional team ID
   */
  id?: string;

  /**
   * Team name
   */
  name?: string;

  /**
   * Team description
   */
  description?: string;

  /**
   * Initial team members
   */
  initialMembers?: TeamMember[];

  /**
   * Whether the team should operate in parallel when possible
   */
  allowParallel?: boolean;

  /**
   * Maximum number of agents that can work in parallel
   */
  maxParallelAgents?: number;

  /**
   * Additional options
   */
  [key: string]: any;
}

/**
 * Agent Team class
 * @deprecated Will be replaced by graph-based agent collaboration in fully agentic implementation
 */
export class AgentTeam {
  /**
   * The unique identifier of this team
   */
  readonly id: string;

  /**
   * The name of this team
   */
  readonly name: string;

  /**
   * Description of the team's purpose
   */
  readonly description: string;

  /**
   * List of team members
   */
  private members: TeamMember[];

  constructor(options: {
    id?: string;
    name?: string;
    description?: string;
    agents: BaseAgentInterface[];
    [key: string]: any;
  }) {
    this.id = options.id || `team-${Date.now()}`;
    this.name = options.name || 'Agent Team';
    this.description = options.description || 'A team of collaborative agents';

    // Convert agents to team members with default roles
    this.members = options.agents.map((agent) => ({
      agent,
      role: agent.name,
      priority: 5,
      active: true,
    }));
  }

  /**
   * Get the list of members in this team
   */
  getMembers(): TeamMember[] {
    return [...this.members];
  }

  /**
   * Add a member to the team
   */
  addMember(member: TeamMember): AgentTeam {
    this.members.push(member);
    return this;
  }

  /**
   * Remove a member from the team
   */
  removeMember(agentId: string): AgentTeam {
    this.members = this.members.filter((m) => m.agent.id !== agentId);
    return this;
  }

  /**
   * Find members by role
   */
  findMembersByRole(role: string): TeamMember[] {
    return this.members.filter((m) => m.role === role);
  }

  /**
   * Get active members (available for tasks)
   */
  getActiveMembers(): TeamMember[] {
    return this.members.filter((m) => m.active);
  }
}

/**
 * Standard options for agent creation
 * @deprecated Will be replaced with more flexible configuration in graph-based system
 */
export interface AgentFactoryOptions {
  logger?: Logger;
  llm?: ChatOpenAI;
  id?: string;
  autoRegister?: boolean;
  registry?: AgentRegistryService;
  openAIConnector?: OpenAIConnector;
  pineconeConnector?: PineconeConnector;
  embeddingService?: IEmbeddingService;
  indexName?: string;
  namespace?: string;
  wrapWithWorkflow?: boolean;
  tracingEnabled?: boolean;
  reflectionConfig?: Partial<ReflectionConfig>;
  metacognitive?: boolean;
  name?: string;
  description?: string;
  defaultTeamMembers?: TeamMember[];
  priorityThreshold?: number;
  [key: string]: any; // Allow any additional options
}

/**
 * Factory for creating agents
 * @deprecated Will be replaced by a more flexible graph-based system
 */
export class AgentFactory {
  private registry: AgentRegistryService;
  private logger: Logger;
  private openAIConnector: OpenAIConnector;
  private pineconeConnector?: PineconeConnector;
  private embeddingService: IEmbeddingService;

  constructor(
    options: {
      registry?: AgentRegistryService;
      logger?: Logger;
      openAIConnector?: OpenAIConnector;
      pineconeConnector?: PineconeConnector;
      embeddingService?: IEmbeddingService;
    } = {},
  ) {
    this.registry = options.registry || AgentRegistryService.getInstance();
    this.logger = options.logger || new ConsoleLogger();

    this.openAIConnector =
      options.openAIConnector ||
      new OpenAIConnector({
        logger: this.logger,
      });

    this.pineconeConnector = options.pineconeConnector;

    this.embeddingService =
      options.embeddingService ||
      EmbeddingServiceFactory.getService({
        connector: this.openAIConnector,
        logger: this.logger,
      });
  }

  /**
   * Register an agent with the registry
   * @deprecated Will be replaced by graph node registration
   */
  registerAgent(agent: BaseAgentInterface): BaseAgentInterface {
    this.registry.registerAgent(agent);
    return agent;
  }

  /**
   * Get an agent by ID from the registry
   * @deprecated Will be replaced by graph node lookup
   */
  getAgent(id: string): BaseAgentInterface | undefined {
    return this.registry.getAgent(id);
  }

  /**
   * Create an agent workflow for any agent
   * @param agent The agent to wrap in a workflow
   * @param options Workflow options
   * @returns An AgentWorkflow instance
   * @deprecated Will be replaced by LangGraph workflow implementation
   */
  createAgentWorkflow<T extends BaseAgent>(
    agent: T,
    options: {
      tracingEnabled?: boolean;
      includeStateInLogs?: boolean;
    } = {},
  ): AgentWorkflow<T> {
    return new AgentWorkflow<T>(agent, options);
  }

  /**
   * Create a KnowledgeRetrievalAgent
   * @deprecated This method will be removed in favor of fully agentic implementations
   */
  createKnowledgeRetrievalAgent(
    options: AgentFactoryOptions = {},
  ): KnowledgeRetrievalAgent | AgentWorkflow<KnowledgeRetrievalAgent> {
    const agent = new KnowledgeRetrievalAgent({
      logger: options.logger || this.logger,
      llm: options.llm,
      openAIConnector: options.openAIConnector || this.openAIConnector,
      embeddingService: options.embeddingService || this.embeddingService,
      id: options.id,
      ...options,
    });

    if (options.autoRegister !== false) {
      // Use type assertion to register agent
      this.registerAgent(agent as unknown as BaseAgentInterface);
    }

    // Optionally wrap the agent in a workflow
    if (options.wrapWithWorkflow) {
      return this.createAgentWorkflow(agent, {
        tracingEnabled: options.tracingEnabled,
      });
    }

    return agent;
  }

  /**
   * Create a DocumentRetrievalAgent
   * @deprecated This method will be removed in favor of fully agentic implementations
   */
  createDocumentRetrievalAgent(
    options: AgentFactoryOptions = {},
  ): DocumentRetrievalAgent | AgentWorkflow<DocumentRetrievalAgent> {
    const agent = new DocumentRetrievalAgent({
      logger: options.logger || this.logger,
      llm: options.llm,
      openAIConnector: options.openAIConnector || this.openAIConnector,
      embeddingService: options.embeddingService || this.embeddingService,
      id: options.id,
      ...options,
    });

    if (options.autoRegister !== false) {
      this.registerAgent(agent as unknown as BaseAgentInterface);
    }

    // Optionally wrap the agent in a workflow
    if (options.wrapWithWorkflow) {
      return this.createAgentWorkflow(agent, {
        tracingEnabled: options.tracingEnabled,
      });
    }

    return agent;
  }

  /**
   * Create a MeetingAnalysisAgent
   * @deprecated This method will be removed in favor of fully agentic implementations
   */
  createMeetingAnalysisAgent(
    options: AgentFactoryOptions = {},
  ): MeetingAnalysisAgent | AgentWorkflow<MeetingAnalysisAgent> {
    // Create with the correct constructor signature
    const agent = new MeetingAnalysisAgent(
      options.name || 'Meeting Analysis Agent',
      options.description ||
        'Analyzes meeting transcripts to extract key information',
      {
        logger: options.logger || this.logger,
        llm: options.llm,
        openAIConnector: options.openAIConnector || this.openAIConnector,
        embeddingService: options.embeddingService || this.embeddingService,
        id: options.id,
        ...options,
      },
    );

    if (options.autoRegister !== false) {
      this.registerAgent(agent as unknown as BaseAgentInterface);
    }

    // Optionally wrap the agent in a workflow
    if (options.wrapWithWorkflow) {
      return this.createAgentWorkflow(agent, {
        tracingEnabled: options.tracingEnabled,
      });
    }

    return agent;
  }

  /**
   * Create a DecisionTrackingAgent
   * @deprecated This method will be removed in favor of fully agentic implementations
   */
  createDecisionTrackingAgent(
    options: AgentFactoryOptions = {},
  ): DecisionTrackingAgent | AgentWorkflow<DecisionTrackingAgent> {
    const agent = new DecisionTrackingAgent({
      logger: options.logger || this.logger,
      llm: options.llm,
      openAIConnector: options.openAIConnector || this.openAIConnector,
      embeddingService: options.embeddingService || this.embeddingService,
      id: options.id,
      ...options,
    });

    if (options.autoRegister !== false) {
      this.registerAgent(agent as unknown as BaseAgentInterface);
    }

    // Optionally wrap the agent in a workflow
    if (options.wrapWithWorkflow) {
      return this.createAgentWorkflow(agent, {
        tracingEnabled: options.tracingEnabled,
      });
    }

    return agent;
  }

  /**
   * Create a SupervisorAgent
   * @deprecated This method will be removed in favor of fully agentic implementations
   */
  createSupervisorAgent(
    options: AgentFactoryOptions = {},
  ): SupervisorAgent | AgentWorkflow<SupervisorAgent> {
    const agent = new SupervisorAgent({
      logger: options.logger || this.logger,
      llm: options.llm,
      openAIConnector: options.openAIConnector || this.openAIConnector,
      embeddingService: options.embeddingService || this.embeddingService,
      id: options.id,
      ...options,
    });

    if (options.autoRegister !== false) {
      this.registerAgent(agent as unknown as BaseAgentInterface);
    }

    // Optionally wrap the agent in a workflow
    if (options.wrapWithWorkflow) {
      return this.createAgentWorkflow(agent, {
        tracingEnabled: options.tracingEnabled,
      });
    }

    return agent;
  }

  /**
   * Create a metacognitive agent implementation
   */
  createMetacognitiveAgent(
    options: AgentFactoryOptions = {},
  ):
    | MetacognitiveAgentImplementation
    | AgentWorkflow<MetacognitiveAgentImplementation> {
    const agent = new MetacognitiveAgentImplementation(
      options.name || 'Metacognitive Agent',
      options.description ||
        'An agent with self-reflection and metacognitive capabilities',
      {
        logger: options.logger || this.logger,
        llm: options.llm,
        id: options.id,
        // Add reflectionConfig in a type-safe way
        ...(options.reflectionConfig
          ? { reflectionConfig: options.reflectionConfig }
          : {}),
      },
    );

    if (options.autoRegister !== false) {
      this.registerAgent(agent);
    }

    // Optionally wrap the agent in a workflow
    if (options.wrapWithWorkflow) {
      return this.createAgentWorkflow(agent, {
        tracingEnabled: options.tracingEnabled,
      });
    }

    return agent;
  }

  /**
   * Create a metacognitive version of an existing agent type
   * This method takes an agent creation function and enhances it with metacognitive capabilities
   */
  createMetacognitiveVersion<T extends BaseAgent>(
    createAgentFn: (options: AgentFactoryOptions) => T,
    options: AgentFactoryOptions = {},
  ):
    | MetacognitiveAgentImplementation
    | AgentWorkflow<MetacognitiveAgentImplementation> {
    // First create the standard agent
    const baseAgent = createAgentFn({
      ...options,
      autoRegister: false, // Don't register the base agent
    });

    // Then create a metacognitive agent with the same core capabilities
    const metacognitiveAgent = new MetacognitiveAgentImplementation(
      options.name || `Metacognitive ${baseAgent.name}`,
      options.description ||
        `${baseAgent.description} with self-reflection capabilities`,
      {
        logger: options.logger || this.logger,
        llm: options.llm,
        id: options.id || `metacognitive-${baseAgent.id}`,
        // Add reflectionConfig in a type-safe way
        ...(options.reflectionConfig
          ? { reflectionConfig: options.reflectionConfig }
          : {}),
      },
    );

    // Copy capabilities from the base agent
    // Use a workaround to transfer capabilities
    baseAgent.getCapabilities().forEach((capability) => {
      // We cast the agent to any to avoid protected method access issues
      // This is a deliberate workaround for the factory pattern
      (metacognitiveAgent as any).registerCapability(capability);
    });

    if (options.autoRegister !== false) {
      this.registerAgent(metacognitiveAgent);
    }

    // Optionally wrap the agent in a workflow
    if (options.wrapWithWorkflow) {
      return this.createAgentWorkflow(metacognitiveAgent, {
        tracingEnabled: options.tracingEnabled,
      });
    }

    return metacognitiveAgent;
  }

  /**
   * Create a metacognitive meeting analysis agent
   * @deprecated This method will be removed in favor of fully agentic implementations
   */
  createMetacognitiveMeetingAnalysisAgent(
    options: AgentFactoryOptions = {},
  ):
    | MetacognitiveAgentImplementation
    | AgentWorkflow<MetacognitiveAgentImplementation> {
    return this.createMetacognitiveVersion(
      (opts) => this.createMeetingAnalysisAgent(opts) as MeetingAnalysisAgent,
      {
        name: options.name || 'Metacognitive Meeting Analysis Agent',
        description:
          options.description ||
          'Analyzes meeting transcripts with self-reflection capabilities',
        ...options,
      },
    );
  }

  /**
   * Create and initialize all standard agents
   * @deprecated This method will be replaced with a more flexible agentic approach
   */
  async createStandardAgents(
    options: AgentFactoryOptions = {},
  ): Promise<BaseAgentInterface[]> {
    const agents: BaseAgentInterface[] = [];

    if (options.metacognitive) {
      // Create metacognitive versions of standard agents
      const metacognitiveKnowledgeAgent = this.createMetacognitiveVersion(
        (opts: AgentFactoryOptions) =>
          this.createKnowledgeRetrievalAgent(opts) as BaseAgent,
        {
          ...options,
          id: options.id ? `metacog-knowledge-${options.id}` : undefined,
        },
      );

      const metacognitiveMeetingAgent = this.createMetacognitiveVersion(
        (opts: AgentFactoryOptions) =>
          this.createMeetingAnalysisAgent(opts) as BaseAgent,
        {
          ...options,
          id: options.id ? `metacog-meeting-${options.id}` : undefined,
        },
      );

      const generalMetacognitiveAgent = this.createMetacognitiveAgent({
        ...options,
        id: options.id ? `metacog-general-${options.id}` : undefined,
      });

      agents.push(metacognitiveKnowledgeAgent as unknown as BaseAgentInterface);
      agents.push(metacognitiveMeetingAgent as unknown as BaseAgentInterface);
      agents.push(generalMetacognitiveAgent as unknown as BaseAgentInterface);
    } else {
      // Original implementation
      const knowledgeAgent = this.createKnowledgeRetrievalAgent(options);
      agents.push(knowledgeAgent as unknown as BaseAgentInterface);

      // Create meeting analysis agent
      const meetingAgent = this.createMeetingAnalysisAgent(options);
      agents.push(meetingAgent as unknown as BaseAgentInterface);
    }

    // Create supervisor agent in all cases
    // Convert agents to a TeamMember array first to avoid type issues
    const teamMembers = agents.map((agent) => ({
      agent,
      role: agent.name,
      priority: 5,
      active: true,
    }));

    const supervisorAgent = this.createSupervisorAgent({
      ...options,
      defaultTeamMembers: teamMembers,
    });

    agents.push(supervisorAgent as unknown as BaseAgentInterface);

    return agents;
  }

  /**
   * Get a knowledge retrieval agent by ID
   * @deprecated This method will be removed in favor of fully agentic implementations
   */
  getKnowledgeRetrievalAgent(
    id: string,
  ):
    | KnowledgeRetrievalAgent
    | AgentWorkflow<KnowledgeRetrievalAgent>
    | undefined {
    const agent = this.getAgent(id);
    if (!agent) return undefined;

    return agent as unknown as
      | KnowledgeRetrievalAgent
      | AgentWorkflow<KnowledgeRetrievalAgent>;
  }

  /**
   * Get a meeting analysis agent by ID
   * @deprecated This method will be removed in favor of fully agentic implementations
   */
  getMeetingAnalysisAgent(
    id: string,
  ): MeetingAnalysisAgent | AgentWorkflow<MeetingAnalysisAgent> | undefined {
    const agent = this.getAgent(id);
    if (!agent) return undefined;

    return agent as unknown as
      | MeetingAnalysisAgent
      | AgentWorkflow<MeetingAnalysisAgent>;
  }

  /**
   * Get a supervisor agent by ID
   * @deprecated This method will be removed in favor of fully agentic implementations
   */
  getSupervisorAgent(
    id: string,
  ): SupervisorAgent | AgentWorkflow<SupervisorAgent> | undefined {
    const agent = this.getAgent(id);
    if (!agent) return undefined;

    return agent as unknown as SupervisorAgent | AgentWorkflow<SupervisorAgent>;
  }

  /**
   * Create a team of agents
   * @deprecated Will be replaced by graph-based agent collaboration in fully agentic implementation
   */
  createTeam(
    agents: BaseAgentInterface[],
    options: TeamOptions = {},
  ): AgentTeam {
    const team = new AgentTeam({
      agents,
      ...options,
    });

    return team;
  }
}

/**
 * Get the default agent factory instance
 * @deprecated Will be replaced by graph-based agent construction
 */
export function getDefaultAgentFactory(
  options: {
    logger?: Logger;
    registry?: AgentRegistryService;
  } = {},
): AgentFactory {
  return new AgentFactory({
    logger: options.logger,
    registry: options.registry,
  });
}
