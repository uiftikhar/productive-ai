/**
 * Emergent Roles & Adaptive Team Optimization Demo
 *
 * This file demonstrates how to use the new emergent roles and adaptive
 * team optimization services to implement Milestone 4 capabilities.
 */

import { RoleEmergenceService } from '../services/role-emergence.service';
import { AdaptiveTeamOptimizationService } from '../services/adaptive-team-optimization.service';
import { AgentRegistryService } from '../services/agent-registry.service';
import {
  RoleEmergencePattern,
  TeamRoleEventType,
  RoleAdjustmentType,
} from '../interfaces/emergent-roles.interface';
import { v4 as uuidv4 } from 'uuid';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Demo showing how to use emergent roles and adaptive team optimization
 */
async function runEmergentRolesDemo() {
  const logger = new ConsoleLogger();
  logger.info('Starting Emergent Roles & Adaptive Team Demo');

  // Initialize services
  const agentRegistry = AgentRegistryService.getInstance();
  const roleEmergence = RoleEmergenceService.getInstance();
  const teamOptimization = AdaptiveTeamOptimizationService.getInstance();

  // Create example data
  const teamId = uuidv4();
  const taskId = uuidv4();

  // Subscribe to role events
  roleEmergence.subscribeToEvents((event) => {
    logger.info(`Role event: ${event.type} for team ${event.teamId}`);
    logger.info(JSON.stringify(event.data, null, 2));
  });

  // Create emergent roles
  const analyzerRole = await roleEmergence.createEmergentRole({
    name: 'Data Analyzer',
    description: 'Analyzes complex data and extracts insights',
    responsibilities: [
      'Process raw data inputs',
      'Apply statistical methods',
      'Identify patterns and anomalies',
      'Generate reports on findings',
    ],
    requiredCapabilities: [
      'data_processing',
      'statistical_analysis',
      'pattern_recognition',
    ],
    pattern: RoleEmergencePattern.CAPABILITY_BASED,
  });

  const plannerRole = await roleEmergence.createEmergentRole({
    name: 'Task Planner',
    description: 'Plans and organizes task execution approach',
    responsibilities: [
      'Break down complex tasks',
      'Create execution timelines',
      'Identify dependencies',
      'Allocate resources effectively',
    ],
    requiredCapabilities: [
      'task_planning',
      'dependency_analysis',
      'resource_allocation',
    ],
    pattern: RoleEmergencePattern.TASK_AFFINITY_BASED,
  });

  logger.info(`Created roles: ${analyzerRole.name}, ${plannerRole.name}`);

  // Simulate team formation and role assignment
  // In a real implementation, this would happen as part of the recruitment protocol

  // Assign roles to agents
  // Note: In a production implementation, these agents would be registered
  // with the AgentRegistryService first
  const agent1Id = 'agent-123';
  const agent2Id = 'agent-456';

  // Simulate role assignments
  // In a real implementation, this would happen based on agent capabilities
  const assignment1 = await roleEmergence.assignRoleToAgent(
    agent1Id,
    analyzerRole.id,
    teamId,
    taskId,
    0.85, // Simulated match score
  );

  const assignment2 = await roleEmergence.assignRoleToAgent(
    agent2Id,
    plannerRole.id,
    teamId,
    taskId,
    0.92, // Simulated match score
  );

  logger.info('Roles assigned to agents');

  // Simulate team performance update
  // In production, this would come from monitoring actual agent performance
  await simulatePerformanceUpdate(teamOptimization, teamId, taskId);

  // Simulate workload imbalance
  await simulateWorkloadImbalance(teamOptimization, teamId, taskId, [
    { agentId: agent1Id, workloadPercentage: 0.85 },
    { agentId: agent2Id, workloadPercentage: 0.3 },
  ]);

  // Simulate role transition
  if (assignment1) {
    const transition = await roleEmergence.initiateRoleTransition(
      agent1Id,
      assignment1.id,
      plannerRole.id,
      'Agent capabilities better match the planner role based on performance',
      RoleAdjustmentType.TRANSITION,
    );

    if (transition) {
      // In a real implementation, the agent would handle the transition
      // and report back when complete
      await roleEmergence.completeRoleTransition(transition.id, true);

      logger.info(`Completed role transition for agent ${agent1Id}`);
    }
  }

  // Check the final team state
  const teamRoles = roleEmergence.getTeamRoles(teamId);
  logger.info(`Final team roles: ${teamRoles.map((r) => r.name).join(', ')}`);

  const agent1Roles = roleEmergence.getAgentRoleAssignments(agent1Id);
  logger.info(
    `Agent 1 roles: ${JSON.stringify(
      agent1Roles.map((r) => ({
        roleId: r.roleId,
        status: r.status,
      })),
      null,
      2,
    )}`,
  );

  logger.info('Emergent Roles & Adaptive Team Demo completed');
}

/**
 * Simulate performance update
 */
async function simulatePerformanceUpdate(
  teamOptimization: AdaptiveTeamOptimizationService,
  teamId: string,
  taskId: string,
): Promise<void> {
  // Create a simulated performance update event
  const performanceUpdate = {
    teamId,
    taskId,
    metrics: {
      efficiency: 0.65,
      quality: 0.72,
      collaboration: 0.58,
      weights: {
        efficiency: 0.3,
        quality: 0.4,
        collaboration: 0.3,
      },
    },
    agentPerformance: [
      {
        agentId: 'agent-123',
        roleId: 'role-analyzer',
        performanceScore: 0.55,
        contributionScore: 0.62,
        keyStrengths: ['pattern_recognition', 'report_generation'],
        improvementAreas: ['statistical_analysis'],
      },
      {
        agentId: 'agent-456',
        roleId: 'role-planner',
        performanceScore: 0.82,
        contributionScore: 0.78,
        keyStrengths: ['task_planning', 'dependency_analysis'],
        improvementAreas: [],
      },
    ],
    roleEffectiveness: [
      {
        roleId: 'role-analyzer',
        effectivenessScore: 0.58,
        observations: ['Lower than expected pattern recognition accuracy'],
      },
      {
        roleId: 'role-planner',
        effectivenessScore: 0.85,
        observations: ['Excellent task breakdown and dependency management'],
      },
    ],
    timestamp: Date.now(),
  };

  // Publish the performance update
  await (teamOptimization as any).handlePerformanceUpdate(performanceUpdate);
}

/**
 * Simulate workload imbalance
 */
async function simulateWorkloadImbalance(
  teamOptimization: AdaptiveTeamOptimizationService,
  teamId: string,
  taskId: string,
  agentWorkloads: { agentId: string; workloadPercentage: number }[],
): Promise<void> {
  // Create a simulated workload imbalance notification
  const workloadImbalance = {
    teamId,
    taskId,
    distribution: agentWorkloads.map((a) => ({
      agentId: a.agentId,
      roleId: a.agentId === 'agent-123' ? 'role-analyzer' : 'role-planner',
      workloadPercentage: a.workloadPercentage,
      taskCount: Math.floor(a.workloadPercentage * 10),
      estimatedHours: a.workloadPercentage * 40,
      complexity: a.workloadPercentage * 0.5 + 0.25,
    })),
    timestamp: Date.now(),
  };

  // Publish the workload imbalance
  await (teamOptimization as any).handleWorkloadImbalance(workloadImbalance);
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runEmergentRolesDemo().catch((error) => {
    console.error('Error running demo:', error);
  });
}
