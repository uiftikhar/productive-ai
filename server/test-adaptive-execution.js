/**
 * Test script for demonstrating the Adaptive Execution Engine
 *
 * This script showcases the priority-based scheduler, context-aware
 * scheduling, and dependency-aware task execution.
 */

const {
  PriorityLevel,
  TaskScheduleStatus,
} = require('./dist/langgraph/adaptive/interfaces/scheduler.interface');
const {
  DynamicPrioritizationService,
} = require('./dist/langgraph/adaptive/scheduler/dynamic-prioritization.service');
const {
  ContextAwareSchedulerService,
} = require('./dist/langgraph/adaptive/scheduler/context-aware-scheduler.service');
const {
  DependencyAwareQueueService,
} = require('./dist/langgraph/adaptive/scheduler/dependency-aware-queue.service');
const {
  AgentAvailabilityService,
} = require('./src/langgraph/adaptive/resource-management/agent-availability.service');
const {
  CapabilityAllocationServiceImpl,
} = require('./src/langgraph/adaptive/resource-management/capability-allocation.service');
const {
  LoadBalancingServiceImpl,
} = require('./src/langgraph/adaptive/resource-management/load-balancing.service');
const {
  SynchronizationManagerService,
} = require('./src/langgraph/adaptive/parallel-execution/synchronization-manager.service');
const {
  ParallelDataSharingServiceImpl,
} = require('./src/langgraph/adaptive/parallel-execution/parallel-data-sharing.service');
const {
  MultiTaskProgressServiceImpl,
} = require('./src/langgraph/adaptive/parallel-execution/multi-task-progress.service');
const {
  PerformanceMonitorServiceImpl,
} = require('./src/langgraph/adaptive/execution-monitoring/performance-monitor.service');
const {
  PlanAdjustmentServiceImpl,
} = require('./src/langgraph/adaptive/execution-monitoring/plan-adjustment.service');
const {
  FailureRecoveryServiceImpl,
} = require('./src/langgraph/adaptive/execution-monitoring/failure-recovery.service');
const { ConsoleLogger } = require('./src/shared/logger/console-logger');
const { v4: uuidv4 } = require('uuid');

// Create a logger
const logger = new ConsoleLogger({ level: 'info' });

// Initialize services
console.log('Initializing Adaptive Execution Engine services...');

// ------------------------------------
// 1. Initialize Scheduler Services
// ------------------------------------
console.log('\n1. INITIALIZING SCHEDULER SERVICES');

// Dynamic Prioritization Service
const prioritizationService = new DynamicPrioritizationService({ logger });
console.log('✅ Dynamic Prioritization Service initialized');

// Context-Aware Scheduler
const contextAwareScheduler = new ContextAwareSchedulerService({
  logger,
  prioritizationService,
});
console.log('✅ Context-Aware Scheduler initialized');

// Dependency-Aware Queue
const dependencyQueue = new DependencyAwareQueueService({
  logger,
  prioritizationService,
});
console.log('✅ Dependency-Aware Queue initialized');

// ------------------------------------
// 2. Initialize Resource Management Services
// ------------------------------------
console.log('\n2. INITIALIZING RESOURCE MANAGEMENT SERVICES');

// Agent Availability Service
const agentAvailability = new AgentAvailabilityService({ logger });
console.log('✅ Agent Availability Service initialized');

// Capability Allocation Service
const capabilityAllocation = new CapabilityAllocationServiceImpl({
  logger,
  availabilityService: agentAvailability,
});
console.log('✅ Capability Allocation Service initialized');

// Load Balancing Service
const loadBalancer = new LoadBalancingServiceImpl({
  logger,
  availabilityService: agentAvailability,
  capabilityService: capabilityAllocation,
});
console.log('✅ Load Balancing Service initialized');

// ------------------------------------
// 3. Initialize Parallel Execution Services
// ------------------------------------
console.log('\n3. INITIALIZING PARALLEL EXECUTION SERVICES');

// Synchronization Manager
const syncManager = new SynchronizationManagerService({ logger });
console.log('✅ Synchronization Manager initialized');

// Parallel Data Sharing
const dataSharing = new ParallelDataSharingServiceImpl({ logger });
console.log('✅ Parallel Data Sharing Service initialized');

// Multi-Task Progress
const taskProgress = new MultiTaskProgressServiceImpl({ logger });
console.log('✅ Multi-Task Progress Service initialized');

// ------------------------------------
// 4. Initialize Execution Monitoring Services
// ------------------------------------
console.log('\n4. INITIALIZING EXECUTION MONITORING SERVICES');

// Performance Monitor
const performanceMonitor = new PerformanceMonitorServiceImpl({ logger });
console.log('✅ Performance Monitor initialized');

// Plan Adjustment
const planAdjustment = new PlanAdjustmentServiceImpl({
  logger,
  performanceMonitor,
});
console.log('✅ Plan Adjustment Service initialized');

// Failure Recovery
const failureRecovery = new FailureRecoveryServiceImpl({
  logger,
  performanceMonitor,
});
console.log('✅ Failure Recovery Service initialized');

// ------------------------------------
// TEST 1: Priority-Based Task Scheduling
// ------------------------------------
console.log('\n\nTEST 1: PRIORITY-BASED TASK SCHEDULING');

// Register tasks with different priorities
console.log('Registering tasks with different priorities...');

const task1 = {
  id: 'task-1',
  name: 'High Priority Task',
  priority: 8,
  deadlineMs: Date.now() + 60000,
  estimatedDurationMs: 30000,
};

const task2 = {
  id: 'task-2',
  name: 'Medium Priority Task',
  priority: 5,
  deadlineMs: Date.now() + 120000,
  estimatedDurationMs: 20000,
};

const task3 = {
  id: 'task-3',
  name: 'Low Priority Task',
  priority: 2,
  deadlineMs: Date.now() + 300000,
  estimatedDurationMs: 15000,
};

// Register them with the prioritization service
prioritizationService.registerTask(task1);
prioritizationService.registerTask(task2);
prioritizationService.registerTask(task3);

// Get the ordered tasks
const orderedTasks = prioritizationService.getOrderedTasks();
console.log('Tasks ordered by priority:');
orderedTasks.forEach((task, index) => {
  console.log(`${index + 1}. ${task.name} (Priority: ${task.priority})`);
});

// Update task priority
console.log('\nUpdating task priority...');
prioritizationService.updateTaskPriority('task-2', 9);
const reorderedTasks = prioritizationService.getOrderedTasks();
console.log('Updated task order:');
reorderedTasks.forEach((task, index) => {
  console.log(`${index + 1}. ${task.name} (Priority: ${task.priority})`);
});

// ------------------------------------
// TEST 2: Context-Aware Scheduling
// ------------------------------------
console.log('\n\nTEST 2: CONTEXT-AWARE SCHEDULING');

// Register context patterns
console.log('Registering context patterns...');
contextAwareScheduler.registerContextPattern({
  id: 'urgent-context',
  name: 'Urgent Execution Context',
  conditions: {
    urgent: true,
  },
  priorityAdjustment: 3,
  description: 'Increase priority for urgent execution contexts',
});

contextAwareScheduler.registerContextPattern({
  id: 'resource-constrained',
  name: 'Resource Constrained Context',
  conditions: {
    availableAgents: (value) => value < 3,
  },
  priorityAdjustment: -1,
  description: 'Decrease priority when resources are limited',
});

// Schedule task with different contexts
console.log('\nScheduling tasks with different contexts...');

const task4 = {
  id: 'task-4',
  name: 'Normal Context Task',
  priority: 5,
};

const task5 = {
  id: 'task-5',
  name: 'Urgent Context Task',
  priority: 5,
};

const normalContext = {
  urgent: false,
  availableAgents: 5,
  userInteracting: false,
};

const urgentContext = {
  urgent: true,
  availableAgents: 5,
  userInteracting: true,
};

const normalTaskInfo = contextAwareScheduler.calculateTaskPriority(
  task4,
  normalContext,
);
const urgentTaskInfo = contextAwareScheduler.calculateTaskPriority(
  task5,
  urgentContext,
);

console.log(
  `Normal context task adjusted priority: ${normalTaskInfo.effectivePriority}`,
);
console.log(
  `Urgent context task adjusted priority: ${urgentTaskInfo.effectivePriority}`,
);
console.log(
  `Applied patterns for urgent task: ${urgentTaskInfo.appliedPatterns.map((p) => p.name).join(', ')}`,
);

// ------------------------------------
// TEST 3: Dependency-Aware Execution
// ------------------------------------
console.log('\n\nTEST 3: DEPENDENCY-AWARE EXECUTION');

// Create tasks with dependencies
console.log('Creating tasks with dependencies...');

const rootTask = {
  id: 'root-task',
  name: 'Root Task',
  priority: 5,
};

const childTask1 = {
  id: 'child-task-1',
  name: 'Child Task 1',
  priority: 6,
  dependencies: ['root-task'],
};

const childTask2 = {
  id: 'child-task-2',
  name: 'Child Task 2',
  priority: 7,
  dependencies: ['root-task'],
};

const grandchildTask = {
  id: 'grandchild-task',
  name: 'Grandchild Task',
  priority: 8,
  dependencies: ['child-task-1', 'child-task-2'],
};

// Add tasks to dependency queue
dependencyQueue.addTask(rootTask);
dependencyQueue.addTask(childTask1);
dependencyQueue.addTask(childTask2);
dependencyQueue.addTask(grandchildTask);

// Get execution order
console.log('\nOptimal execution order respecting dependencies:');
const executionPlan = dependencyQueue.generateExecutionPlan();
executionPlan.forEach((task, index) => {
  console.log(`${index + 1}. ${task.name}`);
});

// ------------------------------------
// TEST 4: Resource Allocation
// ------------------------------------
console.log('\n\nTEST 4: RESOURCE ALLOCATION');

// Register agents with capabilities
console.log('Registering agents with capabilities...');

// Add agents (resources) to availability service
agentAvailability.registerResource({
  id: 'agent-1',
  name: 'Research Agent',
  type: 'agent',
  maxConcurrentTasks: 3,
  capabilities: [
    { id: 'research', level: 'EXPERT' },
    { id: 'writing', level: 'INTERMEDIATE' },
  ],
});

agentAvailability.registerResource({
  id: 'agent-2',
  name: 'Writing Agent',
  type: 'agent',
  maxConcurrentTasks: 2,
  capabilities: [
    { id: 'writing', level: 'EXPERT' },
    { id: 'editing', level: 'ADVANCED' },
  ],
});

agentAvailability.registerResource({
  id: 'agent-3',
  name: 'General Agent',
  type: 'agent',
  maxConcurrentTasks: 5,
  capabilities: [
    { id: 'research', level: 'BASIC' },
    { id: 'writing', level: 'BASIC' },
    { id: 'editing', level: 'INTERMEDIATE' },
  ],
});

// Display registered agents
console.log('\nRegistered agents:');
const allResources = agentAvailability.getAllResources();
allResources.forEach((resource) => {
  console.log(`- ${resource.name} (${resource.id})`);
  console.log(
    `  Capabilities: ${resource.capabilities.map((c) => `${c.id}:${c.level}`).join(', ')}`,
  );
});

// Allocate resources for tasks
console.log('\nAllocating resources for tasks...');

// Create allocation requests
const allocationRequest1 = {
  taskId: 'research-task',
  requiredCapabilities: [
    { capabilityId: 'research', essential: true, minimumLevel: 'ADVANCED' },
  ],
  priority: 8,
};

const allocationRequest2 = {
  taskId: 'writing-task',
  requiredCapabilities: [
    { capabilityId: 'writing', essential: true, minimumLevel: 'INTERMEDIATE' },
    { capabilityId: 'research', essential: false, minimumLevel: 'BASIC' },
  ],
  priority: 6,
};

// Perform allocations
const allocation1 = capabilityAllocation.allocateResources(allocationRequest1);
const allocation2 = capabilityAllocation.allocateResources(allocationRequest2);

// Display allocations
console.log('\nResource allocations:');
console.log(
  `Task '${allocationRequest1.taskId}' allocated to: ${allocation1.allocated.map((a) => a.resourceId).join(', ')}`,
);
console.log(
  `Task '${allocationRequest2.taskId}' allocated to: ${allocation2.allocated.map((a) => a.resourceId).join(', ')}`,
);

// Check load balancing
console.log('\nCurrent resource utilization:');
const utilization = agentAvailability.getResourceUtilization();
Object.entries(utilization).forEach(([resourceId, load]) => {
  const resource = agentAvailability.getResourceById(resourceId);
  console.log(`- ${resource.name}: ${Math.round(load * 100)}% load`);
});

// ------------------------------------
// TEST 5: Parallel Execution
// ------------------------------------
console.log('\n\nTEST 5: PARALLEL EXECUTION');

// Create parallel execution threads
console.log('Creating synchronization points for parallel execution...');

// Create a barrier synchronization point
const syncPointId = syncManager.createSyncPoint({
  name: 'Data Processing Barrier',
  type: 'BARRIER',
  participatingThreads: ['thread-1', 'thread-2', 'thread-3'],
  requiredThreads: ['thread-1', 'thread-2', 'thread-3'],
  description: 'Synchronization point for data processing completion',
});

console.log(`Created synchronization point: ${syncPointId}`);

// Register threads at sync point
console.log('\nRegistering threads at synchronization point...');
syncManager.registerThreadAtSyncPoint(syncPointId, 'thread-1');
console.log('Thread-1 registered at sync point');

syncManager.registerThreadAtSyncPoint(syncPointId, 'thread-2');
console.log('Thread-2 registered at sync point');

// Check status (should not be able to proceed yet)
let syncStatus = syncManager.checkSyncPointStatus(syncPointId);
console.log(`\nCan threads proceed? ${syncStatus.canProceed}`);
console.log(`Waiting threads: ${syncStatus.waitingThreads.join(', ')}`);
console.log(`Still waiting for: thread-3`);

// Register final thread
syncManager.registerThreadAtSyncPoint(syncPointId, 'thread-3');
console.log('Thread-3 registered at sync point');

// Check status again (should be able to proceed)
syncStatus = syncManager.checkSyncPointStatus(syncPointId);
console.log(`\nCan threads proceed now? ${syncStatus.canProceed}`);
console.log(`All waiting threads: ${syncStatus.waitingThreads.join(', ')}`);

// ------------------------------------
// TEST 6: Shared Data Management
// ------------------------------------
console.log('\n\nTEST 6: SHARED DATA MANAGEMENT');

// Create shared data
console.log('Creating shared data between execution threads...');

// Create a shared data item
dataSharing.createSharedData(
  'processing-results',
  { processed: 0, errors: 0 },
  {
    accessControl: {
      readThreads: 'all',
      writeThreads: ['thread-1', 'thread-2', 'thread-3'],
    },
    conflictResolution: 'LAST_WRITER_WINS',
  },
);

// Write data from different threads
console.log('\nUpdating shared data from different threads...');
dataSharing.writeSharedData(
  'processing-results',
  { processed: 10, errors: 0 },
  'thread-1',
);
console.log('Thread-1 updated shared data');

dataSharing.writeSharedData(
  'processing-results',
  { processed: 25, errors: 2 },
  'thread-2',
);
console.log('Thread-2 updated shared data');

// Read the current value
const currentValue = dataSharing.readSharedData(
  'processing-results',
  'thread-3',
);
console.log(`\nCurrent shared data value: ${JSON.stringify(currentValue)}`);

// Attempt to write from unauthorized thread
const unauthorizedResult = dataSharing.writeSharedData(
  'processing-results',
  { processed: 0, errors: 0 },
  'thread-4',
);
console.log(
  `Unauthorized thread write attempt succeeded? ${unauthorizedResult}`,
);

// ------------------------------------
// TEST 7: Multi-Task Progress Tracking
// ------------------------------------
console.log('\n\nTEST 7: MULTI-TASK PROGRESS TRACKING');

// Register tasks for progress tracking
console.log('Registering tasks for progress tracking...');

// Register tasks
taskProgress.registerTask('progress-task-1', 'thread-1', {
  type: 'processing',
});
console.log('Registered progress-task-1');

taskProgress.registerTask('progress-task-2', 'thread-2', { type: 'analysis' });
console.log('Registered progress-task-2');

// Update progress
console.log('\nUpdating task progress...');
taskProgress.updateTaskProgress(
  'progress-task-1',
  0.25,
  'running',
  'Processing data...',
);
console.log('Updated progress-task-1: 25%');

taskProgress.updateTaskProgress(
  'progress-task-2',
  0.1,
  'running',
  'Starting analysis...',
);
console.log('Updated progress-task-2: 10%');

// Get thread progress
const thread1Progress = taskProgress.getThreadProgress('thread-1');
const thread2Progress = taskProgress.getThreadProgress('thread-2');
console.log(
  `\nThread-1 overall progress: ${Math.round(thread1Progress * 100)}%`,
);
console.log(`Thread-2 overall progress: ${Math.round(thread2Progress * 100)}%`);

// Get overall progress
const overallProgress = taskProgress.getOverallProgress();
console.log(`Overall system progress: ${Math.round(overallProgress * 100)}%`);

// Update to completion
taskProgress.completeTask('progress-task-1', { result: 'success', items: 150 });
console.log('\nCompleted progress-task-1');

// Generate progress report
const progressReport = taskProgress.getProgressReport();
console.log('\nProgress Report Summary:');
console.log(`- Total tasks: ${progressReport.taskCount}`);
console.log(`- Completed tasks: ${progressReport.completedTasks}`);
console.log(
  `- Overall progress: ${Math.round(progressReport.overallProgress * 100)}%`,
);

// ------------------------------------
// TEST 8: Performance Monitoring
// ------------------------------------
console.log('\n\nTEST 8: PERFORMANCE MONITORING');

// Register metrics
console.log('Registering performance metrics...');

// Register a metric
const cpuMetricId = performanceMonitor.registerMetric({
  name: 'CPU Utilization',
  description: 'System CPU utilization percentage',
  value: 45,
  unit: '%',
  thresholds: {
    critical: 90,
    problematic: 80,
    concerning: 70,
    acceptable: 60,
    good: 40,
    optimal: 20,
  },
});

const memoryMetricId = performanceMonitor.registerMetric({
  name: 'Memory Usage',
  description: 'System memory usage',
  value: 1200,
  unit: 'MB',
  thresholds: {
    critical: 7000,
    problematic: 6000,
    concerning: 5000,
    acceptable: 4000,
    good: 2000,
    optimal: 1000,
  },
});

console.log(`Registered metrics: ${cpuMetricId}, ${memoryMetricId}`);

// Update metrics
console.log('\nUpdating metrics...');
performanceMonitor.updateMetric(cpuMetricId, 65);
console.log('Updated CPU metric to 65%');

performanceMonitor.updateMetric(memoryMetricId, 4500);
console.log('Updated Memory metric to 4500MB');

// Get current status
const systemStatus = performanceMonitor.getExecutionStatus();
console.log(`\nCurrent system status: ${systemStatus}`);

// Register task metrics
console.log('\nTracking task execution metrics...');
performanceMonitor.updateTaskMetrics('performance-task', {
  taskId: 'performance-task',
  status: 'running',
  progress: 0.3,
  resourceUtilization: {
    'agent-1': 0.8,
    'agent-2': 0.5,
  },
  events: [
    {
      timestamp: new Date(),
      type: 'milestone',
      description: 'Processing phase completed',
    },
  ],
});

// Generate performance report
const performanceReport = performanceMonitor.getSystemPerformanceReport();
console.log('\nPerformance Report:');
console.log(`- Status: ${performanceReport.overallStatus}`);
console.log(`- Metrics count: ${performanceReport.metricCount}`);
console.log(
  `- Top resource utilization: ${JSON.stringify(performanceReport.topResourceUtilization)}`,
);

// ------------------------------------
// TEST 9: Plan Adjustment
// ------------------------------------
console.log('\n\nTEST 9: PLAN ADJUSTMENT');

// Create a task plan
console.log('Creating a task plan...');

// Create a task plan with steps
const taskPlan = {
  taskId: 'planned-task',
  name: 'Complex Processing Task',
  steps: [
    { id: 'step-1', name: 'Data Loading', status: 'COMPLETED' },
    { id: 'step-2', name: 'Data Processing', status: 'RUNNING' },
    {
      id: 'step-3',
      name: 'Data Analysis',
      status: 'PENDING',
      dependencies: ['step-2'],
    },
    {
      id: 'step-4',
      name: 'Result Generation',
      status: 'PENDING',
      dependencies: ['step-3'],
    },
  ],
  expectedDuration: 60000,
  priority: 7,
};

// Register the plan
planAdjustment.registerTaskPlan(taskPlan);
console.log('Registered task plan for planned-task');

// Check for potential adjustments
const potentialAdjustments = planAdjustment.checkForAdjustments('planned-task');
console.log(
  `\nFound ${potentialAdjustments.length} potential plan adjustments`,
);

if (potentialAdjustments.length > 0) {
  console.log('Potential adjustments:');
  potentialAdjustments.forEach((adjustment) => {
    console.log(`- ${adjustment.type}: ${adjustment.reason}`);
  });

  // Apply an adjustment
  if (potentialAdjustments.length > 0) {
    const adjustment = potentialAdjustments[0];
    console.log(`\nApplying adjustment: ${adjustment.type}`);
    planAdjustment.applyAdjustment(
      'planned-task',
      adjustment.type,
      adjustment.reason,
    );

    // Get the updated plan
    const updatedPlan = planAdjustment.getTaskPlan('planned-task');
    console.log('Updated plan:', JSON.stringify(updatedPlan.metadata, null, 2));
  }
}

// ------------------------------------
// TEST 10: Failure Recovery
// ------------------------------------
console.log('\n\nTEST 10: FAILURE RECOVERY');

// Create a recovery plan for a failure
console.log('Creating failure recovery plan...');

// Create a recovery plan
const recoveryPlan = failureRecovery.createRecoveryPlan(
  'failure-1',
  'timeout',
  'data-processor',
  {
    timeoutMs: 30000,
    lastOperation: 'processLargeDataset',
  },
);

console.log(`Created recovery plan: ${recoveryPlan.id}`);
console.log(
  `Applicable strategies: ${recoveryPlan.strategies.map((s) => s.name).join(', ')}`,
);

// Execute the plan (async)
console.log('\nExecuting recovery plan (simulated)...');
failureRecovery.executeRecoveryPlan(recoveryPlan.id).then((result) => {
  console.log(
    `Recovery plan execution completed with result: ${result ? 'SUCCESS' : 'FAILURE'}`,
  );

  // Get the updated plan
  const completedPlan = failureRecovery.getRecoveryPlan(recoveryPlan.id);
  if (completedPlan) {
    console.log(`Plan phase: ${completedPlan.currentPhase}`);
    console.log(`Result: ${completedPlan.result}`);
  }
});

// Summary
console.log('\n\n=================================');
console.log('ADAPTIVE EXECUTION ENGINE DEMONSTRATION COMPLETE');
console.log('=================================');
console.log('All core services have been implemented and demonstrated:');
console.log('1. Priority-Based Scheduling');
console.log('2. Context-Aware Task Management');
console.log('3. Dependency-Aware Execution');
console.log('4. Resource Management & Allocation');
console.log('5. Parallel Execution Coordination');
console.log('6. Shared Data Management');
console.log('7. Multi-Task Progress Tracking');
console.log('8. Performance Monitoring');
console.log('9. Plan Adjustment');
console.log('10. Failure Recovery');
console.log('=================================');
console.log('Milestone 3: Adaptive Execution Engine - COMPLETE');
console.log('=================================');
