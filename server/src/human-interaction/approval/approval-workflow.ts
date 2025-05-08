/**
 * Approval Workflow Implementation
 * Part of Milestone 2.3: Human-in-the-Loop Integration
 */
import { v4 as uuidv4 } from 'uuid';
import { 
  ApprovalService, 
  ApprovalRequest, 
  ApprovalResponse, 
  ApprovalStatus,
  ApprovalEvent,
  ApprovalRule,
  ApprovalWorkflowConfig
} from '../interfaces/approval.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Implementation of the Approval Service for managing approval workflows
 */
export class ApprovalWorkflowService implements ApprovalService {
  private requests: Map<string, ApprovalRequest> = new Map();
  private rules: ApprovalRule[] = [];
  private eventSubscriptions: Map<string, (event: ApprovalEvent) => void> = new Map();
  private logger: Logger;
  private config: ApprovalWorkflowConfig;
  
  /**
   * Create a new approval workflow service
   */
  constructor(config: ApprovalWorkflowConfig = {}, logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
    this.config = {
      defaultExpirationTime: 24 * 60 * 60 * 1000, // 24 hours
      requiredApproversCount: 1,
      autoApproveEnabled: false,
      autoRejectEnabled: false,
      notificationEnabled: true,
      ...config
    };
    
    this.logger.info('Approval workflow service initialized');
  }
  
  /**
   * Create a new approval request
   */
  async createRequest(request: Omit<ApprovalRequest, 'id' | 'status' | 'createdAt'>): Promise<ApprovalRequest> {
    const id = uuidv4();
    const now = new Date();
    
    const fullRequest: ApprovalRequest = {
      id,
      status: ApprovalStatus.PENDING,
      createdAt: now,
      ...request,
      expiresAt: request.expiresAt || new Date(now.getTime() + (this.config.defaultExpirationTime || 0))
    };
    
    // Store the request
    this.requests.set(id, fullRequest);
    
    // Check for auto-approval/rejection rules
    if (this.config.rules && this.config.rules.length > 0) {
      const applicableRules = this.findApplicableRules(fullRequest);
      
      if (applicableRules.length > 0) {
        // Apply the highest priority rule
        const topRule = applicableRules[0];
        
        if (topRule.action === 'auto_approve' && this.config.autoApproveEnabled) {
          // Auto-approve the request
          await this.autoApprove(fullRequest, `Auto-approved by rule: ${topRule.name}`);
        } else if (topRule.action === 'auto_reject' && this.config.autoRejectEnabled) {
          // Auto-reject the request
          await this.autoReject(fullRequest, `Auto-rejected by rule: ${topRule.name}`);
        } else if (topRule.action === 'require_approvers' && topRule.requiredApprovers) {
          // Assign specific approvers
          fullRequest.assignedApprovers = topRule.requiredApprovers;
          this.requests.set(id, fullRequest);
        }
      }
    }
    
    // Emit event for creation
    this.emitEvent({
      type: 'request_created',
      timestamp: new Date(),
      requestId: id,
      request: fullRequest
    });
    
    this.logger.info(`Created approval request: ${id}`, {
      title: fullRequest.title,
      actionType: fullRequest.actionType,
      priority: fullRequest.priority,
      approverCount: fullRequest.assignedApprovers.length
    });
    
    return fullRequest;
  }
  
  /**
   * Get an approval request by ID
   */
  async getRequest(requestId: string): Promise<ApprovalRequest | null> {
    const request = this.requests.get(requestId);
    
    if (!request) {
      return null;
    }
    
    // Check if it's expired
    if (request.status === ApprovalStatus.PENDING && 
        request.expiresAt && 
        request.expiresAt < new Date()) {
      // Update status to expired
      request.status = ApprovalStatus.EXPIRED;
      this.requests.set(requestId, request);
      
      // Emit expiration event
      this.emitEvent({
        type: 'request_expired',
        timestamp: new Date(),
        requestId,
        request
      });
    }
    
    return request;
  }
  
  /**
   * Process an approval response
   */
  async processResponse(response: ApprovalResponse): Promise<ApprovalRequest> {
    const request = await this.getRequest(response.requestId);
    
    if (!request) {
      throw new Error(`Approval request not found: ${response.requestId}`);
    }
    
    if (request.status !== ApprovalStatus.PENDING) {
      throw new Error(`Cannot process response for request with status: ${request.status}`);
    }
    
    // Check if the responder is an assigned approver
    if (!request.assignedApprovers.includes(response.approverId)) {
      throw new Error(`User ${response.approverId} is not an assigned approver for this request`);
    }
    
    // Update the request based on the response
    const updatedRequest = { ...request };
    
    switch (response.status) {
      case ApprovalStatus.APPROVED:
        updatedRequest.status = ApprovalStatus.APPROVED;
        updatedRequest.approvedAt = response.timestamp;
        
        this.emitEvent({
          type: 'request_approved',
          timestamp: new Date(),
          requestId: request.id,
          request: updatedRequest,
          actorId: response.approverId
        });
        
        this.logger.info(`Approval request approved: ${request.id}`, {
          approverId: response.approverId,
          comments: response.comments || 'No comments'
        });
        break;
        
      case ApprovalStatus.REJECTED:
        updatedRequest.status = ApprovalStatus.REJECTED;
        updatedRequest.rejectedAt = response.timestamp;
        
        this.emitEvent({
          type: 'request_rejected',
          timestamp: new Date(),
          requestId: request.id,
          request: updatedRequest,
          actorId: response.approverId
        });
        
        this.logger.info(`Approval request rejected: ${request.id}`, {
          approverId: response.approverId,
          comments: response.comments || 'No comments'
        });
        break;
        
      case ApprovalStatus.MODIFIED:
        updatedRequest.status = ApprovalStatus.MODIFIED;
        updatedRequest.actionPayload = response.modifiedPayload || updatedRequest.actionPayload;
        
        this.emitEvent({
          type: 'request_modified',
          timestamp: new Date(),
          requestId: request.id,
          request: updatedRequest,
          actorId: response.approverId
        });
        
        this.logger.info(`Approval request modified: ${request.id}`, {
          approverId: response.approverId,
          comments: response.comments || 'No comments'
        });
        break;
        
      default:
        throw new Error(`Invalid approval response status: ${response.status}`);
    }
    
    // Update in storage
    this.requests.set(request.id, updatedRequest);
    
    return updatedRequest;
  }
  
  /**
   * Check if a request has been approved
   */
  async isApproved(requestId: string): Promise<boolean> {
    const request = await this.getRequest(requestId);
    return request !== null && request.status === ApprovalStatus.APPROVED;
  }
  
  /**
   * Cancel an existing approval request
   */
  async cancelRequest(requestId: string, reason?: string): Promise<boolean> {
    const request = await this.getRequest(requestId);
    
    if (!request) {
      return false;
    }
    
    if (request.status !== ApprovalStatus.PENDING) {
      return false;
    }
    
    // Update the request status
    request.status = ApprovalStatus.CANCELLED;
    request.metadata = {
      ...request.metadata,
      cancellationReason: reason || 'No reason provided',
      cancelledAt: new Date()
    };
    
    // Update in storage
    this.requests.set(requestId, request);
    
    // Emit cancellation event
    this.emitEvent({
      type: 'request_cancelled',
      timestamp: new Date(),
      requestId,
      request
    });
    
    this.logger.info(`Approval request cancelled: ${requestId}`, {
      reason: reason || 'No reason provided'
    });
    
    return true;
  }
  
  /**
   * Get pending approval requests for an approver
   */
  async getPendingRequestsForApprover(approverId: string): Promise<ApprovalRequest[]> {
    const pendingRequests: ApprovalRequest[] = [];
    
    for (const request of this.requests.values()) {
      // Check if request is pending and the user is an assigned approver
      if (
        request.status === ApprovalStatus.PENDING && 
        request.assignedApprovers.includes(approverId)
      ) {
        // Check if it's expired
        if (request.expiresAt && request.expiresAt < new Date()) {
          // Update status to expired
          request.status = ApprovalStatus.EXPIRED;
          this.requests.set(request.id, request);
          
          // Emit expiration event
          this.emitEvent({
            type: 'request_expired',
            timestamp: new Date(),
            requestId: request.id,
            request
          });
        } else {
          pendingRequests.push(request);
        }
      }
    }
    
    return pendingRequests;
  }
  
  /**
   * Get approval requests by agent ID
   */
  async getRequestsByAgent(agentId: string, status?: ApprovalStatus): Promise<ApprovalRequest[]> {
    const requests: ApprovalRequest[] = [];
    
    for (const request of this.requests.values()) {
      // Filter by agent ID and optionally by status
      if (
        request.agentId === agentId && 
        (status === undefined || request.status === status)
      ) {
        requests.push(request);
      }
    }
    
    return requests;
  }
  
  /**
   * Subscribe to approval events
   */
  subscribeToEvents(callback: (event: ApprovalEvent) => void): string {
    const subscriptionId = uuidv4();
    this.eventSubscriptions.set(subscriptionId, callback);
    return subscriptionId;
  }
  
  /**
   * Unsubscribe from approval events
   */
  unsubscribeFromEvents(subscriptionId: string): boolean {
    return this.eventSubscriptions.delete(subscriptionId);
  }
  
  /**
   * Register approval rules
   */
  registerRules(rules: ApprovalRule[]): void {
    // Sort rules by priority
    this.rules = [...rules].sort((a, b) => b.priority - a.priority);
    this.logger.info(`Registered ${rules.length} approval rules`);
  }
  
  /**
   * Get all registered rules
   */
  getRules(): ApprovalRule[] {
    return [...this.rules];
  }
  
  /**
   * Find applicable rules for a request
   */
  private findApplicableRules(request: ApprovalRequest): ApprovalRule[] {
    return this.rules
      .filter(rule => rule.enabled && this.doesRuleApply(rule, request))
      .sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * Check if a rule applies to a request
   */
  private doesRuleApply(rule: ApprovalRule, request: ApprovalRequest): boolean {
    // A rule applies if all of its conditions match
    return rule.conditions.every(condition => {
      const value = this.getFieldValue(request, condition.field);
      
      switch (condition.operator) {
        case 'equals':
          return value === condition.value;
        case 'not_equals':
          return value !== condition.value;
        case 'contains':
          return String(value).includes(String(condition.value));
        case 'not_contains':
          return !String(value).includes(String(condition.value));
        case 'greater_than':
          return Number(value) > Number(condition.value);
        case 'less_than':
          return Number(value) < Number(condition.value);
        case 'matches_regex':
          try {
            const regex = new RegExp(String(condition.value));
            return regex.test(String(value));
          } catch (error) {
            this.logger.error('Invalid regex in approval rule', { error });
            return false;
          }
        default:
          return false;
      }
    });
  }
  
  /**
   * Get field value from a request by path
   */
  private getFieldValue(request: ApprovalRequest, field: string): any {
    // Handle nested fields with dot notation
    const parts = field.split('.');
    let value: any = request;
    
    for (const part of parts) {
      if (value === undefined || value === null) {
        return undefined;
      }
      
      value = value[part];
    }
    
    return value;
  }
  
  /**
   * Auto-approve a request based on rules
   */
  private async autoApprove(request: ApprovalRequest, reason: string): Promise<void> {
    const updatedRequest = { ...request };
    
    updatedRequest.status = ApprovalStatus.APPROVED;
    updatedRequest.approvedAt = new Date();
    updatedRequest.metadata = {
      ...updatedRequest.metadata,
      autoApproved: true,
      approvalReason: reason
    };
    
    // Update in storage
    this.requests.set(request.id, updatedRequest);
    
    // Emit approval event
    this.emitEvent({
      type: 'request_approved',
      timestamp: new Date(),
      requestId: request.id,
      request: updatedRequest,
      actorId: 'system'
    });
    
    this.logger.info(`Auto-approved request: ${request.id}`, { reason });
  }
  
  /**
   * Auto-reject a request based on rules
   */
  private async autoReject(request: ApprovalRequest, reason: string): Promise<void> {
    const updatedRequest = { ...request };
    
    updatedRequest.status = ApprovalStatus.REJECTED;
    updatedRequest.rejectedAt = new Date();
    updatedRequest.metadata = {
      ...updatedRequest.metadata,
      autoRejected: true,
      rejectionReason: reason
    };
    
    // Update in storage
    this.requests.set(request.id, updatedRequest);
    
    // Emit rejection event
    this.emitEvent({
      type: 'request_rejected',
      timestamp: new Date(),
      requestId: request.id,
      request: updatedRequest,
      actorId: 'system'
    });
    
    this.logger.info(`Auto-rejected request: ${request.id}`, { reason });
  }
  
  /**
   * Emit an approval event to all subscribers
   */
  private emitEvent(event: ApprovalEvent): void {
    for (const callback of this.eventSubscriptions.values()) {
      try {
        callback(event);
      } catch (error) {
        this.logger.error('Error in approval event subscriber', { error });
      }
    }
  }
} 