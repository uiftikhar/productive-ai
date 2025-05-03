/**
 * Adaptation Manager Service for the Agentic Meeting Analysis System
 *
 * This service implements adaptation decision-making and execution:
 * - Handles content-based adaptation triggers
 * - Executes performance-based adaptations
 * - Manages specialist recruitment for unexpected topics
 * - Reallocates analytical focus
 * - Switches methodology based on content
 */
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { AgentExpertise } from '../interfaces/agent.interface';
import { StateManager } from '../state/state.manager';
import {
  AdaptationTriggerService,
  AdaptationTrigger,
  AdaptationTriggerType,
} from './adaptation-trigger.service';
import {
  TeamFormationService,
  TeamMember,
} from '../team-formation/team-formation.service';

/**
 * Configuration options for AdaptationManagerService
 */
export interface AdaptationManagerConfig {
  logger?: Logger;
  stateManager: StateManager;
  triggerService: AdaptationTriggerService;
  teamFormationService: TeamFormationService;
  adaptationLimit?: number;
}

/**
 * Adaptation action types
 */
export enum AdaptationActionType {
  RECRUIT_SPECIALIST = 'recruit_specialist',
  REPLACE_AGENT = 'replace_agent',
  REALLOCATE_FOCUS = 'reallocate_focus',
  SWITCH_METHODOLOGY = 'switch_methodology',
  ADJUST_TEAM_COMPOSITION = 'adjust_team_composition',
}

/**
 * Adaptation action record
 */
export interface AdaptationAction {
  id: string;
  meetingId: string;
  type: AdaptationActionType;
  triggerId: string;
  timestamp: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  details: Record<string, any>;
  result?: Record<string, any>;
}

/**
 * Implementation of adaptation manager service
 */
export class AdaptationManagerService extends EventEmitter {
  private logger: Logger;
  private stateManager: StateManager;
  private triggerService: AdaptationTriggerService;
  private teamFormationService: TeamFormationService;
  private adaptationLimit: number;

  // Store for adaptation actions
  private adaptationActions: Map<string, AdaptationAction> = new Map();
  private meetingAdaptationCounts: Map<string, number> = new Map();

  /**
   * Create a new adaptation manager service
   */
  constructor(config: AdaptationManagerConfig) {
    super();

    this.logger = config.logger || new ConsoleLogger();
    this.stateManager = config.stateManager;
    this.triggerService = config.triggerService;
    this.teamFormationService = config.teamFormationService;
    this.adaptationLimit = config.adaptationLimit || 5; // Default limit of 5 adaptations per meeting

    this.logger.info('Initialized AdaptationManagerService');
  }

  /**
   * Initialize the adaptation manager service
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing adaptation manager service');

      // Set up event listeners for triggers
      this.triggerService.on(
        'adaptation_trigger',
        async (trigger: AdaptationTrigger) => {
          await this.handleAdaptationTrigger(trigger);
        },
      );

      this.logger.info('Adaptation manager service initialized successfully');
    } catch (error) {
      this.logger.error(
        `Error initializing adaptation manager service: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Handle an adaptation trigger
   */
  async handleAdaptationTrigger(trigger: AdaptationTrigger): Promise<void> {
    this.logger.info(
      `Handling adaptation trigger ${trigger.id} of type ${trigger.type}`,
    );

    try {
      // Check adaptation limit for the meeting
      const adaptationCount =
        this.meetingAdaptationCounts.get(trigger.meetingId) || 0;

      if (adaptationCount >= this.adaptationLimit) {
        this.logger.warn(
          `Adaptation limit reached for meeting ${trigger.meetingId}, ignoring trigger ${trigger.id}`,
        );
        return;
      }

      // Create an adaptation action based on the trigger type
      let action: AdaptationAction | null = null;

      switch (trigger.type) {
        case AdaptationTriggerType.UNEXPECTED_TOPIC:
          action = await this.createSpecialistRecruitmentAction(trigger);
          break;

        case AdaptationTriggerType.PERFORMANCE_ISSUE:
          action = await this.createAgentReplacementAction(trigger);
          break;

        case AdaptationTriggerType.FOCUS_SHIFT:
          action = await this.createFocusReallocationAction(trigger);
          break;

        case AdaptationTriggerType.METHODOLOGY_CHANGE:
          action = await this.createMethodologySwitchAction(trigger);
          break;

        default:
          this.logger.warn(`Unhandled trigger type ${trigger.type}`);
          return;
      }

      if (action) {
        // Store the action
        this.adaptationActions.set(action.id, action);

        // Increment adaptation count
        this.meetingAdaptationCounts.set(
          trigger.meetingId,
          (this.meetingAdaptationCounts.get(trigger.meetingId) || 0) + 1,
        );

        // Store in state manager
        await this.stateManager.setState(
          `meeting:${trigger.meetingId}:adaptation:${action.id}`,
          action,
        );

        // Execute the adaptation action
        await this.executeAdaptationAction(action);

        // Acknowledge the trigger
        await this.triggerService.acknowledgeTrigger(trigger.id);
      }
    } catch (error) {
      this.logger.error(
        `Error handling adaptation trigger: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Execute an adaptation action
   */
  async executeAdaptationAction(action: AdaptationAction): Promise<void> {
    this.logger.info(
      `Executing adaptation action ${action.id} of type ${action.type}`,
    );

    try {
      // Update action status
      action.status = 'in_progress';
      await this.updateAdaptationAction(action);

      // Execute based on action type
      switch (action.type) {
        case AdaptationActionType.RECRUIT_SPECIALIST:
          await this.executeSpecialistRecruitment(action);
          break;

        case AdaptationActionType.REPLACE_AGENT:
          await this.executeAgentReplacement(action);
          break;

        case AdaptationActionType.REALLOCATE_FOCUS:
          await this.executeFocusReallocation(action);
          break;

        case AdaptationActionType.SWITCH_METHODOLOGY:
          await this.executeMethodologySwitch(action);
          break;

        default:
          throw new Error(`Unhandled action type ${action.type}`);
      }

      // Mark action as completed
      action.status = 'completed';
      await this.updateAdaptationAction(action);

      // Emit action completed event
      this.emit('adaptation_completed', {
        actionId: action.id,
        meetingId: action.meetingId,
        type: action.type,
        result: action.result,
      });
    } catch (error) {
      this.logger.error(
        `Error executing adaptation action: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Mark action as failed
      action.status = 'failed';
      action.result = {
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };
      await this.updateAdaptationAction(action);
    }
  }

  /**
   * Get all adaptation actions for a meeting
   */
  async getAdaptationActions(meetingId: string): Promise<AdaptationAction[]> {
    return Array.from(this.adaptationActions.values()).filter(
      (action) => action.meetingId === meetingId,
    );
  }

  /**
   * Create a specialist recruitment action
   */
  private async createSpecialistRecruitmentAction(
    trigger: AdaptationTrigger,
  ): Promise<AdaptationAction> {
    const topic = trigger.data.topic;

    // Determine appropriate expertise based on topic
    const requiredExpertise = this.mapTopicToExpertise(topic);

    return {
      id: `action-${uuidv4()}`,
      meetingId: trigger.meetingId,
      type: AdaptationActionType.RECRUIT_SPECIALIST,
      triggerId: trigger.id,
      timestamp: Date.now(),
      status: 'pending',
      details: {
        topic,
        requiredExpertise,
        confidence: trigger.confidence,
        keywords: trigger.data.keywords || [],
      },
    };
  }

  /**
   * Create an agent replacement action
   */
  private async createAgentReplacementAction(
    trigger: AdaptationTrigger,
  ): Promise<AdaptationAction> {
    const agentId = trigger.data.agentId;

    // Get agent details from state
    const agentState = await this.stateManager.getState(`agent:${agentId}`);
    const expertise = agentState?.expertise || [AgentExpertise.COORDINATION];

    return {
      id: `action-${uuidv4()}`,
      meetingId: trigger.meetingId,
      type: AdaptationActionType.REPLACE_AGENT,
      triggerId: trigger.id,
      timestamp: Date.now(),
      status: 'pending',
      details: {
        agentId,
        expertise,
        performanceIssue: {
          metric: trigger.data.metric,
          actualValue: trigger.data.actualValue,
          expectedValue: trigger.data.expectedValue,
          impact: trigger.data.impact,
        },
      },
    };
  }

  /**
   * Create a focus reallocation action
   */
  private async createFocusReallocationAction(
    trigger: AdaptationTrigger,
  ): Promise<AdaptationAction> {
    return {
      id: `action-${uuidv4()}`,
      meetingId: trigger.meetingId,
      type: AdaptationActionType.REALLOCATE_FOCUS,
      triggerId: trigger.id,
      timestamp: Date.now(),
      status: 'pending',
      details: {
        previousFocus: trigger.data.previousFocus,
        newFocus: trigger.data.newFocus,
        keywords: trigger.data.keywords || [],
      },
    };
  }

  /**
   * Create a methodology switch action
   */
  private async createMethodologySwitchAction(
    trigger: AdaptationTrigger,
  ): Promise<AdaptationAction> {
    return {
      id: `action-${uuidv4()}`,
      meetingId: trigger.meetingId,
      type: AdaptationActionType.SWITCH_METHODOLOGY,
      triggerId: trigger.id,
      timestamp: Date.now(),
      status: 'pending',
      details: {
        methodologyChange: trigger.data.methodologyChange,
        technicalTerms: trigger.data.technicalTerms,
        businessTerms: trigger.data.businessTerms,
      },
    };
  }

  /**
   * Execute specialist recruitment
   */
  private async executeSpecialistRecruitment(
    action: AdaptationAction,
  ): Promise<void> {
    this.logger.info(`Recruiting specialist for topic ${action.details.topic}`);

    // Get current team composition
    const teamComposition = await this.stateManager.getState(
      `meeting:${action.meetingId}:team`,
    );

    if (!teamComposition) {
      throw new Error(
        `Team composition not found for meeting ${action.meetingId}`,
      );
    }

    // Check if expertise is already covered
    const isExpertiseCovered = teamComposition.members.some((m: { expertise: string | any[]; }) =>
      m.expertise.includes(action.details.requiredExpertise),
    );

    if (isExpertiseCovered) {
      this.logger.info(
        `Expertise ${action.details.requiredExpertise} already covered, reassigning focus`,
      );

      // Instead of recruiting, reassign focus
      action.result = {
        adaptationType: 'focus_reassignment',
        expertise: action.details.requiredExpertise,
        topic: action.details.topic,
        timestamp: Date.now(),
      };

      // Update expertise priorities
      if (
        !teamComposition.requiredExpertise[action.details.requiredExpertise]
      ) {
        teamComposition.requiredExpertise[action.details.requiredExpertise] =
          0.7;
        await this.stateManager.setState(
          `meeting:${action.meetingId}:team`,
          teamComposition,
        );
      }

      return;
    }

    // Get available agents
    const availableAgents = await this.getAvailableAgentsWithExpertise(
      action.details.requiredExpertise,
    );

    if (availableAgents.length === 0) {
      throw new Error(
        `No available agents with expertise ${action.details.requiredExpertise}`,
      );
    }

    // Add new team member
    const newMembers = await this.teamFormationService.addTeamMembers(
      action.meetingId,
      teamComposition.id,
      [action.details.requiredExpertise],
      availableAgents,
    );

    if (newMembers.length === 0) {
      throw new Error('Failed to add new team members');
    }

    // Store result
    action.result = {
      adaptationType: 'specialist_recruitment',
      addedMembers: newMembers.map((m) => ({
        id: m.id,
        expertise: m.expertise,
        primaryRole: m.primaryRole,
      })),
      timestamp: Date.now(),
    };
  }

  /**
   * Execute agent replacement
   */
  private async executeAgentReplacement(
    action: AdaptationAction,
  ): Promise<void> {
    this.logger.info(
      `Replacing agent ${action.details.agentId} due to performance issues`,
    );

    // Get current team composition
    const teamComposition = await this.stateManager.getState(
      `meeting:${action.meetingId}:team`,
    );

    if (!teamComposition) {
      throw new Error(
        `Team composition not found for meeting ${action.meetingId}`,
      );
    }

    // Find the agent in the team
    const agentIndex = teamComposition.members.findIndex(
      (m: { id: any; }) => m.id === action.details.agentId,
    );

    if (agentIndex === -1) {
      throw new Error(`Agent ${action.details.agentId} not found in team`);
    }

    const agent = teamComposition.members[agentIndex];

    // Get available agents with similar expertise
    const availableAgents = await this.getAvailableAgentsWithExpertise(
      agent.primaryRole,
    );

    if (availableAgents.length === 0) {
      throw new Error(
        `No available agents with expertise ${agent.primaryRole}`,
      );
    }

    // Select replacement agent
    const replacementId = availableAgents[0];

    // Get replacement agent capabilities
    const replacementState = await this.stateManager.getState(
      `agent:${replacementId}`,
    );
    const replacementExpertise = replacementState?.expertise || [
      agent.primaryRole,
    ];

    // Replace the agent in the team
    const replacementMember: TeamMember = {
      id: replacementId,
      expertise: replacementExpertise,
      primaryRole: agent.primaryRole,
      confidence: 0.8, // Reset confidence
      assignments: [...agent.assignments], // Transfer assignments
    };

    teamComposition.members[agentIndex] = replacementMember;
    teamComposition.updated = Date.now();

    // Update team in state
    await this.stateManager.setState(
      `meeting:${action.meetingId}:team`,
      teamComposition,
    );

    // Store result
    action.result = {
      adaptationType: 'agent_replacement',
      replacedAgent: action.details.agentId,
      replacementAgent: replacementId,
      expertise: agent.primaryRole,
      timestamp: Date.now(),
    };
  }

  /**
   * Execute focus reallocation
   */
  private async executeFocusReallocation(
    action: AdaptationAction,
  ): Promise<void> {
    this.logger.info(
      `Reallocating focus from ${action.details.previousFocus} to ${action.details.newFocus}`,
    );

    // Get current team composition
    const teamComposition = await this.stateManager.getState(
      `meeting:${action.meetingId}:team`,
    );

    if (!teamComposition) {
      throw new Error(
        `Team composition not found for meeting ${action.meetingId}`,
      );
    }

    // Determine expertise needed for new focus
    const requiredExpertise = this.mapTopicToExpertise(action.details.newFocus);

    // Update required expertise priorities
    if (!teamComposition.requiredExpertise[requiredExpertise]) {
      teamComposition.requiredExpertise[requiredExpertise] = 0.8;
    } else {
      teamComposition.requiredExpertise[requiredExpertise] += 0.1;
    }

    // Cap at 1.0
    teamComposition.requiredExpertise[requiredExpertise] = Math.min(
      1.0,
      teamComposition.requiredExpertise[requiredExpertise],
    );

    // Decrease priority of previous focus expertise
    const previousExpertise = this.mapTopicToExpertise(
      action.details.previousFocus,
    );

    if (teamComposition.requiredExpertise[previousExpertise]) {
      teamComposition.requiredExpertise[previousExpertise] -= 0.1;

      // Ensure it doesn't go below 0.5
      teamComposition.requiredExpertise[previousExpertise] = Math.max(
        0.5,
        teamComposition.requiredExpertise[previousExpertise],
      );
    }

    // Update team in state
    teamComposition.updated = Date.now();
    await this.stateManager.setState(
      `meeting:${action.meetingId}:team`,
      teamComposition,
    );

    // Reassign focus directive
    await this.stateManager.setState(`meeting:${action.meetingId}:focus`, {
      currentFocus: action.details.newFocus,
      previousFocus: action.details.previousFocus,
      keywords: action.details.keywords,
      priorityExpertise: requiredExpertise,
      timestamp: Date.now(),
    });

    // Store result
    action.result = {
      adaptationType: 'focus_reallocation',
      newFocus: action.details.newFocus,
      previousFocus: action.details.previousFocus,
      priorityExpertise: requiredExpertise,
      timestamp: Date.now(),
    };
  }

  /**
   * Execute methodology switch
   */
  private async executeMethodologySwitch(
    action: AdaptationAction,
  ): Promise<void> {
    this.logger.info(
      `Switching methodology to ${action.details.methodologyChange}`,
    );

    // Get current methodology setting
    const currentMethodology = (await this.stateManager.getState(
      `meeting:${action.meetingId}:methodology`,
    )) || {
      type: 'balanced', // Default methodology
      emphasis: [],
    };

    // Determine new methodology
    let newMethodology;

    if (action.details.methodologyChange === 'technical_focus') {
      newMethodology = {
        type: 'technical',
        emphasis: [
          AgentExpertise.TOPIC_ANALYSIS,
          AgentExpertise.DECISION_TRACKING,
        ],
        technicalTerms: action.details.technicalTerms,
        businessTerms: action.details.businessTerms,
      };
    } else if (action.details.methodologyChange === 'business_focus') {
      newMethodology = {
        type: 'business',
        emphasis: [
          AgentExpertise.ACTION_ITEM_EXTRACTION,
          AgentExpertise.PARTICIPANT_DYNAMICS,
        ],
        technicalTerms: action.details.technicalTerms,
        businessTerms: action.details.businessTerms,
      };
    } else {
      throw new Error(
        `Unknown methodology change: ${action.details.methodologyChange}`,
      );
    }

    // Update methodology in state
    await this.stateManager.setState(
      `meeting:${action.meetingId}:methodology`,
      {
        ...newMethodology,
        previous: currentMethodology.type,
        timestamp: Date.now(),
      },
    );

    // Get current team composition
    const teamComposition = await this.stateManager.getState(
      `meeting:${action.meetingId}:team`,
    );

    if (teamComposition) {
      // Update expertise priorities based on methodology
      for (const expertise of newMethodology.emphasis) {
        if (!teamComposition.requiredExpertise[expertise]) {
          teamComposition.requiredExpertise[expertise] = 0.8;
        } else {
          teamComposition.requiredExpertise[expertise] += 0.1;
        }

        // Cap at 1.0
        teamComposition.requiredExpertise[expertise] = Math.min(
          1.0,
          teamComposition.requiredExpertise[expertise],
        );
      }

      // Update team in state
      teamComposition.updated = Date.now();
      await this.stateManager.setState(
        `meeting:${action.meetingId}:team`,
        teamComposition,
      );
    }

    // Store result
    action.result = {
      adaptationType: 'methodology_switch',
      previousMethodology: currentMethodology.type,
      newMethodology: newMethodology.type,
      emphasis: newMethodology.emphasis,
      timestamp: Date.now(),
    };
  }

  /**
   * Update an adaptation action
   */
  private async updateAdaptationAction(
    action: AdaptationAction,
  ): Promise<void> {
    // Update in memory
    this.adaptationActions.set(action.id, action);

    // Update in state
    await this.stateManager.setState(
      `meeting:${action.meetingId}:adaptation:${action.id}`,
      action,
    );
  }

  /**
   * Map a topic to an appropriate expertise
   */
  private mapTopicToExpertise(topic: string): AgentExpertise {
    // Simple mapping logic based on topic keywords
    const normalizedTopic = topic.toLowerCase();

    // Topic analysis expertise
    if (
      normalizedTopic.includes('topic') ||
      normalizedTopic.includes('discussion') ||
      normalizedTopic.includes('subject')
    ) {
      return AgentExpertise.TOPIC_ANALYSIS;
    }

    // Action item expertise
    if (
      normalizedTopic.includes('action') ||
      normalizedTopic.includes('task') ||
      normalizedTopic.includes('todo')
    ) {
      return AgentExpertise.ACTION_ITEM_EXTRACTION;
    }

    // Decision tracking expertise
    if (
      normalizedTopic.includes('decision') ||
      normalizedTopic.includes('choice') ||
      normalizedTopic.includes('agreement')
    ) {
      return AgentExpertise.DECISION_TRACKING;
    }

    // Sentiment analysis expertise
    if (
      normalizedTopic.includes('sentiment') ||
      normalizedTopic.includes('emotion') ||
      normalizedTopic.includes('feeling')
    ) {
      return AgentExpertise.SENTIMENT_ANALYSIS;
    }

    // Participant dynamics expertise
    if (
      normalizedTopic.includes('participant') ||
      normalizedTopic.includes('interaction') ||
      normalizedTopic.includes('dynamic')
    ) {
      return AgentExpertise.PARTICIPANT_DYNAMICS;
    }

    // Context integration expertise
    if (
      normalizedTopic.includes('context') ||
      normalizedTopic.includes('history') ||
      normalizedTopic.includes('background')
    ) {
      return AgentExpertise.CONTEXT_INTEGRATION;
    }

    // Default to summary generation
    return AgentExpertise.SUMMARY_GENERATION;
  }

  /**
   * Get available agents with specific expertise
   */
  private async getAvailableAgentsWithExpertise(
    expertise: AgentExpertise,
  ): Promise<string[]> {
    // In a real implementation, this would query an agent registry or pool
    // For this demo, return simulated agent IDs

    // Generate some simulated agent IDs based on expertise
    const simulatedAgents = [];
    for (let i = 1; i <= 3; i++) {
      simulatedAgents.push(`agent-${expertise}-${i}`);
    }

    return simulatedAgents;
  }
}
