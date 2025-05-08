/**
 * Interfaces for the Agentic Meeting Analysis System
 */
import { EventEmitter } from 'events';

/**
 * Confidence level for agent outputs
 */
export enum ConfidenceLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  UNCERTAIN = 'uncertain',
}

/**
 * Agent expertise areas for meeting analysis
 */
export enum AgentExpertise {
  TOPIC_ANALYSIS = 'topic_analysis',
  ACTION_ITEM_EXTRACTION = 'action_item_extraction',
  DECISION_TRACKING = 'decision_tracking',
  SENTIMENT_ANALYSIS = 'sentiment_analysis',
  PARTICIPANT_DYNAMICS = 'participant_dynamics',
  SUMMARY_GENERATION = 'summary_generation',
  CONTEXT_INTEGRATION = 'context_integration',
  COORDINATION = 'coordination',
  MANAGEMENT = 'management',
}

/**
 * Meeting analysis goal types
 */
export enum AnalysisGoalType {
  EXTRACT_TOPICS = 'extract_topics',
  EXTRACT_ACTION_ITEMS = 'extract_action_items',
  EXTRACT_DECISIONS = 'extract_decisions',
  ANALYZE_SENTIMENT = 'analyze_sentiment',
  ANALYZE_PARTICIPATION = 'analyze_participation',
  GENERATE_SUMMARY = 'generate_summary',
  INTEGRATE_CONTEXT = 'integrate_context',
  FULL_ANALYSIS = 'full_analysis',
}

/**
 * Agent role in hierarchy
 */
export enum AgentRole {
  SUPERVISOR = 'supervisor',
  MANAGER = 'manager',
  WORKER = 'worker',
  COORDINATOR = 'coordinator',
}

/**
 * Status of an analysis task
 */
export enum AnalysisTaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Task complexity levels
 */
export enum TaskComplexity {
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex',
  VERY_COMPLEX = 'very_complex',
}

/**
 * Structured format for agent outputs
 */
export interface AgentOutput {
  content: any;
  confidence: ConfidenceLevel;
  reasoning?: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

/**
 * Component of a subtask representing a specific aspect to be analyzed
 */
export interface SubTaskComponent {
  id: string;
  name: string;
  description: string;
  expertise: AgentExpertise;
  requiredContext?: string[];
  requiredExpertise?: AgentExpertise[];
  priority?: number;
  weight?: number;
  estimatedComplexity: TaskComplexity;
  estimatedEffort?: number;
}

/**
 * Relationship between subtasks defining dependencies and connections
 */
export interface SubtaskRelationship {
  sourceId: string;
  targetId: string;
  type: 'depends_on' | 'informs' | 'optional_input' | 'parallel';
  description?: string;
  prerequisite?: string;
  dependent?: string;
}

/**
 * Structured format for final result
 */
export interface FinalResult {
  summary: string;
  sections: Record<string, any>;
  insights: string[];
  confidence: ConfidenceLevel;
  metadata: Record<string, any>;
  timestamp: number;
}

/**
 * Definition of a meeting analysis task
 */
export interface AnalysisTask {
  id: string;
  type: AnalysisGoalType;
  status: AnalysisTaskStatus;
  assignedTo?: string; // Agent ID
  input: any;
  output?: AgentOutput;
  dependencies?: string[]; // IDs of tasks that must be completed first
  priority: number;
  created: number;
  updated: number;
}

/**
 * Definition of a subtask for hierarchical delegation
 */
export interface SubTask {
  id: string;
  parentTaskId: string;
  type: AnalysisGoalType;
  status: AnalysisTaskStatus;
  assignedTo?: string; // Agent ID
  managedBy: string; // Manager Agent ID
  input: any;
  output?: AgentOutput;
  context?: any; // Additional context or instructions for the task
  priority: number;
  created: number;
  updated: number;
}

/**
 * Aggregated results from multiple workers
 */
export interface AgentResultCollection {
  taskId: string;
  results: AgentOutput[];
  metadata: {
    workerIds: string[];
    startTime: number;
    endTime: number;
  };
}

/**
 * Message types for agent communication
 */
export enum MessageType {
  REQUEST = 'request',
  RESPONSE = 'response',
  NOTIFICATION = 'notification',
  UPDATE = 'update',
  QUERY = 'query',
  DELEGATE = 'delegate',
  ESCALATE = 'escalate',
}

/**
 * Structure for inter-agent messages
 */
export interface AgentMessage {
  id: string;
  type: MessageType;
  sender: string;
  recipients: string[] | 'broadcast';
  content: any;
  replyTo?: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

/**
 * Core interface for all meeting analysis agents
 */
export interface IMeetingAnalysisAgent extends EventEmitter {
  id: string;
  name: string;
  expertise: AgentExpertise[];
  capabilities: Set<AnalysisGoalType>;
  role: AgentRole;

  // Core methods
  initialize(config?: Record<string, any>): Promise<void>;
  processTask(task: AnalysisTask): Promise<AgentOutput>;

  // Communication
  sendMessage(message: AgentMessage): Promise<void>;
  receiveMessage(message: AgentMessage): Promise<void>;

  // Memory & state operations
  readMemory(key: string, namespace?: string): Promise<any>;
  writeMemory(key: string, value: any, namespace?: string): Promise<void>;
  subscribeToMemory(key: string, callback: (value: any) => void): void;

  // Collaboration
  requestAssistance(
    taskId: string,
    requestedExpertise: AgentExpertise,
  ): Promise<void>;
  provideAssistance(taskId: string, contribution: AgentOutput): Promise<void>;

  // Metacognition
  assessConfidence(output: any): Promise<ConfidenceLevel>;
  explainReasoning(output: any): Promise<string>;
}

/**
 * Type for synthesis function that can accept different parameter types
 */
export interface SynthesisFunction {
  // For coordinator: takes task IDs, returns AgentOutput
  (taskIds: string[]): Promise<AgentOutput>;
  // For supervisor: takes result collections, returns FinalResult
  (results: AgentResultCollection[]): Promise<FinalResult>;
}

/**
 * Interface for the Analysis Coordinator Agent
 */
export interface IAnalysisCoordinatorAgent extends IMeetingAnalysisAgent {
  // Team formation & management
  formTeam(
    analysisGoal: AnalysisGoalType,
    transcript: string,
  ): Promise<string[]>;
  assignTask(taskId: string, agentId: string): Promise<void>;
  reassignTask(taskId: string, newAgentId: string): Promise<void>;

  // Workflow management
  createWorkflow(analysisGoal: AnalysisGoalType): Promise<AnalysisTask[]>;
  monitorProgress(): Promise<Record<string, AnalysisTaskStatus>>;
  
  // Use the overloaded type for synthesis
  synthesizeResults: SynthesisFunction;
}

/**
 * Interface for Supervisor Agent with enhanced hierarchical capabilities
 */
export interface ISupervisorAgent extends Omit<IAnalysisCoordinatorAgent, 'synthesizeResults'> {
  // Hierarchical management
  decideNextAgent(context: { messages: AgentMessage[] }): Promise<string>;
  decomposeTask(task: AnalysisTask): Promise<SubTask[]>;
  
  // Define specific parameter and return types for the supervisor
  synthesizeResults(results: AgentResultCollection[]): Promise<FinalResult>;
  
  // For backward compatibility with the coordinator interface
  synthesizeTaskResults(taskIds: string[]): Promise<AgentOutput>;
  
  assignManagerForExpertise(expertise: AgentExpertise): Promise<string>;
  handleEscalation(message: AgentMessage): Promise<void>;
}

/**
 * Interface for Manager Agent that supervises workers
 */
export interface IManagerAgent extends IMeetingAnalysisAgent {
  // Worker management
  managedExpertise: AgentExpertise[];
  managedAgents: string[];
  
  // Task management
  delegateSubtasks(task: SubTask, workerIds: string[]): Promise<void>;
  evaluateResults(results: AgentOutput[]): Promise<AgentOutput>;
  escalateToSupervisor(taskId: string, reason: string): Promise<void>;
  
  // Team management
  addWorker(workerId: string): Promise<void>;
  removeWorker(workerId: string): Promise<void>;
  getAvailableWorkers(): Promise<string[]>;
}

/**
 * Base interface for specialist meeting analysis agents
 */
export interface ISpecialistAnalysisAgent extends IMeetingAnalysisAgent {
  // Specialist methods
  analyzeTranscriptSegment(
    segment: string,
    context?: any,
  ): Promise<AgentOutput>;
  mergeAnalyses(analyses: AgentOutput[]): Promise<AgentOutput>;
  prioritizeInformation(output: any): Promise<any>;
}
