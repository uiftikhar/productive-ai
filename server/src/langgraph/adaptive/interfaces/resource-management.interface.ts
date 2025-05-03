/**
 * Interfaces for the Resource Management System
 *
 * These interfaces define the core types and structures for agent availability tracking,
 * capability-based resource allocation, and load balancing.
 */

/**
 * Agent availability status
 */
export enum AgentAvailabilityStatus {
  AVAILABLE = 'available', // Fully available for new tasks
  BUSY = 'busy', // Currently working on tasks but can be allocated more
  FULLY_OCCUPIED = 'fully_occupied', // At maximum capacity
  UNAVAILABLE = 'unavailable', // Temporarily unavailable
  OFFLINE = 'offline', // Not connected/available
}

/**
 * Resource type classification
 */
export enum ResourceType {
  AGENT = 'agent', // AI agent resource
  COMPUTATIONAL = 'computational', // Computing resource (CPU, memory, etc.)
  DATA = 'data', // Data access resource
  EXTERNAL_API = 'external_api', // External API or service
  CUSTOM = 'custom', // Custom resource type
}

/**
 * Capability level of a resource
 */
export enum CapabilityLevel {
  EXPERT = 'expert', // High proficiency
  PROFICIENT = 'proficient', // Good proficiency
  INTERMEDIATE = 'intermediate', // Medium proficiency
  BASIC = 'basic', // Basic proficiency
  LEARNING = 'learning', // Still learning this capability
}

/**
 * Resource capability definition
 */
export interface ResourceCapability {
  id: string;
  name: string;
  description?: string;
  level: CapabilityLevel;
  tags: string[];
  parameters?: Record<string, any>; // Additional configuration parameters
  performanceMetrics?: Record<string, number>; // Metrics about past performance
}

/**
 * Resource definition
 */
export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  capabilities: ResourceCapability[];
  currentStatus: AgentAvailabilityStatus;
  currentLoad: number; // 0-1 scale where 1 is fully loaded
  maxConcurrentTasks: number;
  currentTasks: string[]; // IDs of currently assigned tasks
  statusLastUpdated: Date;
  metadata?: Record<string, any>;
  performanceHistory?: {
    averageTaskDuration: number;
    successRate: number;
    recentUtilization: number[];
  };
}

/**
 * Resource allocation request
 */
export interface ResourceAllocationRequest {
  taskId: string;
  requiredCapabilities: {
    capabilityId: string;
    minimumLevel?: CapabilityLevel;
    preferredLevel?: CapabilityLevel;
    essential: boolean; // Is this capability required or optional
  }[];
  preferredResources?: string[]; // Preferred resource IDs if any
  excludedResources?: string[]; // Resource IDs to exclude
  deadline?: Date;
  priority: number; // Higher number means higher priority
  estimatedDuration: number; // In milliseconds
  concurrency?: number; // How many resources needed simultaneously
}

/**
 * Resource allocation result
 */
export interface ResourceAllocation {
  taskId: string;
  allocated: {
    resourceId: string;
    capabilities: string[]; // Capability IDs this resource is allocated for
    estimatedStartTime: Date;
    estimatedEndTime: Date;
  }[];
  unallocatedCapabilities: string[]; // Capability IDs that couldn't be allocated
  allocationQuality: number; // 0-1 scale of how good the allocation is
  allocationTime: Date;
}

/**
 * Interface for agent availability tracking
 */
export interface AgentAvailabilityTracker {
  registerResource(
    resource: Omit<Resource, 'currentLoad' | 'statusLastUpdated'>,
  ): string;
  updateResourceStatus(
    resourceId: string,
    status: AgentAvailabilityStatus,
  ): boolean;
  updateResourceLoad(resourceId: string, load: number): boolean;
  addTaskToResource(resourceId: string, taskId: string): boolean;
  removeTaskFromResource(resourceId: string, taskId: string): boolean;
  getResourceById(resourceId: string): Resource | undefined;
  getAvailableResources(): Resource[];
  getResourcesByType(type: ResourceType): Resource[];
  getResourcesByCapability(
    capabilityId: string,
    minimumLevel?: CapabilityLevel,
  ): Resource[];
  getResourceUtilization(): Record<string, number>; // resourceId -> utilization (0-1)
  getSystemLoad(): number; // Overall system load (0-1)
}

/**
 * Interface for capability-based resource allocation
 */
export interface CapabilityAllocationService {
  allocateResources(request: ResourceAllocationRequest): ResourceAllocation;
  releaseResources(taskId: string): boolean;
  updateAllocation(
    taskId: string,
    updatedRequest: Partial<ResourceAllocationRequest>,
  ): ResourceAllocation;
  getTaskAllocations(taskId: string): ResourceAllocation | undefined;
  getResourceAllocations(resourceId: string): ResourceAllocation[];
  findBestResourceForCapability(
    capabilityId: string,
    level?: CapabilityLevel,
  ): string;
  checkCapabilityAvailability(
    capabilityId: string,
    level?: CapabilityLevel,
  ): boolean;
}

/**
 * Interface for load balancing service
 */
export interface LoadBalancingService {
  balanceLoad(): Record<string, any>; // Returns restructuring recommendations
  getLoadDistribution(): Record<string, number>; // resourceId -> current load
  identifyHotspots(): string[]; // IDs of overloaded resources
  identifyUnderutilizedResources(): string[]; // IDs of underutilized resources
  recommendTaskRedistribution(): Record<string, string[]>; // resourceId -> taskIds to move
  getOptimalDistribution(): Record<string, number>; // resourceId -> optimal load
  rebalanceResource(resourceId: string): boolean;
}
