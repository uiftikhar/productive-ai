/**
 * Capability Negotiation Service
 *
 * Implements communication protocol for capability verification and negotiation
 * between agents.
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import {
  CapabilityInquiryMessage,
  CapabilityInquiryResponseMessage,
  CapabilityNegotiationMessage,
  CapabilityRegistry,
} from '../interfaces/capability-discovery.interface';
import { CapabilityRegistryService } from './capability-registry.service';

/**
 * Result of a capability negotiation
 */
interface NegotiationResult {
  success: boolean;
  availableProviders: string[];
  unavailableProviders: string[];
  selectedProvider?: string;
  message?: string;
  expiresAt?: number;
}

/**
 * Manages capability negotiation between agents
 */
export class CapabilityNegotiationService {
  private static instance: CapabilityNegotiationService;
  private logger: Logger;
  private registry: CapabilityRegistry;
  private pendingInquiries: Map<string, {
    inquiry: CapabilityInquiryMessage;
    responses: CapabilityInquiryResponseMessage[];
    expiresAt: number;
  }> = new Map();

  /**
   * Private constructor (singleton pattern)
   */
  private constructor(options: {
    logger?: Logger;
    registry?: CapabilityRegistry;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.registry = options.registry || CapabilityRegistryService.getInstance();
    
    // Start cleanup of expired inquiries
    setInterval(() => this.cleanupExpiredInquiries(), 60000); // Run every minute
    
    this.logger.info('CapabilityNegotiationService initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(options: {
    logger?: Logger;
    registry?: CapabilityRegistry;
  } = {}): CapabilityNegotiationService {
    if (!CapabilityNegotiationService.instance) {
      CapabilityNegotiationService.instance = new CapabilityNegotiationService(options);
    }
    return CapabilityNegotiationService.instance;
  }

  /**
   * Create a capability inquiry to send to potential provider agents
   */
  public createCapabilityInquiry(params: {
    fromAgentId: string;
    capability: string;
    context?: Record<string, any>;
    teamContext?: {
      taskId?: string;
      teamId?: string;
      requiredCapabilities?: string[];
      role?: string;
    };
    priority?: 'low' | 'medium' | 'high';
    responseDeadlineMs?: number;
  }): CapabilityInquiryMessage {
    const { 
      fromAgentId, 
      capability,
      context,
      teamContext,
      priority = 'medium',
      responseDeadlineMs = 30000, // Default 30s
    } = params;
    
    const inquiryId = uuidv4();
    const responseDeadline = Date.now() + responseDeadlineMs;
    
    const inquiry: CapabilityInquiryMessage = {
      messageType: 'capability_inquiry',
      inquiryId,
      fromAgentId,
      capability,
      context,
      teamContext,
      priority,
      responseDeadline,
    };
    
    // Store the inquiry
    this.pendingInquiries.set(inquiryId, {
      inquiry,
      responses: [],
      expiresAt: responseDeadline,
    });
    
    this.logger.info(`Created capability inquiry ${inquiryId} for ${capability}`);
    
    return inquiry;
  }

  /**
   * Process a capability inquiry response from a provider agent
   */
  public processInquiryResponse(response: CapabilityInquiryResponseMessage): boolean {
    const { inquiryId } = response;
    
    const pendingInquiry = this.pendingInquiries.get(inquiryId);
    if (!pendingInquiry) {
      this.logger.warn(`Received response for unknown inquiry ${inquiryId}`);
      return false;
    }
    
    // Check if expired
    if (Date.now() > pendingInquiry.expiresAt) {
      this.logger.warn(`Received response for expired inquiry ${inquiryId}`);
      return false;
    }
    
    // Add response
    pendingInquiry.responses.push(response);
    this.logger.info(`Processed response for inquiry ${inquiryId} from ${response.fromAgentId}`);
    
    return true;
  }

  /**
   * Get results of a capability negotiation process
   */
  public getNegotiationResult(inquiryId: string): NegotiationResult | null {
    const pendingInquiry = this.pendingInquiries.get(inquiryId);
    if (!pendingInquiry) {
      this.logger.warn(`Attempted to get results for unknown inquiry ${inquiryId}`);
      return null;
    }
    
    const { inquiry, responses, expiresAt } = pendingInquiry;
    const isExpired = Date.now() > expiresAt;
    
    // Extract available and unavailable providers
    const availableProviders = responses
      .filter(r => r.available)
      .map(r => r.fromAgentId);
    
    const unavailableProviders = responses
      .filter(r => !r.available)
      .map(r => r.fromAgentId);
    
    // Select best provider based on confidence and commitment
    let selectedProvider: string | undefined;
    if (availableProviders.length > 0) {
      // Find the response with the highest confidence
      const bestResponse = responses
        .filter(r => r.available)
        .sort((a, b) => {
          // Sort by commitment level first
          const commitmentScore = (commitment: string | undefined): number => {
            if (!commitment) return 0;
            if (commitment === 'guaranteed') return 2;
            if (commitment === 'firm') return 1;
            return 0;
          };
          
          const aCommitmentScore = commitmentScore(a.commitmentLevel);
          const bCommitmentScore = commitmentScore(b.commitmentLevel);
          
          if (aCommitmentScore !== bCommitmentScore) {
            return bCommitmentScore - aCommitmentScore;
          }
          
          // Then by confidence
          return b.confidenceLevel - a.confidenceLevel;
        })[0];
      
      selectedProvider = bestResponse?.fromAgentId;
    }
    
    // Construct result
    const result: NegotiationResult = {
      success: availableProviders.length > 0,
      availableProviders,
      unavailableProviders,
      selectedProvider,
      expiresAt,
      message: selectedProvider
        ? `Selected provider ${selectedProvider} for capability ${inquiry.capability}`
        : `No available providers for capability ${inquiry.capability}`
    };
    
    this.logger.info(`Negotiation result for ${inquiryId}: ${result.success ? 'success' : 'failure'}`);
    
    return result;
  }

  /**
   * Create a capability inquiry response message
   */
  public createInquiryResponse(params: {
    inquiryId: string;
    fromAgentId: string;
    available: boolean;
    confidenceLevel: number;
    estimatedCompletion?: number;
    constraints?: string[];
    alternativeCapabilities?: string[];
    commitmentLevel?: 'tentative' | 'firm' | 'guaranteed';
  }): CapabilityInquiryResponseMessage {
    const {
      inquiryId,
      fromAgentId,
      available,
      confidenceLevel,
      estimatedCompletion,
      constraints,
      alternativeCapabilities,
      commitmentLevel,
    } = params;
    
    const response: CapabilityInquiryResponseMessage = {
      messageType: 'capability_inquiry_response',
      inquiryId,
      fromAgentId,
      available,
      confidenceLevel,
      estimatedCompletion,
      constraints,
      alternativeCapabilities,
      commitmentLevel,
    };
    
    this.logger.info(`Created inquiry response for ${inquiryId} from ${fromAgentId}`);
    
    return response;
  }

  /**
   * Broadcast a capability inquiry to potential providers
   */
  public async broadcastInquiry(inquiry: CapabilityInquiryMessage, providerIds: string[]): Promise<string[]> {
    if (providerIds.length === 0) {
      this.logger.warn(`No providers specified for inquiry ${inquiry.inquiryId}`);
      return [];
    }
    
    // In a real implementation, this would send the message to the specified agents
    // For now, just log that we would send it
    const sentTo: string[] = [];
    
    for (const providerId of providerIds) {
      try {
        // Simulate sending the message
        this.logger.info(`Would send inquiry ${inquiry.inquiryId} to ${providerId}`);
        sentTo.push(providerId);
      } catch (error) {
        this.logger.error(`Failed to send inquiry to ${providerId}`, { error });
      }
    }
    
    return sentTo;
  }

  /**
   * Clean up expired inquiries
   * @private
   */
  private cleanupExpiredInquiries(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [inquiryId, { expiresAt }] of this.pendingInquiries.entries()) {
      if (now > expiresAt) {
        this.pendingInquiries.delete(inquiryId);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      this.logger.info(`Cleaned up ${expiredCount} expired inquiries`);
    }
  }
} 