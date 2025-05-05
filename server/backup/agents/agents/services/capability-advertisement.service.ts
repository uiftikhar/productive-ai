/**
 * Capability Advertisement Service
 *
 * Implements capability broadcasting mechanism and confidence-based capability advertisements
 * as part of Milestone 3's capability advertising system.
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { AgentRegistryService } from './agent-registry.service';
import {
  CapabilityAdvertisementMessage,
  RecruitmentMessageType,
  ConfidenceLevel,
  ConfidenceScore,
} from '../interfaces/recruitment-protocol.interface';
import { EventEmitter } from 'events';

/**
 * Events emitted by the capability advertisement service
 */
export enum AdvertisementEventType {
  ADVERTISEMENT_BROADCAST = 'advertisement_broadcast',
  ADVERTISEMENT_UPDATED = 'advertisement_updated',
  ADVERTISEMENT_EXPIRED = 'advertisement_expired',
  CAPABILITY_ADDED = 'capability_added',
  CAPABILITY_REMOVED = 'capability_removed',
  CAPABILITY_UPDATED = 'capability_updated',
}

/**
 * Service for managing capability advertisements and broadcasting
 */
export class CapabilityAdvertisementService {
  private static instance: CapabilityAdvertisementService;
  private logger: Logger;
  private agentRegistry: AgentRegistryService;
  private eventEmitter: EventEmitter;

  // Storage
  private advertisements: Map<string, CapabilityAdvertisementMessage> =
    new Map();
  private agentAdvertisements: Map<string, string[]> = new Map(); // agentId -> advertisementIds
  private capabilityProviders: Map<string, Set<string>> = new Map(); // capability -> Set of agentIds

  /**
   * Private constructor (singleton pattern)
   */
  private constructor(
    options: {
      logger?: Logger;
      agentRegistry?: AgentRegistryService;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.agentRegistry =
      options.agentRegistry || AgentRegistryService.getInstance();
    this.eventEmitter = new EventEmitter();

    // Start cleanup of expired advertisements
    setInterval(() => this.cleanupExpiredAdvertisements(), 60000); // Run every minute

    this.logger.info('CapabilityAdvertisementService initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(
    options: {
      logger?: Logger;
      agentRegistry?: AgentRegistryService;
    } = {},
  ): CapabilityAdvertisementService {
    if (!CapabilityAdvertisementService.instance) {
      CapabilityAdvertisementService.instance =
        new CapabilityAdvertisementService(options);
    }
    return CapabilityAdvertisementService.instance;
  }

  /**
   * Create and broadcast a capability advertisement
   */
  public createAdvertisement(params: {
    agentId: string;
    agentName?: string;
    capabilities: {
      name: string;
      description: string;
      confidenceLevel: ConfidenceLevel;
      confidenceScore: ConfidenceScore;
      experience: number;
      specializations?: string[];
      contexts?: string[];
      limitations?: string[];
      recentPerformance?: {
        successRate: number;
        averageExecutionTime: number;
        timestamp: number;
      };
    }[];
    availability: {
      status: 'available' | 'limited' | 'unavailable';
      currentLoad: number;
      nextAvailableSlot?: number;
    };
    validityDuration?: number; // milliseconds
    broadcastTo?: string[]; // specific agent IDs to broadcast to
  }): CapabilityAdvertisementMessage {
    const id = uuidv4();
    const timestamp = Date.now();
    const validUntil = timestamp + (params.validityDuration || 3600000); // Default 1 hour

    const advertisement: CapabilityAdvertisementMessage = {
      id,
      type: RecruitmentMessageType.CAPABILITY_ADVERTISEMENT,
      timestamp,
      senderId: params.agentId,
      senderName: params.agentName,
      capabilities: params.capabilities,
      availability: params.availability,
      validUntil,
    };

    // Store the advertisement
    this.advertisements.set(id, advertisement);

    // Track in agent's advertisements
    this.trackAgentAdvertisement(params.agentId, id);

    // Update capability providers index
    this.updateCapabilityProviders(
      params.agentId,
      params.capabilities.map((c) => c.name),
    );

    // Emit event
    this.emitEvent({
      type: AdvertisementEventType.ADVERTISEMENT_BROADCAST,
      advertisementId: id,
      agentId: params.agentId,
      capabilities: params.capabilities.map((c) => c.name),
      timestamp,
    });

    this.logger.info(
      `Created and broadcast capability advertisement ${id} for agent ${params.agentId}`,
    );

    return advertisement;
  }

  /**
   * Update an existing capability advertisement
   */
  public updateAdvertisement(
    advertisementId: string,
    updates: Partial<
      Omit<
        CapabilityAdvertisementMessage,
        'id' | 'type' | 'timestamp' | 'senderId'
      >
    >,
  ): CapabilityAdvertisementMessage | null {
    const advertisement = this.advertisements.get(advertisementId);
    if (!advertisement) {
      this.logger.warn(
        `Attempted to update non-existent advertisement ${advertisementId}`,
      );
      return null;
    }

    const timestamp = Date.now();

    // Check if advertisement is expired
    if (advertisement.validUntil < timestamp) {
      this.logger.warn(
        `Attempted to update expired advertisement ${advertisementId}`,
      );
      return null;
    }

    // Save old capabilities for comparison
    const oldCapabilities = advertisement.capabilities.map((c) => c.name);

    // Apply updates
    if (updates.capabilities) {
      advertisement.capabilities = updates.capabilities;
    }

    if (updates.availability) {
      advertisement.availability = updates.availability;
    }

    if (updates.validUntil) {
      advertisement.validUntil = updates.validUntil;
    }

    if (updates.senderName) {
      advertisement.senderName = updates.senderName;
    }

    if (updates.metadata) {
      advertisement.metadata = updates.metadata;
    }

    // Update timestamp
    const updatedAdvertisement: CapabilityAdvertisementMessage = {
      ...advertisement,
      timestamp,
    };

    this.advertisements.set(advertisementId, updatedAdvertisement);

    // Update capability providers index if capabilities changed
    if (updates.capabilities) {
      const newCapabilities = updates.capabilities.map((c) => c.name);
      this.updateCapabilityProviders(
        advertisement.senderId,
        newCapabilities,
        oldCapabilities,
      );
    }

    // Emit event
    this.emitEvent({
      type: AdvertisementEventType.ADVERTISEMENT_UPDATED,
      advertisementId,
      agentId: advertisement.senderId,
      capabilities: updatedAdvertisement.capabilities.map((c) => c.name),
      timestamp,
    });

    this.logger.info(
      `Updated capability advertisement ${advertisementId} for agent ${advertisement.senderId}`,
    );

    return updatedAdvertisement;
  }

  /**
   * Track an advertisement for an agent
   */
  private trackAgentAdvertisement(
    agentId: string,
    advertisementId: string,
  ): void {
    const advertisements = this.agentAdvertisements.get(agentId) || [];
    advertisements.push(advertisementId);
    this.agentAdvertisements.set(agentId, advertisements);
  }

  /**
   * Update capability providers index
   */
  private updateCapabilityProviders(
    agentId: string,
    capabilities: string[],
    previousCapabilities?: string[],
  ): void {
    // Remove agent from previous capabilities
    if (previousCapabilities) {
      for (const capability of previousCapabilities) {
        const providers = this.capabilityProviders.get(capability);
        if (providers) {
          providers.delete(agentId);

          // If no more providers, delete the capability entry
          if (providers.size === 0) {
            this.capabilityProviders.delete(capability);
          } else {
            this.capabilityProviders.set(capability, providers);
          }

          // Emit event
          this.emitEvent({
            type: AdvertisementEventType.CAPABILITY_REMOVED,
            capability,
            agentId,
            timestamp: Date.now(),
          });
        }
      }
    }

    // Add agent to new capabilities
    for (const capability of capabilities) {
      const providers =
        this.capabilityProviders.get(capability) || new Set<string>();

      // Check if this is a new capability for the agent
      const isNewCapability = previousCapabilities
        ? !previousCapabilities.includes(capability)
        : true;

      providers.add(agentId);
      this.capabilityProviders.set(capability, providers);

      // Emit appropriate event
      if (isNewCapability) {
        this.emitEvent({
          type: AdvertisementEventType.CAPABILITY_ADDED,
          capability,
          agentId,
          timestamp: Date.now(),
        });
      } else {
        this.emitEvent({
          type: AdvertisementEventType.CAPABILITY_UPDATED,
          capability,
          agentId,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Get all advertisements for an agent
   */
  public getAgentAdvertisements(
    agentId: string,
  ): CapabilityAdvertisementMessage[] {
    const advertisementIds = this.agentAdvertisements.get(agentId) || [];
    return advertisementIds
      .map((id) => this.advertisements.get(id))
      .filter(
        (ad) => ad !== undefined && ad.validUntil > Date.now(),
      ) as CapabilityAdvertisementMessage[];
  }

  /**
   * Find agents with a specific capability
   */
  public findCapabilityProviders(
    capability: string,
    minConfidence?: ConfidenceScore,
    availabilityFilter?: 'available' | 'limited' | 'any',
  ): {
    agentId: string;
    advertisement: CapabilityAdvertisementMessage;
    capability: {
      name: string;
      confidenceLevel: ConfidenceLevel;
      confidenceScore: ConfidenceScore;
    };
  }[] {
    const providers = this.capabilityProviders.get(capability);
    if (!providers || providers.size === 0) {
      return [];
    }

    const now = Date.now();
    const results: {
      agentId: string;
      advertisement: CapabilityAdvertisementMessage;
      capability: {
        name: string;
        confidenceLevel: ConfidenceLevel;
        confidenceScore: ConfidenceScore;
      };
    }[] = [];

    // Check each provider's advertisements
    for (const agentId of providers) {
      const advertisementIds = this.agentAdvertisements.get(agentId) || [];

      // Find the most recent valid advertisement
      let mostRecentAd: CapabilityAdvertisementMessage | undefined;
      let mostRecentTimestamp = 0;

      for (const adId of advertisementIds) {
        const ad = this.advertisements.get(adId);
        if (ad && ad.validUntil > now && ad.timestamp > mostRecentTimestamp) {
          mostRecentAd = ad;
          mostRecentTimestamp = ad.timestamp;
        }
      }

      if (mostRecentAd) {
        // Find the capability in the advertisement
        const capabilityData = mostRecentAd.capabilities.find(
          (c) => c.name === capability,
        );

        if (capabilityData) {
          // Apply confidence filter
          if (
            minConfidence !== undefined &&
            capabilityData.confidenceScore < minConfidence
          ) {
            continue;
          }

          // Apply availability filter
          if (availabilityFilter) {
            if (
              availabilityFilter === 'available' &&
              mostRecentAd.availability.status !== 'available'
            ) {
              continue;
            }

            if (
              availabilityFilter === 'limited' &&
              mostRecentAd.availability.status === 'unavailable'
            ) {
              continue;
            }
          }

          results.push({
            agentId,
            advertisement: mostRecentAd,
            capability: {
              name: capabilityData.name,
              confidenceLevel: capabilityData.confidenceLevel,
              confidenceScore: capabilityData.confidenceScore,
            },
          });
        }
      }
    }

    return results;
  }

  /**
   * Clean up expired advertisements
   */
  private cleanupExpiredAdvertisements(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [id, advertisement] of this.advertisements.entries()) {
      if (advertisement.validUntil < now) {
        // Remove from agent advertisements
        const agentId = advertisement.senderId;
        const agentAds = this.agentAdvertisements.get(agentId) || [];
        const updatedAgentAds = agentAds.filter((adId) => adId !== id);
        this.agentAdvertisements.set(agentId, updatedAgentAds);

        // Emit event
        this.emitEvent({
          type: AdvertisementEventType.ADVERTISEMENT_EXPIRED,
          advertisementId: id,
          agentId,
          timestamp: now,
        });

        // Don't actually delete the advertisement, just let it expire
        // This keeps a history of past advertisements
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      this.logger.info(`Cleaned up ${expiredCount} expired advertisements`);
    }
  }

  /**
   * Subscribe to advertisement events
   */
  public subscribeToEvents(
    callback: (event: any) => void,
    eventTypes?: AdvertisementEventType[],
  ): string {
    const subscriptionId = uuidv4();

    const listener = (event: any) => {
      if (!eventTypes || eventTypes.includes(event.type)) {
        callback(event);
      }
    };

    this.eventEmitter.on('advertisement_event', listener);

    return subscriptionId;
  }

  /**
   * Emit an advertisement event
   */
  private emitEvent(event: any): void {
    this.eventEmitter.emit('advertisement_event', event);
  }
}
