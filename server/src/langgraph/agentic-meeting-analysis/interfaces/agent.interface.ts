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
  UNCERTAIN = 'uncertain'
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
  COORDINATION = 'coordination'
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
  FULL_ANALYSIS = 'full_analysis'
}

/**
 * Status of an analysis task
 */
export enum AnalysisTaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed'
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
 * Message types for agent communication
 */
export enum MessageType {
  REQUEST = 'request',
  RESPONSE = 'response',
  NOTIFICATION = 'notification',
  UPDATE = 'update',
  QUERY = 'query'
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
  requestAssistance(taskId: string, requestedExpertise: AgentExpertise): Promise<void>;
  provideAssistance(taskId: string, contribution: AgentOutput): Promise<void>;
  
  // Metacognition
  assessConfidence(output: any): Promise<ConfidenceLevel>;
  explainReasoning(output: any): Promise<string>;
}

/**
 * Interface for the Analysis Coordinator Agent
 */
export interface IAnalysisCoordinatorAgent extends IMeetingAnalysisAgent {
  // Team formation & management
  formTeam(analysisGoal: AnalysisGoalType, transcript: string): Promise<string[]>;
  assignTask(taskId: string, agentId: string): Promise<void>;
  reassignTask(taskId: string, newAgentId: string): Promise<void>;
  
  // Workflow management
  createWorkflow(analysisGoal: AnalysisGoalType): Promise<AnalysisTask[]>;
  monitorProgress(): Promise<Record<string, AnalysisTaskStatus>>;
  synthesizeResults(taskIds: string[]): Promise<AgentOutput>;
}

/**
 * Base interface for specialist meeting analysis agents
 */
export interface ISpecialistAnalysisAgent extends IMeetingAnalysisAgent {
  // Specialist methods
  analyzeTranscriptSegment(segment: string, context?: any): Promise<AgentOutput>;
  mergeAnalyses(analyses: AgentOutput[]): Promise<AgentOutput>;
  prioritizeInformation(output: any): Promise<any>;
} 