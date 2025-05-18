/**
 * Base interface for all agent events
 */
export interface AgentEventBase {
  agentId: string;
  agentType: string;
  sessionId: string;
  timestamp: number;
  parentAgentId?: string;
}

/**
 * Event emitted when an agent starts processing
 */
export interface AgentStartedEvent extends AgentEventBase {
  input: any;
}

/**
 * Event emitted when an agent completes processing
 */
export interface AgentCompletedEvent extends AgentEventBase {
  duration: number;
  output: any;
}

/**
 * Event emitted when an agent encounters an error
 */
export interface AgentErrorEvent extends AgentEventBase {
  error: string;
  stack?: string;
}

/**
 * Event emitted when an external service is used
 */
export interface ExternalServiceEvent extends AgentEventBase {
  serviceType: 'rag' | 'pinecone' | 'llm';
  operation: string;
  parameters: any;
  result?: any;
  duration: number;
}

/**
 * Event emitted when an external service call completes
 */
export interface ExternalServiceCompletedEvent extends ExternalServiceEvent {
  result: any;
}

/**
 * Event emitted when an external service call fails
 */
export interface ExternalServiceErrorEvent extends AgentEventBase {
  serviceType: 'rag' | 'pinecone' | 'llm';
  operation: string;
  error: string;
  stack?: string;
}

/**
 * Event emitted when state transitions in the graph
 */
export interface StateTransitionEvent extends AgentEventBase {
  previousState: any;
  newState: any;
  transition: string;
}

/**
 * Event emitted when an agent makes a decision
 */
export interface DecisionEvent extends AgentEventBase {
  options: string[];
  selectedOption: string;
  reasoning: string;
}

/**
 * Union type of all event payload types
 */
export type AgentEventPayload = 
  | AgentStartedEvent
  | AgentCompletedEvent
  | AgentErrorEvent
  | ExternalServiceEvent
  | ExternalServiceCompletedEvent
  | ExternalServiceErrorEvent
  | StateTransitionEvent
  | DecisionEvent; 