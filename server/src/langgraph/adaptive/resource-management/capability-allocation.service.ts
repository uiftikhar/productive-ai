import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  AgentAvailabilityStatus,
  CapabilityAllocationService as ICapabilityAllocationService,
  CapabilityLevel,
  Resource,
  ResourceAllocation,
  ResourceAllocationRequest,
} from '../interfaces/resource-management.interface';
import { AgentAvailabilityService } from './agent-availability.service';

/**
 * Implementation of the capability-based resource allocation service
 */
export class CapabilityAllocationServiceImpl
  implements ICapabilityAllocationService
{
  private logger: Logger;
  private availabilityService: AgentAvailabilityService;
  private allocations: Map<string, ResourceAllocation> = new Map(); // taskId -> allocation
  private resourceAllocations: Map<string, Set<string>> = new Map(); // resourceId -> set of taskIds
  private allocationHistory: ResourceAllocation[] = [];
  private allocationScoreThreshold = 0.6; // Minimum acceptable allocation score

  constructor(
    options: {
      logger?: Logger;
      availabilityService?: AgentAvailabilityService;
      allocationScoreThreshold?: number;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.availabilityService =
      options.availabilityService ||
      new AgentAvailabilityService({ logger: this.logger });

    if (options.allocationScoreThreshold !== undefined) {
      this.allocationScoreThreshold = options.allocationScoreThreshold;
    }

    this.logger.info('Capability allocation service initialized', {
      allocationScoreThreshold: this.allocationScoreThreshold,
    });
  }

  /**
   * Allocate resources for a task
   */
  allocateResources(request: ResourceAllocationRequest): ResourceAllocation {
    this.logger.info(
      `Resource allocation requested for task ${request.taskId}`,
      {
        taskId: request.taskId,
        requiredCapabilities: request.requiredCapabilities.map(
          (c) => c.capabilityId,
        ),
        priority: request.priority,
      },
    );

    // Determine which capabilities are essential
    const essentialCapabilities = request.requiredCapabilities
      .filter((cap) => cap.essential)
      .map((cap) => cap.capabilityId);

    // Create maps to track best resources for each capability
    const capabilityAllocation: Map<string, string[]> = new Map();
    const unallocatedCapabilities: string[] = [];
    const allocationQuality: Map<string, number> = new Map();

    // Process each required capability
    for (const capability of request.requiredCapabilities) {
      // Find available resources with this capability
      let resources = this.availabilityService.getResourcesByCapability(
        capability.capabilityId,
        capability.minimumLevel,
      );

      // Filter by availability status
      resources = resources.filter(
        (r) =>
          r.currentStatus === AgentAvailabilityStatus.AVAILABLE ||
          r.currentStatus === AgentAvailabilityStatus.BUSY,
      );

      // Filter by excluded resources
      if (request.excludedResources && request.excludedResources.length > 0) {
        resources = resources.filter(
          (r) => !request.excludedResources!.includes(r.id),
        );
      }

      // Prioritize preferred resources
      if (request.preferredResources && request.preferredResources.length > 0) {
        resources.sort((a, b) => {
          const aPreferred = request.preferredResources!.includes(a.id) ? 1 : 0;
          const bPreferred = request.preferredResources!.includes(b.id) ? 1 : 0;
          return bPreferred - aPreferred;
        });
      }

      // Sort by load (less loaded first)
      resources.sort((a, b) => a.currentLoad - b.currentLoad);

      // Additional sorting by capability level if specified
      if (capability.preferredLevel) {
        resources.sort((a, b) => {
          const aCapability = a.capabilities.find(
            (c) => c.id === capability.capabilityId,
          );
          const bCapability = b.capabilities.find(
            (c) => c.id === capability.capabilityId,
          );

          if (!aCapability || !bCapability) return 0;

          // Calculate distance from preferred level (enum ordinal)
          const levels = Object.values(CapabilityLevel);
          const preferredIndex = levels.indexOf(capability.preferredLevel!);
          const aIndex = levels.indexOf(aCapability.level);
          const bIndex = levels.indexOf(bCapability.level);

          // Calculate distance (smaller is better)
          const aDist = Math.abs(preferredIndex - aIndex);
          const bDist = Math.abs(preferredIndex - bIndex);

          return aDist - bDist;
        });
      }

      // If we found resources
      if (resources.length > 0) {
        // Get the best resource
        const bestResource = resources[0];

        // Add to allocation map
        if (!capabilityAllocation.has(bestResource.id)) {
          capabilityAllocation.set(bestResource.id, []);
        }
        capabilityAllocation
          .get(bestResource.id)
          ?.push(capability.capabilityId);

        // Calculate quality score for this allocation (0-1)
        const capabilityResource = bestResource.capabilities.find(
          (c) => c.id === capability.capabilityId,
        );

        if (capabilityResource) {
          const levelQuality = capability.preferredLevel
            ? this.calculateLevelMatchQuality(
                capabilityResource.level,
                capability.preferredLevel,
              )
            : 1.0;

          const loadQuality = 1.0 - bestResource.currentLoad;

          // Combined quality (70% level match, 30% load)
          const qualityScore = levelQuality * 0.7 + loadQuality * 0.3;
          allocationQuality.set(capability.capabilityId, qualityScore);
        }
      } else {
        // No resources available for this capability
        unallocatedCapabilities.push(capability.capabilityId);

        // If this is an essential capability, we have a problem
        if (capability.essential) {
          this.logger.warn(
            `Essential capability ${capability.capabilityId} could not be allocated for task ${request.taskId}`,
          );
        }
      }
    }

    // Check if all essential capabilities were allocated
    const failedEssentials = essentialCapabilities.filter((cap) =>
      unallocatedCapabilities.includes(cap),
    );

    if (failedEssentials.length > 0) {
      this.logger.error(
        `Failed to allocate essential capabilities for task ${request.taskId}`,
        {
          taskId: request.taskId,
          failedCapabilities: failedEssentials,
        },
      );
    }

    // Calculate overall allocation quality
    const allocatedCapabilities = request.requiredCapabilities
      .map((c) => c.capabilityId)
      .filter((c) => !unallocatedCapabilities.includes(c));

    const overallQuality =
      allocatedCapabilities.length > 0
        ? allocatedCapabilities.reduce(
            (sum, capId) => sum + (allocationQuality.get(capId) || 0),
            0,
          ) / allocatedCapabilities.length
        : 0;

    // Create the allocation result
    const now = new Date();
    // Estimate task duration in minutes, or use a default of 10 minutes
    const estimatedDurationMs = request.estimatedDuration || 10 * 60 * 1000;

    // Create allocated resources array
    const allocated = Array.from(capabilityAllocation.entries()).map(
      ([resourceId, capabilities]) => ({
        resourceId,
        capabilities,
        estimatedStartTime: now,
        estimatedEndTime: new Date(now.getTime() + estimatedDurationMs),
      }),
    );

    // Create allocation object
    const allocation: ResourceAllocation = {
      taskId: request.taskId,
      allocated,
      unallocatedCapabilities,
      allocationQuality: overallQuality,
      allocationTime: now,
    };

    // Update resources with tasks
    for (const { resourceId } of allocated) {
      this.availabilityService.addTaskToResource(resourceId, request.taskId);

      // Track which resources are allocated to which tasks
      if (!this.resourceAllocations.has(resourceId)) {
        this.resourceAllocations.set(resourceId, new Set<string>());
      }
      this.resourceAllocations.get(resourceId)?.add(request.taskId);
    }

    // Store the allocation
    this.allocations.set(request.taskId, allocation);

    // Add to history
    this.allocationHistory.push(allocation);

    this.logger.info(
      `Resource allocation completed for task ${request.taskId}`,
      {
        taskId: request.taskId,
        resourceCount: allocated.length,
        unallocatedCount: unallocatedCapabilities.length,
        quality: overallQuality,
      },
    );

    return allocation;
  }

  /**
   * Release resources allocated to a task
   */
  releaseResources(taskId: string): boolean {
    const allocation = this.allocations.get(taskId);
    if (!allocation) {
      this.logger.warn(`No allocation found for task ${taskId}`);
      return false;
    }

    // Remove task from resources
    for (const { resourceId } of allocation.allocated) {
      this.availabilityService.removeTaskFromResource(resourceId, taskId);

      // Remove from tracking map
      const tasks = this.resourceAllocations.get(resourceId);
      if (tasks) {
        tasks.delete(taskId);
        if (tasks.size === 0) {
          this.resourceAllocations.delete(resourceId);
        }
      }
    }

    // Remove allocation
    this.allocations.delete(taskId);

    this.logger.info(`Resources released for task ${taskId}`, {
      taskId,
      resourceCount: allocation.allocated.length,
    });

    return true;
  }

  /**
   * Update an existing allocation
   */
  updateAllocation(
    taskId: string,
    updatedRequest: Partial<ResourceAllocationRequest>,
  ): ResourceAllocation {
    // Get current allocation
    const currentAllocation = this.allocations.get(taskId);

    if (!currentAllocation) {
      // No current allocation, create a new one
      if (!updatedRequest.taskId) {
        updatedRequest.taskId = taskId;
      }

      return this.allocateResources(
        updatedRequest as ResourceAllocationRequest,
      );
    }

    // Release current resources
    this.releaseResources(taskId);

    // Create new request by merging current with updates
    const originalRequest = this.findOriginalRequest(taskId);

    const newRequest: ResourceAllocationRequest = {
      ...originalRequest,
      ...updatedRequest,
      taskId,
    };

    // Allocate with new request
    return this.allocateResources(newRequest);
  }

  /**
   * Find the original allocation request from history
   */
  private findOriginalRequest(taskId: string): ResourceAllocationRequest {
    // This is a simplified implementation that reconstructs a partial request
    // In a real implementation, you would store the original requests

    // Default request
    const defaultRequest: ResourceAllocationRequest = {
      taskId,
      requiredCapabilities: [],
      priority: 5,
      estimatedDuration: 10 * 60 * 1000, // 10 minutes
    };

    // Find the allocation in history
    const allocation = this.allocationHistory.find((a) => a.taskId === taskId);
    if (!allocation) {
      return defaultRequest;
    }

    // Reconstruct capabilities from allocated and unallocated
    const capabilities = new Set<string>();

    // Add allocated capabilities
    for (const { capabilities: caps } of allocation.allocated) {
      caps.forEach((cap) => capabilities.add(cap));
    }

    // Add unallocated capabilities
    allocation.unallocatedCapabilities.forEach((cap) => capabilities.add(cap));

    // Create request with required capabilities
    defaultRequest.requiredCapabilities = Array.from(capabilities).map(
      (capId) => ({
        capabilityId: capId,
        essential: !allocation.unallocatedCapabilities.includes(capId),
      }),
    );

    return defaultRequest;
  }

  /**
   * Get the allocation for a specific task
   */
  getTaskAllocations(taskId: string): ResourceAllocation | undefined {
    return this.allocations.get(taskId);
  }

  /**
   * Get all allocations for a resource
   */
  getResourceAllocations(resourceId: string): ResourceAllocation[] {
    const taskIds = this.resourceAllocations.get(resourceId);
    if (!taskIds || taskIds.size === 0) {
      return [];
    }

    return Array.from(taskIds)
      .map((taskId) => this.allocations.get(taskId))
      .filter(
        (allocation): allocation is ResourceAllocation =>
          allocation !== undefined,
      );
  }

  /**
   * Find the best resource for a specific capability
   */
  findBestResourceForCapability(
    capabilityId: string,
    level?: CapabilityLevel,
  ): string {
    // Get resources with this capability
    const resources = this.availabilityService.getResourcesByCapability(
      capabilityId,
      level,
    );

    if (resources.length === 0) {
      return '';
    }

    // Score each resource
    const scoredResources = resources.map((resource) => {
      // Get the capability
      const capability = resource.capabilities.find(
        (c) => c.id === capabilityId,
      );
      if (!capability) {
        return { id: resource.id, score: 0 };
      }

      // Base score on capability level (0-4)
      const levels = Object.values(CapabilityLevel);
      const levelIndex = levels.indexOf(capability.level);
      const levelScore = levelIndex / (levels.length - 1);

      // Adjust for resource load (lower is better)
      const loadScore = 1 - resource.currentLoad;

      // Performance score if available
      const performanceScore =
        capability.performanceMetrics?.successRate || 0.5;

      // Combined score (40% level, 30% load, 30% performance)
      const score = levelScore * 0.4 + loadScore * 0.3 + performanceScore * 0.3;

      return { id: resource.id, score };
    });

    // Sort by score (descending)
    scoredResources.sort((a, b) => b.score - a.score);

    return scoredResources[0]?.id || '';
  }

  /**
   * Check if a capability is available
   */
  checkCapabilityAvailability(
    capabilityId: string,
    level?: CapabilityLevel,
  ): boolean {
    const resources = this.availabilityService.getResourcesByCapability(
      capabilityId,
      level,
    );

    // Filter to available or busy resources
    const availableResources = resources.filter(
      (r) =>
        r.currentStatus === AgentAvailabilityStatus.AVAILABLE ||
        r.currentStatus === AgentAvailabilityStatus.BUSY,
    );

    return availableResources.length > 0;
  }

  /**
   * Calculate the quality match between actual and preferred capability levels
   */
  private calculateLevelMatchQuality(
    actual: CapabilityLevel,
    preferred: CapabilityLevel,
  ): number {
    const levels = Object.values(CapabilityLevel);
    const actualIndex = levels.indexOf(actual);
    const preferredIndex = levels.indexOf(preferred);

    // Perfect match
    if (actualIndex === preferredIndex) {
      return 1.0;
    }

    // Calculate distance as percentage of max possible distance
    const maxDistance = levels.length - 1;
    const distance = Math.abs(actualIndex - preferredIndex);

    // Convert distance to quality (1.0 = perfect, 0.0 = worst)
    return 1.0 - distance / maxDistance;
  }

  /**
   * Get allocation history
   */
  getAllocationHistory(): ResourceAllocation[] {
    return [...this.allocationHistory];
  }

  /**
   * Get allocation metrics
   */
  getMetrics(): Record<string, any> {
    // Calculate success rate (allocations where all essential capabilities were allocated)
    const totalAllocations = this.allocationHistory.length;

    if (totalAllocations === 0) {
      return {
        totalAllocations: 0,
        successRate: 0,
        averageQuality: 0,
        resourceUtilization: {},
      };
    }

    // Count successful allocations
    const successfulAllocations = this.allocationHistory.filter(
      (allocation) =>
        allocation.allocationQuality >= this.allocationScoreThreshold,
    ).length;

    const successRate = successfulAllocations / totalAllocations;

    // Calculate average quality
    const totalQuality = this.allocationHistory.reduce(
      (sum, allocation) => sum + allocation.allocationQuality,
      0,
    );

    const averageQuality = totalQuality / totalAllocations;

    // Get resource utilization
    const resourceUtilization =
      this.availabilityService.getResourceUtilization();

    return {
      totalAllocations,
      successRate,
      averageQuality,
      resourceUtilization,
    };
  }
}
