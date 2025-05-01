/**
 * Team Contract Service
 *
 * Implements team contracts with expected outcomes, role definitions,
 * and accountability tracking for agent performance.
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { AgentRegistryService } from './agent-registry.service';
import { AgentRecruitmentService } from './agent-recruitment.service';
import {
  TeamContract,
  ContractStatus,
  ContractOfferMessage,
  ContractAcceptanceMessage,
  ContractRejectionMessage,
  RecruitmentMessageType,
  PerformanceReportMessage,
} from '../interfaces/recruitment-protocol.interface';
import { EventEmitter } from 'events';

/**
 * Contract event types
 */
export enum ContractEventType {
  CONTRACT_CREATED = 'contract_created',
  CONTRACT_OFFERED = 'contract_offered',
  CONTRACT_ACCEPTED = 'contract_accepted',
  CONTRACT_REJECTED = 'contract_rejected',
  CONTRACT_ACTIVATED = 'contract_activated',
  CONTRACT_COMPLETED = 'contract_completed',
  CONTRACT_TERMINATED = 'contract_terminated',
  CONTRACT_EXPIRED = 'contract_expired',
  CONTRACT_BREACHED = 'contract_breached',
  PERFORMANCE_REPORTED = 'performance_reported',
}

/**
 * Service for managing team contracts
 */
export class TeamContractService {
  private static instance: TeamContractService;
  private logger: Logger;
  private agentRegistry: AgentRegistryService;
  private recruitmentService: AgentRecruitmentService;
  private eventEmitter: EventEmitter;

  // Storage
  private contracts: Map<string, TeamContract> = new Map();
  private contractOffers: Map<string, ContractOfferMessage> = new Map();
  private contractResponses: Map<
    string,
    ContractAcceptanceMessage | ContractRejectionMessage
  > = new Map();
  private performanceReports: Map<string, PerformanceReportMessage[]> =
    new Map();
  private agentContracts: Map<string, string[]> = new Map(); // agentId -> contractIds
  private taskContracts: Map<string, string[]> = new Map(); // taskId -> contractIds

  /**
   * Private constructor (singleton pattern)
   */
  private constructor(
    options: {
      logger?: Logger;
      agentRegistry?: AgentRegistryService;
      recruitmentService?: AgentRecruitmentService;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.agentRegistry =
      options.agentRegistry || AgentRegistryService.getInstance();
    this.recruitmentService =
      options.recruitmentService || AgentRecruitmentService.getInstance();
    this.eventEmitter = new EventEmitter();

    // Start cleanup of expired contracts
    setInterval(() => this.checkContractStatus(), 60000); // Run every minute

    this.logger.info('TeamContractService initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(
    options: {
      logger?: Logger;
      agentRegistry?: AgentRegistryService;
      recruitmentService?: AgentRecruitmentService;
    } = {},
  ): TeamContractService {
    if (!TeamContractService.instance) {
      TeamContractService.instance = new TeamContractService(options);
    }
    return TeamContractService.instance;
  }

  /**
   * Create a new team contract
   */
  public createContract(params: {
    taskId: string;
    teamId: string;
    name: string;
    description: string;
    createdBy: string;
    participants: {
      agentId: string;
      role: string;
      responsibilities: string[];
      requiredCapabilities: string[];
      expectedDeliverables: string[];
      performanceMetrics?: {
        metricName: string;
        target: any;
        weight: number;
      }[];
    }[];
    terms: {
      startTime: number;
      endTime?: number;
      deadline?: number;
      gracePeriod?: number;
      terminationConditions?: string[];
      paymentTerms?: Record<string, any>;
    };
    expectedOutcomes: string[];
    metadata?: Record<string, any>;
  }): TeamContract {
    const id = uuidv4();
    const timestamp = Date.now();

    // Get agent names
    const participants = params.participants.map((p) => {
      const agent = this.agentRegistry.getAgent(p.agentId);
      return {
        ...p,
        agentName: agent?.name || p.agentId,
      };
    });

    // Create contract
    const contract: TeamContract = {
      id,
      type: RecruitmentMessageType.CONTRACT,
      timestamp,
      senderAgentId: params.createdBy,
      recipientAgentId: '', // This will be filled in for specific offers
      taskId: params.taskId,
      teamId: params.teamId,
      contractId: id,
      name: params.name,
      description: params.description,
      status: ContractStatus.OFFERED,
      participants,
      terms: params.terms,
      expectedOutcomes: params.expectedOutcomes,
      createdAt: timestamp,
      createdBy: params.createdBy,
      updatedAt: timestamp,
      metadata: params.metadata || {},
      signatures: [],
      statusHistory: [
        {
          status: ContractStatus.OFFERED,
          timestamp,
          updatedBy: params.createdBy,
        },
      ],
    };

    this.contracts.set(id, contract);

    // Track in task contracts
    this.trackTaskContract(params.taskId, id);

    // Emit event
    this.emitEvent({
      type: ContractEventType.CONTRACT_CREATED,
      contractId: id,
      taskId: params.taskId,
      teamId: params.teamId,
      createdBy: params.createdBy,
      participantCount: participants.length,
      timestamp,
    });

    this.logger.info(`Created team contract ${id} for task ${params.taskId}`);

    return contract;
  }

  /**
   * Create a contract offer message
   */
  public createContractOffer(params: {
    contractId: string;
    senderId: string;
    recipientId: string;
    requiresSignature?: boolean;
    offerExpiresIn?: number; // milliseconds
  }): ContractOfferMessage | null {
    const contract = this.contracts.get(params.contractId);
    if (!contract) {
      this.logger.warn(
        `Attempted to create offer for unknown contract ${params.contractId}`,
      );
      return null;
    }

    const timestamp = Date.now();
    const offerExpiration = params.offerExpiresIn
      ? timestamp + params.offerExpiresIn
      : timestamp + 86400000; // Default 24 hours

    // Create contract offer
    const offer: ContractOfferMessage = {
      id: uuidv4(),
      type: RecruitmentMessageType.CONTRACT_OFFER,
      timestamp,
      senderAgentId: params.senderId,
      recipientAgentId: params.recipientId,
      senderId: params.senderId,
      recipientId: params.recipientId,
      taskId: contract.taskId,
      teamId: contract.teamId,
      contractId: params.contractId,
      offerExpiration,
      requiresSignature: params.requiresSignature || false,
    };

    // Store the offer
    this.contractOffers.set(offer.id, offer);

    // Emit event
    this.emitEvent({
      type: ContractEventType.CONTRACT_OFFERED,
      contractId: params.contractId,
      taskId: contract.taskId,
      teamId: contract.teamId,
      offerId: offer.id,
      senderId: params.senderId,
      recipientId: params.recipientId,
      timestamp,
    });

    this.logger.info(
      `Created contract offer for contract ${params.contractId} to agent ${params.recipientId}`,
    );

    return offer;
  }

  /**
   * Process a contract acceptance message
   */
  public processAcceptance(acceptance: ContractAcceptanceMessage): boolean {
    // Find the contract
    const contractId = acceptance.contractId;
    const contract = this.contracts.get(contractId);

    if (!contract) {
      this.logger.warn(
        `Received acceptance for unknown contract ${contractId}`,
      );
      return false;
    }

    const timestamp = Date.now();

    // Find the participant in the contract
    const participantIndex = contract.participants.findIndex(
      (p) => p.agentId === (acceptance.senderId || acceptance.senderAgentId),
    );

    if (participantIndex === -1) {
      this.logger.warn(
        `Agent ${acceptance.senderId || acceptance.senderAgentId} is not a participant in contract ${contractId}`,
      );
      return false;
    }

    // Store the acceptance
    this.contractResponses.set(acceptance.id, acceptance);

    // Track in agent contracts
    this.trackAgentContract(
      acceptance.senderId || acceptance.senderAgentId,
      contractId,
    );

    // Check if all participants have accepted
    const allAccepted = this.checkAllParticipantsAccepted(contractId);

    if (allAccepted) {
      // Activate the contract
      contract.status = ContractStatus.ACTIVE;
      contract.updatedAt = timestamp;

      this.contracts.set(contractId, contract);

      // Emit activation event
      this.emitEvent({
        type: ContractEventType.CONTRACT_ACTIVATED,
        contractId,
        taskId: contract.taskId,
        teamId: contract.teamId,
        timestamp,
      });

      this.logger.info(
        `Contract ${contractId} activated - all participants accepted`,
      );
    }

    // Emit acceptance event
    this.emitEvent({
      type: ContractEventType.CONTRACT_ACCEPTED,
      contractId,
      taskId: contract.taskId,
      teamId: contract.teamId,
      acceptanceId: acceptance.id,
      agentId: acceptance.senderId || acceptance.senderAgentId,
      timestamp,
    });

    this.logger.info(
      `Processed acceptance for contract ${contractId} from agent ${acceptance.senderId || acceptance.senderAgentId}`,
    );

    return true;
  }

  /**
   * Process a contract rejection message
   */
  public processRejection(rejection: ContractRejectionMessage): boolean {
    // Find the contract
    const contractId = rejection.contractId;
    const contract = this.contracts.get(contractId);

    if (!contract) {
      this.logger.warn(`Received rejection for unknown contract ${contractId}`);
      return false;
    }

    const timestamp = Date.now();

    // Store the rejection
    this.contractResponses.set(rejection.id, rejection);

    // Emit rejection event
    this.emitEvent({
      type: ContractEventType.CONTRACT_REJECTED,
      contractId,
      taskId: contract.taskId,
      teamId: contract.teamId,
      rejectionId: rejection.id,
      agentId: rejection.senderId,
      reason: rejection.reason,
      suggestedModifications: rejection.suggestedModifications,
      timestamp,
    });

    this.logger.info(
      `Processed rejection for contract ${contractId} from agent ${rejection.senderId}: ${rejection.reason}`,
    );

    return true;
  }

  /**
   * Submit a performance report for a contract
   */
  public submitPerformanceReport(report: PerformanceReportMessage): boolean {
    // Find the contract
    const contractId = report.contractId;
    const contract = this.contracts.get(contractId);

    if (!contract) {
      this.logger.warn(
        `Received performance report for unknown contract ${contractId}`,
      );
      return false;
    }

    const timestamp = Date.now();

    // Find the participant in the contract
    const participantIndex = contract.participants.findIndex(
      (p) => p.agentId === report.agentId,
    );

    if (participantIndex === -1) {
      this.logger.warn(
        `Agent ${report.agentId} is not a participant in contract ${contractId}`,
      );
      return false;
    }

    // Store the report
    const reports = this.performanceReports.get(contractId) || [];
    reports.push(report);
    this.performanceReports.set(contractId, reports);

    // Update contract metadata
    contract.metadata = {
      ...contract.metadata,
      lastPerformanceReport: {
        agentId: report.agentId,
        timestamp: report.timestamp,
        overallScore: report.overallScore,
        summary: report.summary,
      },
    };

    contract.updatedAt = timestamp;
    this.contracts.set(contractId, contract);

    // Emit event
    this.emitEvent({
      type: ContractEventType.PERFORMANCE_REPORTED,
      contractId,
      reportId: report.id,
      agentId: report.agentId,
      overallStatus: report.summary?.overallStatus,
      completionPercentage: report.summary?.completionPercentage,
      timestamp: report.timestamp,
    });

    this.logger.info(
      `Processed performance report for contract ${contractId} from agent ${report.agentId}`,
    );

    // Check if contract status needs to be updated based on performance
    if (
      report.summary?.overallStatus === 'failing' &&
      (report.summary?.completionPercentage || 0) < 0.3 &&
      contract.status === ContractStatus.ACTIVE
    ) {
      // Mark contract as at risk of breach
      contract.metadata = {
        ...contract.metadata,
        riskLevel: 'high',
        riskReason: 'Poor performance report indicating possible breach',
      };

      contract.updatedAt = timestamp;
      this.contracts.set(contractId, contract);

      this.logger.warn(
        `Contract ${contractId} marked as high risk due to poor performance`,
      );
    }

    return true;
  }

  /**
   * Complete a contract
   */
  public completeContract(
    contractId: string,
    details?: Record<string, any>,
  ): boolean {
    const contract = this.contracts.get(contractId);

    if (!contract) {
      this.logger.warn(`Attempted to complete unknown contract ${contractId}`);
      return false;
    }

    if (contract.status !== ContractStatus.ACTIVE) {
      this.logger.warn(
        `Cannot complete contract ${contractId} with status ${contract.status}`,
      );
      return false;
    }

    const timestamp = Date.now();

    // Update contract status
    contract.status = ContractStatus.COMPLETED;
    contract.updatedAt = timestamp;

    if (details) {
      contract.metadata = {
        ...contract.metadata,
        completionDetails: details,
      };
    }

    this.contracts.set(contractId, contract);

    // Emit event
    this.emitEvent({
      type: ContractEventType.CONTRACT_COMPLETED,
      contractId,
      taskId: contract.taskId,
      teamId: contract.teamId,
      timestamp,
    });

    this.logger.info(`Contract ${contractId} marked as completed`);

    return true;
  }

  /**
   * Terminate a contract
   */
  public terminateContract(
    contractId: string,
    reason: string,
    terminatedBy: string,
  ): boolean {
    const contract = this.contracts.get(contractId);

    if (!contract) {
      this.logger.warn(`Attempted to terminate unknown contract ${contractId}`);
      return false;
    }

    if (contract.status !== ContractStatus.ACTIVE) {
      this.logger.warn(
        `Cannot terminate contract ${contractId} with status ${contract.status}`,
      );
      return false;
    }

    const timestamp = Date.now();

    // Update contract status
    contract.status = ContractStatus.TERMINATED;
    contract.updatedAt = timestamp;
    contract.metadata = {
      ...contract.metadata,
      terminationReason: reason,
      terminatedBy,
      terminationTimestamp: timestamp,
    };

    this.contracts.set(contractId, contract);

    // Emit event
    this.emitEvent({
      type: ContractEventType.CONTRACT_TERMINATED,
      contractId,
      taskId: contract.taskId,
      teamId: contract.teamId,
      reason,
      terminatedBy,
      timestamp,
    });

    this.logger.info(`Contract ${contractId} terminated: ${reason}`);

    return true;
  }

  /**
   * Check if all participants have accepted a contract
   */
  private checkAllParticipantsAccepted(contractId: string): boolean {
    const contract = this.contracts.get(contractId);
    if (!contract) return false;

    // Get all acceptance responses for this contract
    const acceptances = Array.from(this.contractResponses.values()).filter(
      (r) =>
        r.type === RecruitmentMessageType.CONTRACT_ACCEPTANCE &&
        r.contractId === contractId,
    ) as ContractAcceptanceMessage[];

    // Check if all participants have accepted
    const participantIds = new Set(contract.participants.map((p) => p.agentId));
    const acceptedIds = new Set(acceptances.map((a) => a.senderId));

    // Check if every participant has accepted
    return Array.from(participantIds).every((id) => acceptedIds.has(id));
  }

  /**
   * Track a contract for a task
   */
  private trackTaskContract(taskId: string, contractId: string): void {
    const contracts = this.taskContracts.get(taskId) || [];
    contracts.push(contractId);
    this.taskContracts.set(taskId, contracts);
  }

  /**
   * Track a contract for an agent
   */
  private trackAgentContract(agentId: string, contractId: string): void {
    const contracts = this.agentContracts.get(agentId) || [];
    contracts.push(contractId);
    this.agentContracts.set(agentId, contracts);
  }

  /**
   * Get a contract by ID
   */
  public getContract(contractId: string): TeamContract | null {
    return this.contracts.get(contractId) || null;
  }

  /**
   * Get all contracts for a task
   */
  public getTaskContracts(taskId: string): TeamContract[] {
    const contractIds = this.taskContracts.get(taskId) || [];
    return contractIds
      .map((id) => this.contracts.get(id))
      .filter((contract) => contract !== undefined) as TeamContract[];
  }

  /**
   * Get all contracts for an agent
   */
  public getAgentContracts(agentId: string): TeamContract[] {
    const contractIds = this.agentContracts.get(agentId) || [];
    return contractIds
      .map((id) => this.contracts.get(id))
      .filter((contract) => contract !== undefined) as TeamContract[];
  }

  /**
   * Get performance reports for a contract
   */
  public getContractPerformanceReports(
    contractId: string,
  ): PerformanceReportMessage[] {
    return this.performanceReports.get(contractId) || [];
  }

  /**
   * Get performance reports for an agent
   */
  public getAgentPerformanceReports(
    agentId: string,
  ): PerformanceReportMessage[] {
    const reports: PerformanceReportMessage[] = [];

    for (const contractReports of this.performanceReports.values()) {
      for (const report of contractReports) {
        if (report.agentId === agentId) {
          reports.push(report);
        }
      }
    }

    return reports;
  }

  /**
   * Check contract status and update expired contracts
   */
  private checkContractStatus(): void {
    const now = Date.now();

    for (const [id, contract] of this.contracts.entries()) {
      // Check for expired active contracts
      if (
        contract.status === ContractStatus.ACTIVE &&
        contract.terms.deadline &&
        now > contract.terms.deadline
      ) {
        // Check if there's a grace period
        const gracePeriod = contract.terms.gracePeriod || 0;
        if (now > contract.terms.deadline + gracePeriod) {
          // Mark as expired
          contract.status = ContractStatus.EXPIRED;
          contract.updatedAt = now;

          this.contracts.set(id, contract);

          // Emit event
          this.emitEvent({
            type: ContractEventType.CONTRACT_EXPIRED,
            contractId: id,
            taskId: contract.taskId,
            teamId: contract.teamId,
            timestamp: now,
          });

          this.logger.info(`Contract ${id} marked as expired`);
        }
      }

      // Check for expired offers
      const offers = Array.from(this.contractOffers.values()).filter(
        (offer) => offer.contractId === id,
      );

      for (const offer of offers) {
        if (offer.offerExpiration && offer.offerExpiration < now) {
          // Remove expired offer
          this.contractOffers.delete(offer.id);

          this.logger.info(
            `Contract offer ${offer.id} for contract ${id} expired`,
          );
        }
      }
    }
  }

  /**
   * Subscribe to contract events
   */
  public subscribeToEvents(
    callback: (event: any) => void,
    eventTypes?: ContractEventType[],
  ): string {
    const subscriptionId = uuidv4();

    const listener = (event: any) => {
      if (!eventTypes || eventTypes.includes(event.type)) {
        callback(event);
      }
    };

    this.eventEmitter.on('contract_event', listener);

    return subscriptionId;
  }

  /**
   * Emit a contract event
   */
  private emitEvent(event: any): void {
    this.eventEmitter.emit('contract_event', event);
  }
}
