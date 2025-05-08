/**
 * Approval System Interfaces
 * Part of Milestone 2.3: Human-in-the-Loop Integration
 */

/**
 * Approval status for tracking state of approval requests
 */
export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  MODIFIED = 'modified',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}

/**
 * Priority levels for approval requests
 */
export enum ApprovalPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Types of actions that might require approval
 */
export enum ApprovalActionType {
  TOOL_EXECUTION = 'tool_execution',
  DATA_ACCESS = 'data_access',
  DECISION_MAKING = 'decision_making',
  EXTERNAL_COMMUNICATION = 'external_communication',
  RESOURCE_ALLOCATION = 'resource_allocation',
  WORKFLOW_MODIFICATION = 'workflow_modification',
  CUSTOM = 'custom'
}

/**
 * Base approval request interface
 */
export interface ApprovalRequest {
  id: string;
  title: string;
  description: string;
  actionType: ApprovalActionType;
  priority: ApprovalPriority;
  status: ApprovalStatus;
  createdAt: Date;
  expiresAt?: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  agentId: string;
  requestedBy: string;
  assignedApprovers: string[];
  actionPayload: any;
  actionContext?: any;
  metadata?: Record<string, any>;
}

/**
 * Approval response from a human approver
 */
export interface ApprovalResponse {
  requestId: string;
  approverId: string;
  status: ApprovalStatus.APPROVED | ApprovalStatus.REJECTED | ApprovalStatus.MODIFIED;
  timestamp: Date;
  comments?: string;
  modifiedPayload?: any;
  metadata?: Record<string, any>;
}

/**
 * Approval service interface for managing approval workflows
 */
export interface ApprovalService {
  /**
   * Create a new approval request
   */
  createRequest(request: Omit<ApprovalRequest, 'id' | 'status' | 'createdAt'>): Promise<ApprovalRequest>;
  
  /**
   * Get an approval request by ID
   */
  getRequest(requestId: string): Promise<ApprovalRequest | null>;
  
  /**
   * Process an approval response
   */
  processResponse(response: ApprovalResponse): Promise<ApprovalRequest>;
  
  /**
   * Check if a request has been approved
   */
  isApproved(requestId: string): Promise<boolean>;
  
  /**
   * Cancel an existing approval request
   */
  cancelRequest(requestId: string, reason?: string): Promise<boolean>;
  
  /**
   * Get pending approval requests for an approver
   */
  getPendingRequestsForApprover(approverId: string): Promise<ApprovalRequest[]>;
  
  /**
   * Get approval requests by agent ID
   */
  getRequestsByAgent(agentId: string, status?: ApprovalStatus): Promise<ApprovalRequest[]>;
  
  /**
   * Subscribe to approval events
   */
  subscribeToEvents(callback: (event: ApprovalEvent) => void): string;
  
  /**
   * Unsubscribe from approval events
   */
  unsubscribeFromEvents(subscriptionId: string): boolean;
}

/**
 * Approval event for notification
 */
export interface ApprovalEvent {
  type: 'request_created' | 'request_approved' | 'request_rejected' | 'request_modified' | 'request_expired' | 'request_cancelled';
  timestamp: Date;
  requestId: string;
  request: ApprovalRequest;
  actorId?: string;
}

/**
 * Approval rule for automatic approval decisions
 */
export interface ApprovalRule {
  id: string;
  name: string;
  description?: string;
  conditions: ApprovalCondition[];
  action: 'auto_approve' | 'auto_reject' | 'require_approvers';
  requiredApprovers?: string[];
  priority: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Condition for approval rules
 */
export interface ApprovalCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'matches_regex';
  value: any;
}

/**
 * Approval workflow configuration
 */
export interface ApprovalWorkflowConfig {
  defaultExpirationTime?: number; // milliseconds
  requiredApproversCount?: number;
  autoApproveEnabled?: boolean;
  autoRejectEnabled?: boolean;
  escalationThreshold?: number; // milliseconds
  notificationEnabled?: boolean;
  rules?: ApprovalRule[];
} 