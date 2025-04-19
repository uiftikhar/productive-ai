/**
 * Agent Communication Interfaces
 *
 * Defines the communication protocols between specialized agents
 */

import { MeetingAnalysis } from '../types/meeting-analysis.types';
import { Decision, DecisionReport } from '../types/decision-tracking.types';
import { AgentRequest, AgentResponse } from '../../interfaces/agent.interface';
import { Logger } from '../../../shared/logger/logger.interface';

/**
 * Communication message between agents
 */
export interface AgentCommunicationMessage {
  id: string;
  from: string; // Agent ID
  to: string; // Agent ID
  timestamp: number;
  type: 'request' | 'response' | 'event' | 'error';
  content: any;
  correlationId?: string; // For tracking request-response pairs
  metadata?: Record<string, any>;
}

/**
 * Communication channel between agents
 */
export interface AgentCommunicationChannel {
  /**
   * Send a message to another agent
   */
  send(message: AgentCommunicationMessage): Promise<void>;

  /**
   * Register a message handler
   */
  registerHandler(
    handler: (
      message: AgentCommunicationMessage,
    ) => Promise<AgentCommunicationMessage | void>,
  ): void;

  /**
   * Request-response pattern
   */
  request(
    agentId: string,
    content: any,
    metadata?: Record<string, any>,
  ): Promise<AgentCommunicationMessage>;
}

/**
 * Meeting Analysis Result Event - sent from Meeting Analysis Agent to Decision Tracking Agent
 */
export interface MeetingAnalysisResultEvent extends AgentCommunicationMessage {
  type: 'event';
  content: {
    eventType: 'meeting_analysis_completed';
    meetingId: string;
    analysis: MeetingAnalysis;
  };
}

/**
 * Decision Tracking Request - sent from Meeting Analysis Agent to Decision Tracking Agent
 */
export interface DecisionTrackingRequest extends AgentCommunicationMessage {
  type: 'request';
  content: {
    requestType: 'analyze_decisions';
    meetingAnalysis: MeetingAnalysis;
    parameters?: {
      confidenceThreshold?: number;
      performImpactAssessment?: boolean;
    };
  };
}

/**
 * Decision Tracking Response - sent from Decision Tracking Agent to Meeting Analysis Agent
 */
export interface DecisionTrackingResponse extends AgentCommunicationMessage {
  type: 'response';
  content: {
    responseType: 'decisions_analyzed';
    meetingId: string;
    decisions: Decision[];
    confidenceScores?: Record<string, number>;
  };
}

/**
 * Decision Report Request - sent to Decision Tracking Agent
 */
export interface DecisionReportRequest extends AgentCommunicationMessage {
  type: 'request';
  content: {
    requestType: 'generate_report';
    parameters: {
      format: 'summary' | 'detailed' | 'timeline' | 'impact' | 'dashboard';
      dateRange?: {
        start: Date;
        end: Date;
      };
      filters?: Record<string, any>;
    };
  };
}

/**
 * Decision Report Response - sent from Decision Tracking Agent
 */
export interface DecisionReportResponse extends AgentCommunicationMessage {
  type: 'response';
  content: {
    responseType: 'report_generated';
    report: DecisionReport;
  };
}

/**
 * Interface for the specialized agent orchestrator
 */
export interface SpecializedAgentOrchestrator {
  /**
   * Set the logger instance
   */
  setLogger(logger: Logger): void;

  /**
   * Register an agent with the orchestrator
   */
  registerAgent(
    agentId: string, 
    capabilities: string[],
    agent?: any  // Make the agent parameter optional and accept any agent type
  ): void;

  /**
   * Find an agent with the specified capability
   */
  findAgentWithCapability(capability: string): string | null;

  /**
   * Route a request to the appropriate agent
   */
  routeRequest(request: AgentRequest): Promise<AgentResponse>;

  /**
   * Get a communication channel for an agent
   */
  getCommunicationChannel(fromAgentId: string): AgentCommunicationChannel;
}
