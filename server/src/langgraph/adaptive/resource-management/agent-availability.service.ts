import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  AgentAvailabilityStatus,
  AgentAvailabilityTracker,
  CapabilityLevel,
  Resource,
  ResourceType,
} from '../interfaces/resource-management.interface';

/**
 * Implementation of the agent availability tracking service
 */
export class AgentAvailabilityService implements AgentAvailabilityTracker {
  private logger: Logger;
  private resources: Map<string, Resource> = new Map();
  private resourcesByType: Map<ResourceType, Set<string>> = new Map();
  private resourcesByCapability: Map<string, Map<CapabilityLevel, Set<string>>> = new Map();
  private availabilityListeners: Map<string, ((resource: Resource) => void)[]> = new Map();
  private statusUpdateHistory: {
    resourceId: string;
    previousStatus: AgentAvailabilityStatus;
    newStatus: AgentAvailabilityStatus;
    timestamp: Date;
  }[] = [];

  constructor(options: { logger?: Logger } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    
    // Initialize maps for each resource type
    Object.values(ResourceType).forEach(type => {
      this.resourcesByType.set(type, new Set<string>());
    });
    
    this.logger.info('Agent availability service initialized');
  }

  /**
   * Register a new resource
   */
  registerResource(resource: Omit<Resource, 'currentLoad' | 'statusLastUpdated'>): string {
    const resourceId = resource.id || uuidv4();
    const now = new Date();
    
    // Create complete resource object
    const completeResource: Resource = {
      ...resource,
      id: resourceId,
      currentLoad: 0,
      statusLastUpdated: now,
      currentTasks: resource.currentTasks || [],
    };
    
    // Store the resource
    this.resources.set(resourceId, completeResource);
    
    // Index by type
    const typeSet = this.resourcesByType.get(completeResource.type);
    if (typeSet) {
      typeSet.add(resourceId);
    }
    
    // Index by capabilities
    for (const capability of completeResource.capabilities) {
      if (!this.resourcesByCapability.has(capability.id)) {
        this.resourcesByCapability.set(
          capability.id,
          new Map<CapabilityLevel, Set<string>>()
        );
      }
      
      const capabilityMap = this.resourcesByCapability.get(capability.id);
      if (capabilityMap) {
        if (!capabilityMap.has(capability.level)) {
          capabilityMap.set(capability.level, new Set<string>());
        }
        
        const levelSet = capabilityMap.get(capability.level);
        if (levelSet) {
          levelSet.add(resourceId);
        }
      }
    }
    
    this.logger.info(`Resource registered: ${resource.name} (${resourceId})`, {
      resourceId,
      type: completeResource.type,
      capabilities: completeResource.capabilities.map(c => c.name),
      status: completeResource.currentStatus,
    });
    
    return resourceId;
  }

  /**
   * Update a resource's availability status
   */
  updateResourceStatus(resourceId: string, status: AgentAvailabilityStatus): boolean {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      this.logger.warn(`Cannot update status for non-existent resource ${resourceId}`);
      return false;
    }
    
    const previousStatus = resource.currentStatus;
    const now = new Date();
    
    // Update resource
    this.resources.set(resourceId, {
      ...resource,
      currentStatus: status,
      statusLastUpdated: now,
    });
    
    // Record status change in history
    this.statusUpdateHistory.push({
      resourceId,
      previousStatus,
      newStatus: status,
      timestamp: now,
    });
    
    // Notify listeners
    this.notifyResourceListeners(resourceId);
    
    this.logger.info(`Resource status updated: ${resource.name} (${resourceId})`, {
      resourceId,
      previousStatus,
      newStatus: status,
    });
    
    return true;
  }

  /**
   * Update a resource's current load
   */
  updateResourceLoad(resourceId: string, load: number): boolean {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      this.logger.warn(`Cannot update load for non-existent resource ${resourceId}`);
      return false;
    }
    
    // Ensure load is between 0 and 1
    const normalizedLoad = Math.max(0, Math.min(1, load));
    
    // Update resource
    this.resources.set(resourceId, {
      ...resource,
      currentLoad: normalizedLoad,
      statusLastUpdated: new Date(),
    });
    
    // Determine if status should change based on load
    let newStatus = resource.currentStatus;
    
    if (normalizedLoad >= 0.95) {
      newStatus = AgentAvailabilityStatus.FULLY_OCCUPIED;
    } else if (normalizedLoad > 0.5) {
      newStatus = AgentAvailabilityStatus.BUSY;
    } else if (normalizedLoad <= 0.2 && resource.currentStatus !== AgentAvailabilityStatus.UNAVAILABLE) {
      newStatus = AgentAvailabilityStatus.AVAILABLE;
    }
    
    // If status would change, update it
    if (newStatus !== resource.currentStatus) {
      this.updateResourceStatus(resourceId, newStatus);
    } else {
      // Notify listeners even if status didn't change
      this.notifyResourceListeners(resourceId);
    }
    
    this.logger.debug(`Resource load updated: ${resource.name} (${resourceId})`, {
      resourceId,
      load: normalizedLoad,
    });
    
    return true;
  }

  /**
   * Add a task to a resource
   */
  addTaskToResource(resourceId: string, taskId: string): boolean {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      this.logger.warn(`Cannot add task to non-existent resource ${resourceId}`);
      return false;
    }
    
    // Don't add if already assigned
    if (resource.currentTasks.includes(taskId)) {
      return true;
    }
    
    // Add task to resource
    const updatedTasks = [...resource.currentTasks, taskId];
    this.resources.set(resourceId, {
      ...resource,
      currentTasks: updatedTasks,
      statusLastUpdated: new Date(),
    });
    
    // Update load based on task count
    const estimatedLoad = Math.min(1, updatedTasks.length / resource.maxConcurrentTasks);
    this.updateResourceLoad(resourceId, estimatedLoad);
    
    this.logger.info(`Task ${taskId} added to resource ${resource.name} (${resourceId})`, {
      resourceId,
      taskId,
      taskCount: updatedTasks.length,
    });
    
    return true;
  }

  /**
   * Remove a task from a resource
   */
  removeTaskFromResource(resourceId: string, taskId: string): boolean {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      this.logger.warn(`Cannot remove task from non-existent resource ${resourceId}`);
      return false;
    }
    
    // Remove task
    const updatedTasks = resource.currentTasks.filter(id => id !== taskId);
    
    // If no change, return early
    if (updatedTasks.length === resource.currentTasks.length) {
      return false;
    }
    
    // Update resource
    this.resources.set(resourceId, {
      ...resource,
      currentTasks: updatedTasks,
      statusLastUpdated: new Date(),
    });
    
    // Update load based on task count
    const estimatedLoad = Math.min(1, updatedTasks.length / resource.maxConcurrentTasks);
    this.updateResourceLoad(resourceId, estimatedLoad);
    
    this.logger.info(`Task ${taskId} removed from resource ${resource.name} (${resourceId})`, {
      resourceId,
      taskId,
      remainingTaskCount: updatedTasks.length,
    });
    
    return true;
  }

  /**
   * Get a resource by ID
   */
  getResourceById(resourceId: string): Resource | undefined {
    return this.resources.get(resourceId);
  }

  /**
   * Get all available resources
   */
  getAvailableResources(): Resource[] {
    return Array.from(this.resources.values()).filter(
      resource => resource.currentStatus === AgentAvailabilityStatus.AVAILABLE
    );
  }

  /**
   * Get resources by type
   */
  getResourcesByType(type: ResourceType): Resource[] {
    const resourceIds = this.resourcesByType.get(type) || new Set<string>();
    return Array.from(resourceIds)
      .map(id => this.resources.get(id))
      .filter((r): r is Resource => r !== undefined);
  }

  /**
   * Get resources by capability
   */
  getResourcesByCapability(capabilityId: string, minimumLevel?: CapabilityLevel): Resource[] {
    const capabilityMap = this.resourcesByCapability.get(capabilityId);
    if (!capabilityMap) {
      return [];
    }
    
    const resourceIds = new Set<string>();
    
    // Get all capability levels
    const levels = Object.values(CapabilityLevel);
    
    // If minimum level specified, only include resources with that level or higher
    if (minimumLevel) {
      const minIndex = levels.indexOf(minimumLevel);
      if (minIndex === -1) {
        return [];
      }
      
      // Add resources from this level and all higher levels
      for (let i = 0; i <= minIndex; i++) {
        const resourceSet = capabilityMap.get(levels[i]);
        if (resourceSet) {
          resourceSet.forEach(id => resourceIds.add(id));
        }
      }
    } else {
      // Include resources from all levels
      for (const resourceSet of capabilityMap.values()) {
        resourceSet.forEach(id => resourceIds.add(id));
      }
    }
    
    return Array.from(resourceIds)
      .map(id => this.resources.get(id))
      .filter((r): r is Resource => r !== undefined);
  }

  /**
   * Get resource utilization percentages
   */
  getResourceUtilization(): Record<string, number> {
    const utilization: Record<string, number> = {};
    
    for (const [id, resource] of this.resources.entries()) {
      utilization[id] = resource.currentLoad;
    }
    
    return utilization;
  }

  /**
   * Get overall system load
   */
  getSystemLoad(): number {
    const resources = Array.from(this.resources.values());
    if (resources.length === 0) {
      return 0;
    }
    
    const totalLoad = resources.reduce((sum, resource) => sum + resource.currentLoad, 0);
    return totalLoad / resources.length;
  }

  /**
   * Subscribe to resource status updates
   */
  subscribeToResourceUpdates(resourceId: string, callback: (resource: Resource) => void): () => void {
    if (!this.availabilityListeners.has(resourceId)) {
      this.availabilityListeners.set(resourceId, []);
    }
    
    this.availabilityListeners.get(resourceId)?.push(callback);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.availabilityListeners.get(resourceId);
      if (listeners) {
        this.availabilityListeners.set(
          resourceId,
          listeners.filter(cb => cb !== callback)
        );
      }
    };
  }

  /**
   * Notify all listeners about resource updates
   */
  private notifyResourceListeners(resourceId: string): void {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      return;
    }
    
    const listeners = this.availabilityListeners.get(resourceId) || [];
    for (const listener of listeners) {
      try {
        listener(resource);
      } catch (error) {
        this.logger.error(`Error in resource update listener for ${resourceId}`, { error });
      }
    }
  }

  /**
   * Get status update history for a resource
   */
  getStatusUpdateHistory(resourceId?: string): any[] {
    if (resourceId) {
      return this.statusUpdateHistory.filter(update => update.resourceId === resourceId);
    }
    return [...this.statusUpdateHistory];
  }

  /**
   * Get all resources
   */
  getAllResources(): Resource[] {
    return Array.from(this.resources.values());
  }
} 