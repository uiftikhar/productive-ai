/**
 * Quality Control Service for the Agentic Meeting Analysis System
 *
 * This service implements quality control mechanisms for agent outputs:
 * - Cross-validation between agent findings
 * - Confidence scoring framework
 * - Self-assessment mechanisms
 * - Human feedback integration
 * - Progressive refinement logic
 */
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import {
  AgentOutput,
  ConfidenceLevel,
  AgentExpertise,
  AnalysisTaskStatus,
  AnalysisTask,
  AgentMessage,
  MessageType,
} from '../interfaces/agent.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { ICommunicationService } from '../interfaces/communication.interface';
import { StateManager } from '../state/state.manager';
import { ProtocolMessageType } from './collaborative-protocol.service';

/**
 * Configuration options for QualityControlService
 */
export interface QualityControlConfig {
  communicationService: ICommunicationService;
  stateManager: StateManager;
  logger?: Logger;
  minimumConfidenceThreshold?: number;
  validationThreshold?: number;
  maxRefinementIterations?: number;
  humanFeedbackEnabled?: boolean;
}

/**
 * Quality assessment status
 */
export enum QualityAssessmentStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  APPROVED = 'approved',
  NEEDS_REFINEMENT = 'needs_refinement',
  REJECTED = 'rejected',
}

/**
 * Validation result from cross-validation
 */
export interface ValidationResult {
  id: string;
  sourceTaskId: string;
  validatorId: string;
  agreement: number; // 0-1 scale
  feedback: string;
  suggestedChanges?: any;
  confidenceInValidation: ConfidenceLevel;
  timestamp: number;
}

/**
 * Human feedback structure
 */
export interface HumanFeedback {
  id: string;
  targetTaskId: string;
  targetAgentId: string;
  rating: number; // 1-5 scale
  feedback: string;
  acceptOutput: boolean;
  suggestedChanges?: any;
  timestamp: number;
}

/**
 * Refinement request structure
 */
export interface RefinementRequest {
  id: string;
  targetTaskId: string;
  targetAgentId: string;
  reason: string;
  specificFeedback: string[];
  suggestedImprovements?: any;
  iteration: number;
  timestamp: number;
}

/**
 * Quality control state
 */
interface QualityControlState {
  taskAssessments: Map<
    string,
    {
      taskId: string;
      status: QualityAssessmentStatus;
      confidence: ConfidenceLevel;
      validationResults: ValidationResult[];
      humanFeedback?: HumanFeedback;
      refinementHistory: RefinementRequest[];
      currentIteration: number;
    }
  >;
  confidenceScores: Map<
    string,
    {
      agentId: string;
      expertise: AgentExpertise;
      overallScore: number; // 0-1 scale
      taskScores: Map<string, number>;
    }
  >;
  humanFeedbackQueue: HumanFeedback[];
}

/**
 * Implementation of the quality control service
 */
export class QualityControlService extends EventEmitter {
  private communicationService: ICommunicationService;
  private stateManager: StateManager;
  private logger: Logger;
  private minimumConfidenceThreshold: number;
  private validationThreshold: number;
  private maxRefinementIterations: number;
  private humanFeedbackEnabled: boolean;
  private state: QualityControlState;

  /**
   * Create a new quality control service
   */
  constructor(config: QualityControlConfig) {
    super();

    this.communicationService = config.communicationService;
    this.stateManager = config.stateManager;
    this.logger = config.logger || new ConsoleLogger();
    this.minimumConfidenceThreshold = config.minimumConfidenceThreshold || 0.7;
    this.validationThreshold = config.validationThreshold || 0.75;
    this.maxRefinementIterations = config.maxRefinementIterations || 3;
    this.humanFeedbackEnabled = config.humanFeedbackEnabled || false;

    // Initialize state
    this.state = {
      taskAssessments: new Map(),
      confidenceScores: new Map(),
      humanFeedbackQueue: [],
    };

    this.logger.info('Initialized QualityControlService');
  }

  /**
   * Initialize the quality control service
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing quality control service');

      // Set up event listeners
      this.setupEventListeners();

      this.logger.info('Quality control service initialized successfully');
    } catch (error) {
      this.logger.error(
        `Error initializing quality control service: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Register a task for quality assessment
   */
  async registerTaskForAssessment(
    task: AnalysisTask,
    output: AgentOutput,
  ): Promise<void> {
    this.logger.info(`Registering task ${task.id} for quality assessment`);

    // Initialize assessment record
    if (!this.state.taskAssessments.has(task.id)) {
      this.state.taskAssessments.set(task.id, {
        taskId: task.id,
        status: QualityAssessmentStatus.PENDING,
        confidence: output.confidence,
        validationResults: [],
        refinementHistory: [],
        currentIteration: 0,
      });
    }

    // If confidence is too low, immediately mark for refinement
    if (
      this.getConfidenceScore(output.confidence) <
      this.minimumConfidenceThreshold
    ) {
      await this.requestRefinement(
        task.id,
        task.assignedTo || '',
        'Low confidence score',
        [
          'The confidence level is below the required threshold',
          'Please review and improve the output quality',
        ],
      );

      this.logger.info(
        `Task ${task.id} marked for refinement due to low confidence`,
      );
      return;
    }

    // Update task status
    const assessment = this.state.taskAssessments.get(task.id)!;
    assessment.status = QualityAssessmentStatus.IN_PROGRESS;
    this.state.taskAssessments.set(task.id, assessment);

    // Initiate cross-validation
    await this.initiateValidation(task, output);

    this.logger.info(`Task ${task.id} registered for assessment successfully`);
  }

  /**
   * Initiate cross-validation of task output
   */
  async initiateValidation(
    task: AnalysisTask,
    output: AgentOutput,
  ): Promise<void> {
    this.logger.info(`Initiating validation for task ${task.id}`);

    // Select validators (agents with relevant expertise)
    const validators = await this.selectValidators(task, 2); // Request 2 validators

    if (validators.length === 0) {
      this.logger.warn(`No validators available for task ${task.id}`);

      // Auto-approve if no validators available
      await this.approveTaskOutput(task.id);
      return;
    }

    // Send validation requests
    for (const validatorId of validators) {
      await this.communicationService.sendMessage({
        id: `msg-${uuidv4()}`,
        type: MessageType.REQUEST,
        sender: 'quality-control',
        recipients: [validatorId],
        content: {
          type: 'validation_request',
          taskId: task.id,
          taskType: task.type,
          output: output,
          deadline: Date.now() + 30000, // 30 seconds
        },
        timestamp: Date.now(),
      });
    }

    this.logger.info(
      `Validation initiated for task ${task.id} with ${validators.length} validators`,
    );

    // Set timeout for validation
    setTimeout(() => this.processValidationResults(task.id), 35000); // 35 seconds
  }

  /**
   * Submit validation result
   */
  async submitValidationResult(
    taskId: string,
    validatorId: string,
    agreement: number,
    feedback: string,
    suggestedChanges?: any,
  ): Promise<void> {
    this.logger.info(
      `Validator ${validatorId} submitting validation for task ${taskId}`,
    );

    // Verify task is registered
    if (!this.state.taskAssessments.has(taskId)) {
      throw new Error(`Task not registered for assessment: ${taskId}`);
    }

    // Create validation result
    const validation: ValidationResult = {
      id: `validation-${uuidv4()}`,
      sourceTaskId: taskId,
      validatorId,
      agreement,
      feedback,
      suggestedChanges,
      confidenceInValidation: ConfidenceLevel.MEDIUM, // Default medium confidence
      timestamp: Date.now(),
    };

    // Store validation result
    const assessment = this.state.taskAssessments.get(taskId)!;
    assessment.validationResults.push(validation);
    this.state.taskAssessments.set(taskId, assessment);

    this.logger.info(`Validation result recorded for task ${taskId}`);
  }

  /**
   * Process validation results for a task
   */
  async processValidationResults(taskId: string): Promise<void> {
    this.logger.info(`Processing validation results for task ${taskId}`);

    // Verify task is registered
    if (!this.state.taskAssessments.has(taskId)) {
      this.logger.warn(`Task not registered for assessment: ${taskId}`);
      return;
    }

    const assessment = this.state.taskAssessments.get(taskId)!;

    // If no validation results received, auto-approve
    if (assessment.validationResults.length === 0) {
      this.logger.warn(
        `No validation results received for task ${taskId}, auto-approving`,
      );
      await this.approveTaskOutput(taskId);
      return;
    }

    // Calculate average agreement score
    let totalAgreement = 0;
    for (const validation of assessment.validationResults) {
      totalAgreement += validation.agreement;
    }
    const averageAgreement =
      totalAgreement / assessment.validationResults.length;

    // Decide based on agreement level
    if (averageAgreement >= this.validationThreshold) {
      // High agreement - approve output
      await this.approveTaskOutput(taskId);
    } else {
      // Low agreement - request refinement

      // Get task details
      const task = await this.stateManager.getState(`task:${taskId}`);
      if (!task) {
        this.logger.error(`Task not found in state manager: ${taskId}`);
        return;
      }

      // Compile feedback from validators
      const feedbackItems = assessment.validationResults.map((v) => v.feedback);

      // Request refinement
      await this.requestRefinement(
        taskId,
        task.assignedTo || '',
        'Cross-validation feedback',
        feedbackItems,
      );
    }
  }

  /**
   * Request refinement of a task output
   */
  async requestRefinement(
    taskId: string,
    agentId: string,
    reason: string,
    feedback: string[],
    suggestedImprovements?: any,
  ): Promise<void> {
    this.logger.info(
      `Requesting refinement for task ${taskId} from agent ${agentId}`,
    );

    // Verify task is registered
    if (!this.state.taskAssessments.has(taskId)) {
      throw new Error(`Task not registered for assessment: ${taskId}`);
    }

    const assessment = this.state.taskAssessments.get(taskId)!;

    // Check if we've reached max iterations
    if (assessment.currentIteration >= this.maxRefinementIterations) {
      this.logger.warn(
        `Max refinement iterations reached for task ${taskId}, escalating to human`,
      );

      if (this.humanFeedbackEnabled) {
        await this.requestHumanFeedback(taskId, agentId);
      } else {
        // If human feedback not enabled, auto-approve despite issues
        this.logger.warn(
          `Human feedback not enabled, auto-approving task ${taskId} despite issues`,
        );
        await this.approveTaskOutput(taskId);
      }

      return;
    }

    // Create refinement request
    const refinementRequest: RefinementRequest = {
      id: `refinement-${uuidv4()}`,
      targetTaskId: taskId,
      targetAgentId: agentId,
      reason,
      specificFeedback: feedback,
      suggestedImprovements,
      iteration: assessment.currentIteration + 1,
      timestamp: Date.now(),
    };

    // Update assessment
    assessment.status = QualityAssessmentStatus.NEEDS_REFINEMENT;
    assessment.refinementHistory.push(refinementRequest);
    assessment.currentIteration++;
    this.state.taskAssessments.set(taskId, assessment);

    // Send refinement request to agent
    await this.communicationService.sendMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.REQUEST,
      sender: 'quality-control',
      recipients: [agentId],
      content: {
        type: 'refinement_request',
        taskId,
        refinementRequest,
      },
      timestamp: Date.now(),
    });

    this.logger.info(
      `Refinement request sent for task ${taskId}, iteration ${assessment.currentIteration}`,
    );
  }

  /**
   * Submit refined output for a task
   */
  async submitRefinedOutput(
    taskId: string,
    refinedOutput: AgentOutput,
  ): Promise<void> {
    this.logger.info(`Receiving refined output for task ${taskId}`);

    // Verify task is registered
    if (!this.state.taskAssessments.has(taskId)) {
      throw new Error(`Task not registered for assessment: ${taskId}`);
    }

    const assessment = this.state.taskAssessments.get(taskId)!;

    // Check if this refined output has higher confidence
    if (
      this.getConfidenceScore(refinedOutput.confidence) >=
      this.minimumConfidenceThreshold
    ) {
      // If confidence is high enough, approve the output
      await this.approveTaskOutput(taskId);
    } else if (assessment.currentIteration >= this.maxRefinementIterations) {
      // If we've reached max iterations, escalate or auto-approve
      if (this.humanFeedbackEnabled) {
        await this.requestHumanFeedback(
          taskId,
          refinedOutput.metadata?.agentId || '',
        );
      } else {
        await this.approveTaskOutput(taskId);
      }
    } else {
      // Otherwise, initiate another validation round

      // Get task details
      const task = await this.stateManager.getState(`task:${taskId}`);
      if (!task) {
        this.logger.error(`Task not found in state manager: ${taskId}`);
        return;
      }

      // Reinitiate validation
      await this.initiateValidation(task, refinedOutput);
    }

    this.logger.info(`Processed refined output for task ${taskId}`);
  }

  /**
   * Request human feedback for a task
   */
  async requestHumanFeedback(taskId: string, agentId: string): Promise<void> {
    this.logger.info(`Requesting human feedback for task ${taskId}`);

    // Create placeholder for human feedback
    const humanFeedback: HumanFeedback = {
      id: `feedback-${uuidv4()}`,
      targetTaskId: taskId,
      targetAgentId: agentId,
      rating: 0,
      feedback: '',
      acceptOutput: false,
      timestamp: Date.now(),
    };

    // Update assessment
    const assessment = this.state.taskAssessments.get(taskId)!;
    assessment.humanFeedback = humanFeedback;
    this.state.taskAssessments.set(taskId, assessment);

    // Add to human feedback queue
    this.state.humanFeedbackQueue.push(humanFeedback);

    // Notify system that human input is needed
    this.emit('human_feedback_needed', {
      taskId,
      agentId,
      feedbackId: humanFeedback.id,
    });

    this.logger.info(`Human feedback requested for task ${taskId}`);
  }

  /**
   * Submit human feedback
   */
  async submitHumanFeedback(
    feedbackId: string,
    rating: number,
    feedback: string,
    acceptOutput: boolean,
    suggestedChanges?: any,
  ): Promise<void> {
    this.logger.info(`Receiving human feedback for ${feedbackId}`);

    // Find the human feedback in the queue
    const feedbackIndex = this.state.humanFeedbackQueue.findIndex(
      (f) => f.id === feedbackId,
    );

    if (feedbackIndex === -1) {
      throw new Error(`Human feedback not found: ${feedbackId}`);
    }

    // Update the feedback
    const humanFeedback = this.state.humanFeedbackQueue[feedbackIndex];
    humanFeedback.rating = rating;
    humanFeedback.feedback = feedback;
    humanFeedback.acceptOutput = acceptOutput;
    humanFeedback.suggestedChanges = suggestedChanges;
    humanFeedback.timestamp = Date.now();

    // Remove from queue
    this.state.humanFeedbackQueue.splice(feedbackIndex, 1);

    // Update task assessment
    const assessment = this.state.taskAssessments.get(
      humanFeedback.targetTaskId,
    );
    if (assessment) {
      assessment.humanFeedback = humanFeedback;

      // Update status based on human decision
      if (acceptOutput) {
        assessment.status = QualityAssessmentStatus.APPROVED;
      } else {
        assessment.status = QualityAssessmentStatus.REJECTED;
      }

      this.state.taskAssessments.set(humanFeedback.targetTaskId, assessment);
    }

    // Process the human feedback
    if (acceptOutput) {
      // If output is accepted, notify system
      await this.approveTaskOutput(humanFeedback.targetTaskId);
    } else {
      // If output is rejected, request another refinement or mark as failed
      if (
        assessment &&
        assessment.currentIteration < this.maxRefinementIterations
      ) {
        await this.requestRefinement(
          humanFeedback.targetTaskId,
          humanFeedback.targetAgentId,
          'Human feedback',
          [feedback],
          suggestedChanges,
        );
      } else {
        // Mark task as failed in the system
        this.emit('task_failed', {
          taskId: humanFeedback.targetTaskId,
          reason: 'Rejected by human reviewer',
          feedback,
        });
      }
    }

    this.logger.info(`Processed human feedback for ${feedbackId}`);
  }

  /**
   * Approve a task output
   */
  async approveTaskOutput(taskId: string): Promise<void> {
    this.logger.info(`Approving output for task ${taskId}`);

    // Update assessment status
    const assessment = this.state.taskAssessments.get(taskId);
    if (assessment) {
      assessment.status = QualityAssessmentStatus.APPROVED;
      this.state.taskAssessments.set(taskId, assessment);
    }

    // Notify system of approval
    this.emit('task_approved', { taskId });

    this.logger.info(`Task ${taskId} output approved`);
  }

  /**
   * Update agent confidence score
   */
  async updateAgentConfidenceScore(
    agentId: string,
    expertise: AgentExpertise,
    taskId: string,
    score: number,
  ): Promise<void> {
    this.logger.debug(
      `Updating confidence score for agent ${agentId} on task ${taskId}: ${score}`,
    );

    // Get or create agent confidence record
    if (!this.state.confidenceScores.has(agentId)) {
      this.state.confidenceScores.set(agentId, {
        agentId,
        expertise,
        overallScore: 0.5, // Default starting score
        taskScores: new Map(),
      });
    }

    const agentScore = this.state.confidenceScores.get(agentId)!;

    // Update task-specific score
    agentScore.taskScores.set(taskId, score);

    // Recalculate overall score (exponential moving average)
    const alpha = 0.2; // Weight for new score
    const newOverallScore =
      (1 - alpha) * agentScore.overallScore + alpha * score;
    agentScore.overallScore = newOverallScore;

    // Update the record
    this.state.confidenceScores.set(agentId, agentScore);

    this.logger.debug(
      `Updated overall confidence score for agent ${agentId}: ${newOverallScore}`,
    );
  }

  /**
   * Get agent confidence score
   */
  getAgentConfidenceScore(agentId: string): number {
    const agentScore = this.state.confidenceScores.get(agentId);
    return agentScore ? agentScore.overallScore : 0.5; // Default if no history
  }

  /**
   * Get the quality assessment status for a task
   */
  getTaskAssessmentStatus(taskId: string): QualityAssessmentStatus | null {
    const assessment = this.state.taskAssessments.get(taskId);
    return assessment ? assessment.status : null;
  }

  /**
   * Get pending human feedback requests
   */
  getPendingHumanFeedback(): HumanFeedback[] {
    return [...this.state.humanFeedbackQueue];
  }

  /**
   * Private methods
   */

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen for task completion events
    this.communicationService.on('message', async (message: AgentMessage) => {
      if (
        message.type === MessageType.RESPONSE &&
        message.content?.type === 'task_completed'
      ) {
        const { taskId, output } = message.content;

        // Get task details
        const task = await this.stateManager.getState(`task:${taskId}`);
        if (task) {
          await this.registerTaskForAssessment(task, output);
        }
      } else if (
        message.type === MessageType.RESPONSE &&
        message.content?.type === 'validation_result'
      ) {
        const { taskId, agreement, feedback, suggestedChanges } =
          message.content;

        await this.submitValidationResult(
          taskId,
          message.sender,
          agreement,
          feedback,
          suggestedChanges,
        );
      } else if (
        message.type === MessageType.RESPONSE &&
        message.content?.type === 'refined_output'
      ) {
        const { taskId, output } = message.content;

        await this.submitRefinedOutput(taskId, output);
      }
    });
  }

  /**
   * Convert confidence level to numeric score
   */
  private getConfidenceScore(confidence: ConfidenceLevel): number {
    switch (confidence) {
      case ConfidenceLevel.HIGH:
        return 0.9;
      case ConfidenceLevel.MEDIUM:
        return 0.7;
      case ConfidenceLevel.LOW:
        return 0.4;
      case ConfidenceLevel.UNCERTAIN:
        return 0.2;
      default:
        return 0.5;
    }
  }

  /**
   * Select validators for a task
   */
  private async selectValidators(
    task: AnalysisTask,
    count: number,
  ): Promise<string[]> {
    // Get agents with relevant expertise
    // This is a placeholder - in a real implementation, you would query for agents
    // with relevant expertise that weren't involved in creating the output

    // For now, just return any two registered agents that aren't the task assignee
    const allAgents = Array.from(this.state.confidenceScores.keys());
    const validators = allAgents
      .filter((agent) => agent !== task.assignedTo)
      .slice(0, count);

    return validators;
  }
}
