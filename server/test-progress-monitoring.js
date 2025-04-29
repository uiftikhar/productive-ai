/**
 * Test Progress Monitoring System
 *
 * This script demonstrates how the progress monitoring system works
 * with the new metacognitive framework.
 */

const {
  ProgressMonitoringService,
  ProgressMonitoringEvent,
} = require('./dist/agents/services/progress-monitoring.service');

// Create a simple test function
async function testProgressMonitoring() {
  console.log('Starting progress monitoring test...');

  // Get the progress monitoring service
  const monitor = ProgressMonitoringService.getInstance({
    config: {
      // Use smaller values for testing
      stallThresholdMs: 5000, // 5 seconds
      monitoringIntervalMs: 1000, // 1 second
    },
  });

  // Set up event listeners
  monitor.on(ProgressMonitoringEvent.PROGRESS_UPDATE, (data) => {
    console.log(
      `Progress update for task ${data.taskId}: ${data.progress.completedSteps}/${data.progress.totalSteps} (${Math.round(data.progress.estimatedCompletion * 100)}%)`,
    );
  });

  monitor.on(ProgressMonitoringEvent.STALL_DETECTED, (data) => {
    console.log(`STALL DETECTED for task ${data.taskId}`);
    console.log(`- Details: ${data.anomalies[0].details}`);
    console.log(
      `- Suggested adaptations:`,
      data.suggestedAdaptations.map((a) => a.description),
    );
  });

  monitor.on(ProgressMonitoringEvent.ADAPTATION_RECOMMENDED, (data) => {
    console.log(
      `Adaptation recommended for task ${data.taskId} due to: ${data.adaptationReasons.join(', ')}`,
    );
  });

  monitor.on(ProgressMonitoringEvent.TASK_COMPLETED, (data) => {
    console.log(
      `Task ${data.taskId} completed in ${Math.round(data.executionTime / 1000)} seconds`,
    );
    console.log(
      `- Adaptations: ${data.adaptationCount}, Stalls: ${data.stallCount}`,
    );
  });

  // Start a test task
  const taskId = `test-task-${Date.now()}`;
  const capability = 'test-capability';

  console.log(`Creating test task ${taskId}...`);

  // Start monitoring with 10 total steps
  monitor.startMonitoring(taskId, capability, {
    totalSteps: 10,
    completedSteps: 0,
    currentStepIndex: 0,
  });

  // Update progress for first few steps normally
  for (let step = 1; step <= 3; step++) {
    await delay(1000);
    monitor.updateProgress(taskId, capability, {
      completedSteps: step,
    });

    if (step === 2) {
      // Add a milestone
      monitor.updateProgress(taskId, capability, {
        milestone: {
          description: 'Initial phase completed',
          completed: true,
        },
      });
    }
  }

  // Simulate a blocker
  monitor.updateProgress(taskId, capability, {
    blocker: {
      description: 'Encountered complex data structure',
      severity: 'medium',
    },
  });

  // Simulate a stall by not updating for a while
  console.log('Simulating a stall (pausing updates for 6 seconds)...');
  await delay(6000);

  // Recover from the stall
  console.log('Recovering from stall...');
  monitor.updateProgress(taskId, capability, {
    completedSteps: 4,
  });

  // Record an adaptation
  monitor.recordAdaptation(taskId, capability, 'simplified_approach');

  // Complete the remaining steps quickly
  for (let step = 5; step <= 10; step++) {
    await delay(500);
    monitor.updateProgress(taskId, capability, {
      completedSteps: step,
    });
  }

  // Wait a moment for final events to process
  await delay(1000);

  console.log('Test completed.');
}

// Helper function to create delays
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run the test
testProgressMonitoring().catch(console.error);
