import { v4 as uuidv4 } from 'uuid';

/**
 * Complexity level enum for assessing task difficulty
 */
export enum ComplexityLevel {
  TRIVIAL = 'trivial',
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex',
  VERY_COMPLEX = 'very_complex',
}

/**
 * Resource type enum for task resource requirements
 */
export enum ResourceType {
  COMPUTATION = 'computation',
  MEMORY = 'memory',
  TIME = 'time',
  KNOWLEDGE = 'knowledge',
  TOKENS = 'tokens',
  TOOL_ACCESS = 'tool_access',
  API_ACCESS = 'api_access',
  DATA_ACCESS = 'data_access',
  COORDINATION = 'coordination',
}

/**
 * Dependency type enum for task relationships
 */
export enum DependencyType {
  SEQUENTIAL = 'sequential', // Must be completed before dependent task
  TEMPORAL = 'temporal', // Time-based dependency
  INFORMATIONAL = 'informational', // Shares information but doesn't block
  RESOURCE = 'resource', // Competes for the same resources
  ENVIRONMENTAL = 'environmental', // External dependency
}

/**
 * Task dependency specification
 */
export interface TaskDependency {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  type: DependencyType;
  description: string;
  metadata?: Record<string, any>;
  criticality: 'low' | 'medium' | 'high' | 'blocking';
}

/**
 * Resource requirement specification
 */
export interface ResourceRequirement {
  id: string;
  resourceType: ResourceType;
  quantity: number; // Normalized scale from 0-100
  description: string;
  isRequired: boolean; // Whether this is a hard requirement
  alternatives?: ResourceType[]; // Alternative resources that could substitute
  metadata?: Record<string, any>;
}

/**
 * Complexity factor specification
 */
export interface ComplexityFactor {
  id: string;
  name: string;
  description: string;
  weight: number; // 0-1 relative importance
  score: number; // 0-100 score
  metadata?: Record<string, any>;
}

/**
 * Task complexity assessment
 */
export interface ComplexityAssessment {
  id: string;
  taskId: string;
  overallComplexity: ComplexityLevel;
  confidenceScore: number; // 0-1 confidence in assessment
  factors: ComplexityFactor[];
  recommendedDecomposition: boolean; // Whether task should be decomposed
  recommendedAgentCount: number; // Recommended number of agents
  timestamp: number;
  version: number; // For tracking changes to assessment
  metadata?: Record<string, any>;
}

/**
 * Task analysis specification
 */
export interface TaskAnalysis {
  id: string;
  taskId: string;
  name: string;
  description: string;
  complexityAssessment: ComplexityAssessment;
  dependencies: TaskDependency[];
  resourceRequirements: ResourceRequirement[];
  estimatedDuration: number; // In milliseconds
  estimatedSuccessProbability: number; // 0-1 probability of success
  decompositionRecommended: boolean;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Task analyzer interface for components that can analyze tasks
 */
export interface TaskAnalyzer {
  analyzeTask(
    taskId: string,
    description: string,
    context?: Record<string, any>,
  ): Promise<TaskAnalysis>;
  assessComplexity(
    taskId: string,
    description: string,
    context?: Record<string, any>,
  ): Promise<ComplexityAssessment>;
  detectDependencies(
    taskId: string,
    otherTaskIds: string[],
    context?: Record<string, any>,
  ): Promise<TaskDependency[]>;
  estimateResources(
    taskId: string,
    description: string,
    context?: Record<string, any>,
  ): Promise<ResourceRequirement[]>;
}

/**
 * Factory function to create a new Task Dependency
 */
export function createTaskDependency(
  sourceTaskId: string,
  targetTaskId: string,
  type: DependencyType,
  description: string,
  criticality: 'low' | 'medium' | 'high' | 'blocking' = 'medium',
): TaskDependency {
  return {
    id: uuidv4(),
    sourceTaskId,
    targetTaskId,
    type,
    description,
    criticality,
    metadata: {},
  };
}

/**
 * Factory function to create a new Resource Requirement
 */
export function createResourceRequirement(
  resourceType: ResourceType,
  quantity: number,
  description: string,
  isRequired = true,
): ResourceRequirement {
  return {
    id: uuidv4(),
    resourceType,
    quantity: Math.min(Math.max(quantity, 0), 100), // Ensure 0-100 range
    description,
    isRequired,
    metadata: {},
  };
}

/**
 * Factory function to create a new Complexity Assessment
 */
export function createComplexityAssessment(
  taskId: string,
  overallComplexity: ComplexityLevel,
  factors: ComplexityFactor[],
  confidenceScore = 0.8,
): ComplexityAssessment {
  return {
    id: uuidv4(),
    taskId,
    overallComplexity,
    confidenceScore,
    factors,
    recommendedDecomposition:
      overallComplexity === ComplexityLevel.COMPLEX ||
      overallComplexity === ComplexityLevel.VERY_COMPLEX,
    recommendedAgentCount:
      overallComplexity === ComplexityLevel.TRIVIAL
        ? 1
        : overallComplexity === ComplexityLevel.SIMPLE
          ? 1
          : overallComplexity === ComplexityLevel.MODERATE
            ? 2
            : overallComplexity === ComplexityLevel.COMPLEX
              ? 3
              : overallComplexity === ComplexityLevel.VERY_COMPLEX
                ? 5
                : 1,
    timestamp: Date.now(),
    version: 1,
    metadata: {},
  };
}
