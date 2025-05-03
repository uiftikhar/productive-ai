import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  LoadBalancingService,
  Resource,
  ResourceType,
} from '../interfaces/resource-management.interface';
import { AgentAvailabilityService } from './agent-availability.service';
import { CapabilityAllocationServiceImpl } from './capability-allocation.service';

/**
 * Implementation of the load balancing service
 */
export class LoadBalancingServiceImpl implements LoadBalancingService {
  private logger: Logger;
  private availabilityService: AgentAvailabilityService;
  private capabilityService: CapabilityAllocationServiceImpl;
  private loadThresholds = {
    overloaded: 0.85, // Resources with load above this are considered overloaded
    underutilized: 0.3, // Resources with load below this are considered underutilized
    targetLoad: 0.6, // Ideal target load for balanced resources
  };
  private balancingInterval: NodeJS.Timeout | null = null;
  private autoBalancing = false;
  private lastBalanceTime: Date | null = null;
  private balancingHistory: {
    timestamp: Date;
    action: string;
    targetResourceId?: string;
    tasksRedistributed?: string[];
    previousLoad?: number;
    newLoad?: number;
    success: boolean;
  }[] = [];

  constructor(options: {
    logger?: Logger;
    availabilityService?: AgentAvailabilityService;
    capabilityService?: CapabilityAllocationServiceImpl;
    loadThresholds?: {
      overloaded?: number;
      underutilized?: number;
      targetLoad?: number;
    };
    autoBalanceIntervalMs?: number;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.availabilityService = options.availabilityService || new AgentAvailabilityService({ logger: this.logger });
    this.capabilityService = options.capabilityService || new CapabilityAllocationServiceImpl({ 
      logger: this.logger,
      availabilityService: this.availabilityService,
    });
    
    // Update load thresholds if provided
    if (options.loadThresholds) {
      this.loadThresholds = {
        ...this.loadThresholds,
        ...options.loadThresholds,
      };
    }
    
    // Set up auto-balancing if interval is provided
    if (options.autoBalanceIntervalMs) {
      this.startAutoBalancing(options.autoBalanceIntervalMs);
    }
    
    this.logger.info('Load balancing service initialized', {
      loadThresholds: this.loadThresholds,
      autoBalancing: this.autoBalancing,
    });
  }

  /**
   * Balance the load across resources
   */
  balanceLoad(): Record<string, any> {
    this.logger.info('Balancing load across resources');
    
    const loadDistribution = this.getLoadDistribution();
    const hotspots = this.identifyHotspots();
    const underutilized = this.identifyUnderutilizedResources();
    
    // If no hotspots or no underutilized resources, nothing to balance
    if (hotspots.length === 0 || underutilized.length === 0) {
      this.logger.info('No load balancing needed', {
        hotspots: hotspots.length,
        underutilized: underutilized.length,
      });
      
      return {
        balanced: false,
        reason: hotspots.length === 0 ? 'No overloaded resources' : 'No underutilized resources',
        hotspotCount: hotspots.length,
        underutilizedCount: underutilized.length,
      };
    }
    
    // Get task redistribution recommendations
    const recommendations = this.recommendTaskRedistribution();
    
    // Apply recommendations
    const balancingResults: Record<string, any> = {
      balanced: true,
      redistributions: [],
    };
    
    for (const [fromResourceId, taskIds] of Object.entries(recommendations)) {
      if (taskIds.length === 0) continue;
      
      const fromResource = this.availabilityService.getResourceById(fromResourceId);
      if (!fromResource) continue;
      
      this.logger.info(`Redistributing ${taskIds.length} tasks from resource ${fromResourceId}`, {
        resourceId: fromResourceId,
        taskCount: taskIds.length,
      });
      
      // Track the results for each task
      const taskResults: Record<string, any>[] = [];
      
      // Try to redistribute each task
      for (const taskId of taskIds) {
        // Get current allocation
        const allocation = this.capabilityService.getTaskAllocations(taskId);
        if (!allocation) continue;
        
        // Find the best target resource for each task
        const targetResources = underutilized.filter(id => id !== fromResourceId);
        if (targetResources.length === 0) continue;
        
        // Choose target resource with lowest load
        targetResources.sort((a, b) => 
          (loadDistribution[a] || 0) - (loadDistribution[b] || 0)
        );
        
        const targetResourceId = targetResources[0];
        const previousFromLoad = fromResource.currentLoad;
        
        // Update the allocation
        const updatedAllocation = this.capabilityService.updateAllocation(taskId, {
          preferredResources: [targetResourceId],
          excludedResources: [fromResourceId],
        });
        
        // Record result
        const success = !updatedAllocation.allocated.some(
          a => a.resourceId === fromResourceId
        );
        
        const newFromResource = this.availabilityService.getResourceById(fromResourceId);
        
        taskResults.push({
          taskId,
          targetResourceId,
          success,
          previousLoad: previousFromLoad,
          newLoad: newFromResource?.currentLoad || 0,
        });
        
        // Record in history
        this.balancingHistory.push({
          timestamp: new Date(),
          action: 'redistribute_task',
          targetResourceId: fromResourceId,
          tasksRedistributed: [taskId],
          previousLoad: previousFromLoad,
          newLoad: newFromResource?.currentLoad || 0,
          success,
        });
      }
      
      balancingResults.redistributions.push({
        sourceResourceId: fromResourceId,
        taskCount: taskIds.length,
        success: taskResults.filter(r => r.success).length,
        taskResults,
      });
    }
    
    this.lastBalanceTime = new Date();
    
    return balancingResults;
  }

  /**
   * Get the current load distribution
   */
  getLoadDistribution(): Record<string, number> {
    return this.availabilityService.getResourceUtilization();
  }

  /**
   * Identify overloaded resources
   */
  identifyHotspots(): string[] {
    const loadDistribution = this.getLoadDistribution();
    
    return Object.entries(loadDistribution)
      .filter(([_, load]) => load >= this.loadThresholds.overloaded)
      .map(([resourceId]) => resourceId);
  }

  /**
   * Identify underutilized resources
   */
  identifyUnderutilizedResources(): string[] {
    const loadDistribution = this.getLoadDistribution();
    
    return Object.entries(loadDistribution)
      .filter(([_, load]) => load <= this.loadThresholds.underutilized)
      .map(([resourceId]) => resourceId);
  }

  /**
   * Recommend which tasks should be moved to balance load
   */
  recommendTaskRedistribution(): Record<string, string[]> {
    const recommendations: Record<string, string[]> = {};
    const hotspots = this.identifyHotspots();
    
    // For each hotspot, identify tasks to move
    for (const resourceId of hotspots) {
      const resource = this.availabilityService.getResourceById(resourceId);
      if (!resource) continue;
      
      // Get allocations for this resource
      const allocations = this.capabilityService.getResourceAllocations(resourceId);
      if (allocations.length === 0) continue;
      
      // Calculate how many tasks to move
      const currentTasks = resource.currentTasks.length;
      const currentLoad = resource.currentLoad;
      const targetLoad = this.loadThresholds.targetLoad;
      
      // If load is already below target, no need to redistvribute
      if (currentLoad <= targetLoad) continue;
      
      // Calculate tasks to move to reach target load
      const loadPerTask = currentLoad / currentTasks;
      const tasksToMove = Math.ceil((currentLoad - targetLoad) / loadPerTask);
      
      // Get task IDs to move (prefer newer tasks)
      const taskCandidates = allocations.map(allocation => allocation.taskId);
      
      // Sort by allocation time (newest first, as they're easier to move)
      const sortedTasks = taskCandidates.sort((a, b) => {
        const allocA = this.capabilityService.getTaskAllocations(a);
        const allocB = this.capabilityService.getTaskAllocations(b);
        
        if (!allocA || !allocB) return 0;
        
        return allocB.allocationTime.getTime() - allocA.allocationTime.getTime();
      });
      
      // Select tasks to move
      recommendations[resourceId] = sortedTasks.slice(0, tasksToMove);
    }
    
    return recommendations;
  }

  /**
   * Get the optimal load distribution
   */
  getOptimalDistribution(): Record<string, number> {
    const resources = this.availabilityService.getAllResources();
    const optimalDistribution: Record<string, number> = {};
    
    // Group resources by type
    const resourcesByType: Record<ResourceType, Resource[]> = {} as Record<ResourceType, Resource[]>;
    
    for (const resource of resources) {
      if (!resourcesByType[resource.type]) {
        resourcesByType[resource.type] = [];
      }
      resourcesByType[resource.type].push(resource);
    }
    
    // Calculate optimal load for each resource type
    for (const [type, typeResources] of Object.entries(resourcesByType)) {
      // Calculate total capacity for this type
      const totalCapacity = typeResources.reduce(
        (sum, resource) => sum + resource.maxConcurrentTasks,
        0
      );
      
      // Calculate total task count for this type
      const totalTasks = typeResources.reduce(
        (sum, resource) => sum + resource.currentTasks.length,
        0
      );
      
      // Calculate optimal tasks per capacity unit
      const tasksPerCapacity = totalTasks / totalCapacity;
      
      // Calculate optimal load for each resource
      for (const resource of typeResources) {
        const optimalTasks = Math.round(resource.maxConcurrentTasks * tasksPerCapacity);
        const optimalLoad = Math.min(1, optimalTasks / resource.maxConcurrentTasks);
        
        optimalDistribution[resource.id] = optimalLoad;
      }
    }
    
    return optimalDistribution;
  }

  /**
   * Rebalance a specific resource
   */
  rebalanceResource(resourceId: string): boolean {
    const resource = this.availabilityService.getResourceById(resourceId);
    if (!resource) {
      this.logger.warn(`Cannot rebalance non-existent resource ${resourceId}`);
      return false;
    }
    
    this.logger.info(`Rebalancing resource ${resourceId}`);
    
    // Check if resource is overloaded
    const isOverloaded = resource.currentLoad >= this.loadThresholds.overloaded;
    
    // Find underutilized resources
    const underutilized = this.identifyUnderutilizedResources();
    
    // If resource is not overloaded or no underutilized resources, nothing to do
    if (!isOverloaded || underutilized.length === 0) {
      return false;
    }
    
    // Get allocations for this resource
    const allocations = this.capabilityService.getResourceAllocations(resourceId);
    if (allocations.length === 0) {
      return false;
    }
    
    // Calculate how many tasks to move
    const currentTasks = resource.currentTasks.length;
    const currentLoad = resource.currentLoad;
    const targetLoad = this.loadThresholds.targetLoad;
    
    const loadPerTask = currentLoad / currentTasks;
    const tasksToMove = Math.ceil((currentLoad - targetLoad) / loadPerTask);
    
    // Get task IDs to move (prefer newer tasks)
    const taskCandidates = allocations.map(allocation => allocation.taskId);
    
    // Sort by allocation time (newest first)
    const sortedTasks = taskCandidates.sort((a, b) => {
      const allocA = this.capabilityService.getTaskAllocations(a);
      const allocB = this.capabilityService.getTaskAllocations(b);
      
      if (!allocA || !allocB) return 0;
      
      return allocB.allocationTime.getTime() - allocA.allocationTime.getTime();
    });
    
    // Select tasks to move
    const tasksToRedistribute = sortedTasks.slice(0, tasksToMove);
    
    // No tasks to move
    if (tasksToRedistribute.length === 0) {
      return false;
    }
    
    let success = true;
    
    // Move each task
    for (const taskId of tasksToRedistribute) {
      // Choose target resource with lowest load
      underutilized.sort((a, b) => {
        const loadA = this.availabilityService.getResourceById(a)?.currentLoad || 0;
        const loadB = this.availabilityService.getResourceById(b)?.currentLoad || 0;
        return loadA - loadB;
      });
      
      const targetResourceId = underutilized[0];
      
      // Update the allocation
      const updatedAllocation = this.capabilityService.updateAllocation(taskId, {
        preferredResources: [targetResourceId],
        excludedResources: [resourceId],
      });
      
      // Check if task was actually moved
      const taskMoved = !updatedAllocation.allocated.some(a => a.resourceId === resourceId);
      
      if (!taskMoved) {
        success = false;
      }
    }
    
    // Record in history
    this.balancingHistory.push({
      timestamp: new Date(),
      action: 'rebalance_resource',
      targetResourceId: resourceId,
      tasksRedistributed: tasksToRedistribute,
      previousLoad: currentLoad,
      newLoad: this.availabilityService.getResourceById(resourceId)?.currentLoad || 0,
      success,
    });
    
    return success;
  }

  /**
   * Start automatic load balancing
   */
  startAutoBalancing(intervalMs: number = 60000): void {
    if (this.balancingInterval) {
      clearInterval(this.balancingInterval);
    }
    
    this.autoBalancing = true;
    this.balancingInterval = setInterval(() => {
      this.balanceLoad();
    }, intervalMs);
    
    this.logger.info(`Started automatic load balancing every ${intervalMs}ms`);
  }

  /**
   * Stop automatic load balancing
   */
  stopAutoBalancing(): void {
    if (this.balancingInterval) {
      clearInterval(this.balancingInterval);
      this.balancingInterval = null;
    }
    
    this.autoBalancing = false;
    this.logger.info('Stopped automatic load balancing');
  }

  /**
   * Set load thresholds
   */
  setLoadThresholds(thresholds: Partial<typeof this.loadThresholds>): void {
    this.loadThresholds = {
      ...this.loadThresholds,
      ...thresholds,
    };
    
    this.logger.info('Updated load thresholds', { thresholds: this.loadThresholds });
  }

  /**
   * Get load balancing metrics
   */
  getLoadBalancingMetrics(): Record<string, any> {
    const hotspots = this.identifyHotspots();
    const underutilized = this.identifyUnderutilizedResources();
    const loadDistribution = this.getLoadDistribution();
    const optimalDistribution = this.getOptimalDistribution();
    
    // Calculate load deviation (how far from optimal)
    const loadDeviation: Record<string, number> = {};
    let totalDeviation = 0;
    
    for (const [resourceId, currentLoad] of Object.entries(loadDistribution)) {
      const optimalLoad = optimalDistribution[resourceId] || this.loadThresholds.targetLoad;
      const deviation = Math.abs(currentLoad - optimalLoad);
      loadDeviation[resourceId] = deviation;
      totalDeviation += deviation;
    }
    
    const avgDeviation = Object.keys(loadDeviation).length > 0
      ? totalDeviation / Object.keys(loadDeviation).length
      : 0;
    
    // Calculate imbalance score (0-1, higher means more imbalanced)
    const imbalanceScore = Math.min(1, avgDeviation * 2);
    
    return {
      hotspotCount: hotspots.length,
      underutilizedCount: underutilized.length,
      loadDistribution,
      optimalDistribution,
      loadDeviation,
      avgDeviation,
      imbalanceScore,
      lastBalanceTime: this.lastBalanceTime,
      autoBalancing: this.autoBalancing,
      loadThresholds: this.loadThresholds,
    };
  }

  /**
   * Get load balancing history
   */
  getBalancingHistory(): any[] {
    return [...this.balancingHistory];
  }
} 