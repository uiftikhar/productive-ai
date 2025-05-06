/**
 * Agentic Meeting Analysis System
 *
 * A goal-oriented, collaborative agent system for analyzing meeting transcripts
 */

// Import services
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { BaseMeetingAnalysisAgent } from './agents/base-meeting-analysis-agent';
import { SharedMemoryService } from './memory/shared-memory.service';
import { StateRepositoryService } from './state/state-repository.service';
import { CommunicationService } from './communication/communication.service';
import { ApiCompatibilityService } from './api-compatibility/api-compatibility.service';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { AnalysisCoordinatorAgent } from './agents/coordinator/analysis-coordinator-agent';
import { StateManager } from './state/state.manager';
import {
  CollaborativeProtocolService,
  QualityControlService,
  ConflictResolutionService,
} from './communication';
import { AnalysisPhase } from './communication/collaborative-protocol.service';
import { ConfidenceLevel } from './interfaces';
import { AnalysisGoalType } from './interfaces';
import { MessageType } from './interfaces/agent.interface';

// Phase 5: Advanced Functionality imports
import {
  SemanticChunkingService,
  TeamFormationService,
} from './team-formation';
import {
  AdaptationTriggerService,
  AdaptationManagerService,
} from './adaptation';

// Export all interfaces
export * from './interfaces';

// Export core services
export { BaseMeetingAnalysisAgent } from './agents/base-meeting-analysis-agent';
export { SharedMemoryService } from './memory/shared-memory.service';
export { StateRepositoryService } from './state/state-repository.service';
export { CommunicationService } from './communication/communication.service';
export { ApiCompatibilityService } from './api-compatibility/api-compatibility.service';

// Export Phase 5 services
export {
  SemanticChunkingService,
  TeamFormationService,
} from './team-formation';
export {
  AdaptationTriggerService,
  AdaptationManagerService,
} from './adaptation';

// Version information
export const VERSION = '1.0.0';
export const MILESTONE = 'Milestone 5: Meeting Analysis Reimplementation';

/**
 * Configuration options for Agentic Meeting Analysis System
 */
export interface AgenticMeetingAnalysisConfig {
  logger?: Logger;
  useCollaborativeFramework?: boolean;
  enableHumanFeedback?: boolean;
  enableAdvancedFunctionality?: boolean;
}

/**
 * Main class for the Agentic Meeting Analysis System
 */
export class AgenticMeetingAnalysis {
  private logger: Logger;
  private systemId: string;
  private communicationService: CommunicationService;
  private stateManager: StateManager;
  private coordinator: AnalysisCoordinatorAgent;

  // Phase 3: Collaborative Framework
  private useCollaborativeFramework: boolean;
  private collaborativeProtocol?: CollaborativeProtocolService;
  private qualityControl?: QualityControlService;
  private conflictResolution?: ConflictResolutionService;

  // Phase 5: Advanced Functionality
  private enableAdvancedFunctionality: boolean;
  private semanticChunkingService?: SemanticChunkingService;
  private teamFormationService?: TeamFormationService;
  private adaptationTriggerService?: AdaptationTriggerService;
  private adaptationManagerService?: AdaptationManagerService;

  /**
   * Create a new Agentic Meeting Analysis System
   */
  constructor(config: AgenticMeetingAnalysisConfig = {}) {
    this.systemId = `agentic-meeting-analysis-${uuidv4()}`;
    this.logger = config.logger || new ConsoleLogger();

    // Initialize core services
    this.communicationService = new CommunicationService({
      logger: this.logger,
    });
    this.stateManager = new StateManager({ logger: this.logger });

    // Initialize coordinator agent
    this.coordinator = new AnalysisCoordinatorAgent({
      logger: this.logger,
    });

    // Phase 3: Collaborative Framework
    this.useCollaborativeFramework = config.useCollaborativeFramework || false;

    if (this.useCollaborativeFramework) {
      // Initialize collaborative services
      this.collaborativeProtocol = new CollaborativeProtocolService({
        communicationService: this.communicationService,
        stateManager: this.stateManager,
        logger: this.logger,
      });

      this.qualityControl = new QualityControlService({
        communicationService: this.communicationService,
        stateManager: this.stateManager,
        logger: this.logger,
        humanFeedbackEnabled: config.enableHumanFeedback,
      });

      this.conflictResolution = new ConflictResolutionService({
        communicationService: this.communicationService,
        logger: this.logger,
        requireHumanApproval: config.enableHumanFeedback,
      });
    }

    // Phase 5: Advanced Functionality
    this.enableAdvancedFunctionality =
      config.enableAdvancedFunctionality || false;

    if (this.enableAdvancedFunctionality) {
      // Initialize advanced functionality services
      this.semanticChunkingService = new SemanticChunkingService({
        logger: this.logger,
      });

      this.teamFormationService = new TeamFormationService({
        logger: this.logger,
        stateManager: this.stateManager,
        semanticChunkingService: this.semanticChunkingService,
      });

      this.adaptationTriggerService = new AdaptationTriggerService({
        logger: this.logger,
        stateManager: this.stateManager,
        semanticChunkingService: this.semanticChunkingService,
      });

      this.adaptationManagerService = new AdaptationManagerService({
        logger: this.logger,
        stateManager: this.stateManager,
        triggerService: this.adaptationTriggerService,
        teamFormationService: this.teamFormationService,
      });
    }

    this.logger.info('Agentic Meeting Analysis System created');
  }

  /**
   * Initialize the system
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Agentic Meeting Analysis System');

      // Initialize core services
      await this.communicationService.initialize();
      await this.stateManager.initialize();

      // Initialize coordinator agent
      await this.coordinator.initialize();

      // Register coordinator with communication service
      await this.communicationService.registerAgent(
        this.coordinator.id,
        async (message) => this.coordinator.receiveMessage(message),
      );

      // Phase 3: Collaborative Framework
      if (this.useCollaborativeFramework) {
        this.logger.info('Initializing collaborative framework');

        // Initialize collaborative services
        await this.collaborativeProtocol?.initialize();
        await this.qualityControl?.initialize();
        await this.conflictResolution?.initialize();

        // Connect collaborative services
        this.setupCollaborativeFramework();
      }

      // Phase 5: Advanced Functionality
      if (this.enableAdvancedFunctionality) {
        this.logger.info('Initializing advanced functionality');

        // Initialize advanced functionality services
        await this.teamFormationService?.initialize();
        await this.adaptationTriggerService?.initialize();
        await this.adaptationManagerService?.initialize();

        // Connect advanced functionality services
        this.setupAdvancedFunctionality();
      }

      this.logger.info(
        'Agentic Meeting Analysis System initialized successfully',
      );
    } catch (error) {
      this.logger.error(
        `Error initializing system: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Set up the collaborative framework connections
   */
  private setupCollaborativeFramework(): void {
    if (
      !this.useCollaborativeFramework ||
      !this.collaborativeProtocol ||
      !this.qualityControl ||
      !this.conflictResolution
    ) {
      return;
    }

    // Register conflict resolution events
    this.conflictResolution.on('conflict_escalated', async (data) => {
      this.logger.info(`Conflict ${data.conflictId} escalated to human`);

      // Notify system about escalated conflict
      this.emit('conflict_escalated', data);

      // Notify protocol service to continue workflow if necessary
      const currentPhase = this.collaborativeProtocol?.getCurrentPhase();

      if (
        currentPhase === AnalysisPhase.CONSENSUS_BUILDING ||
        currentPhase === AnalysisPhase.CROSS_VALIDATION
      ) {
        this.logger.info(
          `Current phase is ${currentPhase}, pausing until conflict is resolved`,
        );
      }
    });

    this.conflictResolution.on('conflict_resolved', async (data) => {
      this.logger.info(`Conflict ${data.conflictId} resolved`);

      // Notify protocol service to continue workflow if necessary
      const currentPhase = this.collaborativeProtocol?.getCurrentPhase();

      if (
        currentPhase === AnalysisPhase.CONSENSUS_BUILDING ||
        currentPhase === AnalysisPhase.CROSS_VALIDATION
      ) {
        // Check if all conflicts in this phase are resolved
        const escalatedConflicts =
          this.conflictResolution?.getPendingEscalations();

        if (escalatedConflicts && escalatedConflicts.length === 0) {
          // If no more escalated conflicts, we can proceed to next phase
          this.logger.info('All conflicts resolved, continuing workflow');

          // Determine next phase
          let nextPhase: AnalysisPhase;
          if (currentPhase === AnalysisPhase.CROSS_VALIDATION) {
            nextPhase = AnalysisPhase.CONSENSUS_BUILDING;
          } else {
            nextPhase = AnalysisPhase.SYNTHESIS;
          }

          await this.collaborativeProtocol?.transitionToPhase(nextPhase);
        }
      }
    });

    // Register quality control events
    this.qualityControl.on('human_feedback_needed', async (data) => {
      this.logger.info(`Human feedback needed for task ${data.taskId}`);

      // Notify system about needed feedback
      this.emit('human_feedback_needed', data);
    });

    this.qualityControl.on('validation_completed', async (data) => {
      this.logger.info(`Validation completed for task ${data.taskId}`);

      // If we're in cross-validation phase, check if all validations are complete
      const currentPhase = this.collaborativeProtocol?.getCurrentPhase();

      if (currentPhase === AnalysisPhase.CROSS_VALIDATION) {
        const pendingValidations =
          await this.qualityControl?.getPendingHumanFeedback();

        if (pendingValidations && pendingValidations.length === 0) {
          this.logger.info(
            'All validations complete, moving to consensus building',
          );
          await this.collaborativeProtocol?.transitionToPhase(
            AnalysisPhase.CONSENSUS_BUILDING,
          );
        }
      }
    });
  }

  /**
   * Set up the advanced functionality connections
   */
  private setupAdvancedFunctionality(): void {
    if (
      !this.enableAdvancedFunctionality ||
      !this.teamFormationService ||
      !this.adaptationTriggerService ||
      !this.adaptationManagerService
    ) {
      return;
    }

    // Connect adaptation trigger events to manager
    this.adaptationTriggerService.on('adaptation_trigger', async (trigger) => {
      this.logger.info(`Adaptation trigger detected: ${trigger.type}`);

      // Notify system about trigger
      this.emit('adaptation_trigger', trigger);
    });

    // Listen for adaptation actions
    this.adaptationManagerService.on('adaptation_completed', async (data) => {
      this.logger.info(`Adaptation completed: ${data.type}`);

      // Notify system about completed adaptation
      this.emit('adaptation_completed', data);

      // If collaborative framework is enabled, check if we need to update workflow
      if (this.useCollaborativeFramework && this.collaborativeProtocol) {
        const currentPhase = this.collaborativeProtocol.getCurrentPhase();

        // Special handling for specific adaptation types
        if (
          data.type === 'recruit_specialist' &&
          (currentPhase === AnalysisPhase.INDIVIDUAL_ANALYSIS ||
            currentPhase === AnalysisPhase.CONSENSUS_BUILDING)
        ) {
          // New specialist was added, may need to assign tasks
          this.logger.info(
            'New specialist recruited, updating task assignments',
          );

          // Notify protocol about team changes (implemented in protocol service)
          await this.collaborativeProtocol.transitionToPhase(currentPhase); // Re-initialize current phase
        }

        if (data.type === 'switch_methodology') {
          this.logger.info('Methodology switched, updating analysis approach');

          // Store methodology in state for protocol service to use
          await this.stateManager.setState(
            `meeting:${data.meetingId}:methodology`,
            data.result.newMethodology,
          );
        }
      }
    });

    // If collaborative framework is enabled, connect team formation to protocol
    if (this.useCollaborativeFramework && this.collaborativeProtocol) {
      this.teamFormationService.on('team_formed', async (data) => {
        this.logger.info(
          `Team formed for meeting ${data.meetingId} with ${data.memberCount} members`,
        );

        // Store team in state for protocol service to use
        await this.stateManager.setState(`meeting:${data.meetingId}:team`, {
          teamId: data.teamId,
          members: data.memberCount,
        });
      });
    }
  }

  /**
   * Analyze a meeting transcript
   */
  async analyzeMeeting(
    meetingId: string,
    transcript: string,
    options?: {
      previousMeetings?: string[];
      additionalContext?: string;
    },
  ): Promise<any> {
    this.logger.info(`Starting analysis for meeting ${meetingId}`);

    try {
      // Create analysis task ID
      const analysisTaskId = `analysis-${uuidv4()}`;

      // Phase 5: Form team if advanced functionality is enabled
      if (this.enableAdvancedFunctionality && this.teamFormationService) {
        this.logger.info('Using advanced functionality for team formation');

        // Get all available agents
        const availableAgents = [
          this.coordinator.id,
          // In a real implementation, this would query an agent registry
          'agent-summary-1',
          'agent-action-1',
          'agent-decision-1',
          'agent-topic-1',
          'agent-sentiment-1',
          'agent-participant-1',
        ];

        // Assess meeting characteristics and form team
        await this.teamFormationService.assessMeetingCharacteristics(
          meetingId,
          transcript,
        );
        await this.teamFormationService.formTeam(
          meetingId,
          transcript,
          availableAgents,
        );

        // Set expected topics based on transcript sample
        if (this.adaptationTriggerService) {
          // Extract expected topics from transcript (simplified)
          const expectedTopics = ['meeting', 'discussion', 'planning'];
          await this.adaptationTriggerService.setExpectedTopics(
            meetingId,
            expectedTopics,
          );
        }
      }

      // Use collaborative approach if enabled
      if (this.useCollaborativeFramework && this.collaborativeProtocol) {
        this.logger.info('Using collaborative approach for meeting analysis');

        // Start analysis workflow using collaborative protocol
        await this.collaborativeProtocol.startWorkflow(
          AnalysisGoalType.FULL_ANALYSIS,
          meetingId,
        );

        // Store meeting data in state for protocol service to use
        await this.stateManager.setState(`meeting:${meetingId}:data`, {
          transcript,
          previousMeetings: options?.previousMeetings || [],
          additionalContext: options?.additionalContext,
        });

        // Start initial analysis phase
        await this.collaborativeProtocol.transitionToPhase(
          AnalysisPhase.INDIVIDUAL_ANALYSIS,
        );

        this.logger.info(
          `Analysis started for meeting ${meetingId} using collaborative approach`,
        );

        // Return task ID
        return {
          analysisTaskId,
          meetingId,
          approach: 'collaborative',
          status: 'in_progress',
        };
      } else {
        // Use traditional approach
        this.logger.info('Using traditional approach for meeting analysis');

        // Create analysis task
        const task = {
          id: analysisTaskId,
          type: AnalysisGoalType.FULL_ANALYSIS,
          input: {
            meetingId,
            transcript,
            previousMeetings: options?.previousMeetings || [],
            additionalContext: options?.additionalContext,
          },
          status: 'pending',
          priority: 1,
          created: Date.now(),
          updated: Date.now(),
        };

        // Send task to coordinator using properly formatted message
        await this.communicationService.sendMessage({
          id: `msg-${uuidv4()}`,
          type: MessageType.REQUEST,
          sender: this.systemId,
          recipients: [this.coordinator.id],
          content: task,
          timestamp: Date.now(),
        });

        this.logger.info(
          `Analysis started for meeting ${meetingId} using traditional approach`,
        );

        // Return task ID
        return {
          analysisTaskId,
          meetingId,
          approach: 'traditional',
          status: 'in_progress',
        };
      }
    } catch (error) {
      this.logger.error(
        `Error analyzing meeting: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get the status of a meeting analysis
   */
  async getAnalysisStatus(meetingId: string): Promise<any> {
    this.logger.info(`Getting analysis status for meeting ${meetingId}`);

    try {
      if (this.useCollaborativeFramework && this.collaborativeProtocol) {
        // Get status from collaborative protocol
        const workflowStatus =
          await this.collaborativeProtocol.getWorkflowStatus();

        // Initialize meeting-specific status tracking
        let meetingStatus = {
          status: 'not_found',
          currentPhase: this.collaborativeProtocol.getCurrentPhase(),
          progress: 0.5,
          results: {}
        };

        // Check if we have workflow data for this meeting from state
        const meetingData = await this.stateManager.getState(`meeting:${meetingId}:data`);

        if (!meetingData) {
          return {
            meetingId,
            status: 'not_found',
          };
        }

        // Use the current phase data for status information
        const currentPhase = this.collaborativeProtocol.getCurrentPhase();
        const currentPhaseData = workflowStatus.get(currentPhase);

        if (currentPhaseData) {
          meetingStatus.status = currentPhaseData.status;
        }

        // Get any pending human feedback requests
        const pendingFeedback = this.qualityControl
          ? await this.qualityControl.getPendingHumanFeedback()
          : [];

        // Get any escalated conflicts
        const escalatedConflicts = this.conflictResolution
          ? this.conflictResolution.getPendingEscalations()
          : [];

        // Get adaptation information if enabled
        let adaptationInfo = {};
        if (this.enableAdvancedFunctionality && this.adaptationManagerService) {
          const adaptationActions =
            await this.adaptationManagerService.getAdaptationActions(meetingId);
          adaptationInfo = {
            adaptationActions: adaptationActions.length,
            lastAdaptation:
              adaptationActions.length > 0
                ? adaptationActions[adaptationActions.length - 1].type
                : null,
          };
        }

        return {
          meetingId,
          status: meetingStatus.status,
          currentPhase: meetingStatus.currentPhase,
          progress: meetingStatus.progress,
          pendingHumanInput:
            pendingFeedback.length > 0 || escalatedConflicts.length > 0,
          pendingFeedbackRequests: pendingFeedback.length,
          escalatedConflicts: escalatedConflicts.length,
          results: meetingStatus.results,
          ...adaptationInfo,
        };
      } else {
        // Get status from coordinator
        // In a real implementation, this would query the coordinator for status
        return {
          meetingId,
          status: 'in_progress',
          progress: 0.5,
          pendingHumanInput: false,
        };
      }
    } catch (error) {
      this.logger.error(
        `Error getting analysis status: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Submit human feedback for a validation request
   */
  async submitHumanFeedback(
    feedbackId: string,
    rating: number,
    feedback: string,
    acceptOutput: boolean,
    suggestedChanges?: any,
  ): Promise<void> {
    this.logger.info(`Submitting human feedback for ${feedbackId}`);

    try {
      if (!this.qualityControl) {
        throw new Error('Quality control service not initialized');
      }

      // Submit feedback to quality control service
      await this.qualityControl.submitHumanFeedback(
        feedbackId,
        rating,
        feedback,
        acceptOutput,
        suggestedChanges,
      );

      this.logger.info(`Human feedback submitted for ${feedbackId}`);
    } catch (error) {
      this.logger.error(
        `Error submitting human feedback: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Submit human decision for an escalated conflict
   */
  async submitHumanDecision(
    conflictId: string,
    decision: string,
    rationale: string,
  ): Promise<void> {
    this.logger.info(`Submitting human decision for conflict ${conflictId}`);

    try {
      if (!this.conflictResolution) {
        throw new Error('Conflict resolution service not initialized');
      }

      // Submit decision to conflict resolution service
      await this.conflictResolution.submitHumanDecision(
        conflictId,
        decision,
        rationale,
      );

      this.logger.info(`Human decision submitted for conflict ${conflictId}`);
    } catch (error) {
      this.logger.error(
        `Error submitting human decision: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get all pending human tasks
   */
  getPendingHumanTasks(): {
    feedbackRequests: any[];
    escalatedConflicts: any[];
  } {
    // Get feedback requests
    const feedbackRequests = this.qualityControl
      ? this.qualityControl.getPendingHumanFeedback()
      : [];

    // Get escalated conflicts
    const escalatedConflicts = this.conflictResolution
      ? this.conflictResolution.getPendingEscalations()
      : [];

    return {
      feedbackRequests,
      escalatedConflicts,
    };
  }

  // Event emitter implementation
  private eventListeners: Record<string, Function[]> = {};

  on(event: string, listener: Function): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(listener);
  }

  off(event: string, listener: Function): void {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(
        (l) => l !== listener,
      );
    }
  }

  emit(event: string, ...args: any[]): void {
    if (this.eventListeners[event]) {
      for (const listener of this.eventListeners[event]) {
        listener(...args);
      }
    }
  }
  
  /**
   * Clean up resources used by the system
   * This should be called before shutting down
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up Agentic Meeting Analysis System');
    
    try {
      // Clean up communication service
      await this.communicationService.cleanup();
      
      // Clean up other services using optional chaining and conditional checks
      // to avoid TypeScript errors for services without cleanup methods
      
      // Clear all event listeners
      this.eventListeners = {};
      
      this.logger.info('Agentic Meeting Analysis System cleanup completed');
    } catch (error) {
      this.logger.error(`Error during cleanup: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

/**
 * Initialize the Agentic Meeting Analysis System
 */
export async function initializeAgenticMeetingAnalysisSystem(
  options: {
    logger?: any;
    persistenceEnabled?: boolean;
    defaultFeatureFlag?: boolean;
    enableAdvancedFunctionality?: boolean;
  } = {},
) {
  const system = new AgenticMeetingAnalysis({
    logger: options.logger,
    useCollaborativeFramework: options.defaultFeatureFlag,
    enableHumanFeedback: options.defaultFeatureFlag,
    enableAdvancedFunctionality: options.enableAdvancedFunctionality,
  });

  await system.initialize();

  return system;
}
