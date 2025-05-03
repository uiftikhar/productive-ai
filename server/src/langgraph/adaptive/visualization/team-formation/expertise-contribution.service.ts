import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  ExpertiseContributionVisualization,
  ExpertiseContribution,
} from '../../interfaces/visualization.interface';

/**
 * Implementation of the expertise contribution visualization service
 * This service visualizes agent expertise contributions to tasks and workflows
 */
export class ExpertiseContributionVisualizationImpl
  implements ExpertiseContributionVisualization
{
  private logger: Logger;
  private contributions: Map<string, ExpertiseContribution> = new Map();
  private agentContributions: Map<string, string[]> = new Map(); // agentId -> contributionIds[]
  private taskContributions: Map<string, string[]> = new Map(); // taskId -> contributionIds[]
  private expertiseTypes: Set<string> = new Set();

  constructor(options: { logger?: Logger }) {
    this.logger = options.logger || new ConsoleLogger();
    this.logger.info(
      'Expertise contribution visualization service initialized',
    );
  }

  /**
   * Record a new expertise contribution
   */
  recordContribution(contribution: Omit<ExpertiseContribution, 'id'>): string {
    try {
      // Validate contribution data
      if (!contribution.agentId) {
        throw new Error('Agent ID is required');
      }

      if (!contribution.taskId) {
        throw new Error('Task ID is required');
      }

      if (!contribution.expertiseType) {
        throw new Error('Expertise type is required');
      }

      if (
        contribution.contributionLevel < 0 ||
        contribution.contributionLevel > 1
      ) {
        this.logger.warn(
          `Invalid contribution level: ${contribution.contributionLevel} (should be between 0 and 1)`,
        );
        contribution.contributionLevel = Math.max(
          0,
          Math.min(1, contribution.contributionLevel),
        );
      }

      // Generate ID and create the complete contribution object
      const id = uuidv4();
      const completeContribution: ExpertiseContribution = {
        id,
        ...contribution,
        timestamp: contribution.timestamp || new Date(),
      };

      // Store the contribution
      this.contributions.set(id, completeContribution);

      // Update agent index
      if (!this.agentContributions.has(contribution.agentId)) {
        this.agentContributions.set(contribution.agentId, []);
      }
      this.agentContributions.get(contribution.agentId)!.push(id);

      // Update task index
      if (!this.taskContributions.has(contribution.taskId)) {
        this.taskContributions.set(contribution.taskId, []);
      }
      this.taskContributions.get(contribution.taskId)!.push(id);

      // Add expertise type to set
      this.expertiseTypes.add(contribution.expertiseType);

      this.logger.debug(
        `Recorded expertise contribution ${id} from agent ${contribution.agentId}`,
      );

      return id;
    } catch (error) {
      this.logger.error('Error recording expertise contribution:', { error });
      throw new Error('Failed to record expertise contribution');
    }
  }

  /**
   * Get a specific contribution by ID
   */
  getContribution(contributionId: string): ExpertiseContribution {
    const contribution = this.contributions.get(contributionId);

    if (!contribution) {
      this.logger.warn(`Contribution not found: ${contributionId}`);
      throw new Error(`Contribution not found: ${contributionId}`);
    }

    return JSON.parse(JSON.stringify(contribution)); // Return a copy to prevent modification
  }

  /**
   * Get all contributions from a specific agent
   */
  getAgentContributions(agentId: string): ExpertiseContribution[] {
    const contributionIds = this.agentContributions.get(agentId) || [];

    const contributions = contributionIds
      .map((id) => this.contributions.get(id))
      .filter((c) => c !== undefined) as ExpertiseContribution[];

    // Sort by timestamp, newest first
    contributions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return JSON.parse(JSON.stringify(contributions)); // Return copies to prevent modification
  }

  /**
   * Get all contributions for a specific task
   */
  getTaskContributions(taskId: string): ExpertiseContribution[] {
    const contributionIds = this.taskContributions.get(taskId) || [];

    const contributions = contributionIds
      .map((id) => this.contributions.get(id))
      .filter((c) => c !== undefined) as ExpertiseContribution[];

    // Sort by timestamp, newest first
    contributions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return JSON.parse(JSON.stringify(contributions)); // Return copies to prevent modification
  }

  /**
   * Visualize expertise distribution for a task
   */
  visualizeExpertiseDistribution(taskId: string): any {
    try {
      const contributions = this.getTaskContributions(taskId);

      if (contributions.length === 0) {
        return {
          taskId,
          message: 'No contributions recorded for this task',
          expertiseDistribution: {},
          agentDistribution: {},
          totalContributions: 0,
        };
      }

      // Group contributions by expertise type
      const expertiseGroups: Record<string, ExpertiseContribution[]> = {};

      for (const contribution of contributions) {
        if (!expertiseGroups[contribution.expertiseType]) {
          expertiseGroups[contribution.expertiseType] = [];
        }
        expertiseGroups[contribution.expertiseType].push(contribution);
      }

      // Calculate expertise type distribution
      const expertiseDistribution: Record<
        string,
        {
          count: number;
          averageLevel: number;
          totalLevel: number;
          percentage: number;
        }
      > = {};

      for (const [type, typeContributions] of Object.entries(expertiseGroups)) {
        const totalLevel = typeContributions.reduce(
          (sum, c) => sum + c.contributionLevel,
          0,
        );

        expertiseDistribution[type] = {
          count: typeContributions.length,
          averageLevel: totalLevel / typeContributions.length,
          totalLevel,
          percentage: (typeContributions.length / contributions.length) * 100,
        };
      }

      // Group contributions by agent
      const agentGroups: Record<string, ExpertiseContribution[]> = {};

      for (const contribution of contributions) {
        if (!agentGroups[contribution.agentId]) {
          agentGroups[contribution.agentId] = [];
        }
        agentGroups[contribution.agentId].push(contribution);
      }

      // Calculate agent distribution
      const agentDistribution: Record<
        string,
        {
          count: number;
          expertiseTypes: string[];
          averageLevel: number;
          totalLevel: number;
          percentage: number;
          topExpertise: string;
        }
      > = {};

      for (const [agentId, agentContributions] of Object.entries(agentGroups)) {
        const totalLevel = agentContributions.reduce(
          (sum, c) => sum + c.contributionLevel,
          0,
        );

        // Find expertise types for this agent
        const expertiseTypes = Array.from(
          new Set(agentContributions.map((c) => c.expertiseType)),
        );

        // Find top expertise (highest average contribution level)
        const expertiseLevels: Record<
          string,
          { total: number; count: number }
        > = {};

        for (const contribution of agentContributions) {
          if (!expertiseLevels[contribution.expertiseType]) {
            expertiseLevels[contribution.expertiseType] = {
              total: 0,
              count: 0,
            };
          }

          expertiseLevels[contribution.expertiseType].total +=
            contribution.contributionLevel;
          expertiseLevels[contribution.expertiseType].count += 1;
        }

        let topExpertise = expertiseTypes[0];
        let topExpertiseAvg = 0;

        for (const [type, data] of Object.entries(expertiseLevels)) {
          const avg = data.total / data.count;
          if (avg > topExpertiseAvg) {
            topExpertiseAvg = avg;
            topExpertise = type;
          }
        }

        agentDistribution[agentId] = {
          count: agentContributions.length,
          expertiseTypes,
          averageLevel: totalLevel / agentContributions.length,
          totalLevel,
          percentage: (agentContributions.length / contributions.length) * 100,
          topExpertise,
        };
      }

      // Calculate timeline of expertise contributions
      const timeline = this.generateContributionTimeline(taskId);

      return {
        taskId,
        expertiseDistribution,
        agentDistribution,
        totalContributions: contributions.length,
        uniqueAgents: Object.keys(agentGroups).length,
        uniqueExpertiseTypes: Object.keys(expertiseGroups).length,
        timeline,
      };
    } catch (error) {
      this.logger.error(`Error visualizing expertise distribution:`, {
        error,
        taskId,
      });
      throw new Error(
        `Failed to visualize expertise distribution for task ${taskId}`,
      );
    }
  }

  /**
   * Identify key contributors to a task
   */
  identifyKeyContributors(taskId: string): string[] {
    try {
      const contributions = this.getTaskContributions(taskId);

      if (contributions.length === 0) {
        return [];
      }

      // Group contributions by agent
      const agentContributions: Record<
        string,
        {
          contributions: ExpertiseContribution[];
          totalLevel: number;
          expertiseTypes: Set<string>;
        }
      > = {};

      for (const contribution of contributions) {
        if (!agentContributions[contribution.agentId]) {
          agentContributions[contribution.agentId] = {
            contributions: [],
            totalLevel: 0,
            expertiseTypes: new Set(),
          };
        }

        agentContributions[contribution.agentId].contributions.push(
          contribution,
        );
        agentContributions[contribution.agentId].totalLevel +=
          contribution.contributionLevel;
        agentContributions[contribution.agentId].expertiseTypes.add(
          contribution.expertiseType,
        );
      }

      // Calculate a "key contributor score" for each agent
      // This considers: total contribution level, number of contributions, and diversity of expertise
      const agentScores: Array<{ agentId: string; score: number }> = [];

      for (const [agentId, data] of Object.entries(agentContributions)) {
        const score =
          data.totalLevel * 0.5 + // 50% weight on total contribution level
          data.contributions.length * 0.3 + // 30% weight on number of contributions
          data.expertiseTypes.size * 0.2; // 20% weight on expertise diversity

        agentScores.push({ agentId, score });
      }

      // Sort by score (highest first) and take the top contributors
      agentScores.sort((a, b) => b.score - a.score);

      // Return the IDs of the top contributors (up to 3, or fewer if there aren't enough)
      const topContributors = agentScores.slice(
        0,
        Math.min(3, agentScores.length),
      );

      return topContributors.map((item) => item.agentId);
    } catch (error) {
      this.logger.error(`Error identifying key contributors:`, {
        error,
        taskId,
      });
      throw new Error(`Failed to identify key contributors for task ${taskId}`);
    }
  }

  /**
   * Calculate contribution balance for a task (0-1 scale)
   * A value closer to 1 indicates more balanced contributions
   */
  calculateContributionBalance(taskId: string): number {
    try {
      const contributions = this.getTaskContributions(taskId);

      if (contributions.length === 0) {
        return 0;
      }

      // Group contributions by agent
      const agentContributions: Record<string, number> = {};

      for (const contribution of contributions) {
        if (!agentContributions[contribution.agentId]) {
          agentContributions[contribution.agentId] = 0;
        }

        agentContributions[contribution.agentId] +=
          contribution.contributionLevel;
      }

      const contributionValues = Object.values(agentContributions);

      // If there's only one agent, the balance is 1 by default
      if (contributionValues.length <= 1) {
        return 1;
      }

      // Calculate the standard deviation of contributions
      const mean =
        contributionValues.reduce((sum, value) => sum + value, 0) /
        contributionValues.length;
      const variance =
        contributionValues.reduce(
          (sum, value) => sum + Math.pow(value - mean, 2),
          0,
        ) / contributionValues.length;
      const stdDev = Math.sqrt(variance);

      // Calculate coefficient of variation (CV)
      const cv = stdDev / mean;

      // Convert CV to a balance score (0-1)
      // Lower CV means more balanced contributions, so we invert it
      // We use an exponential decay function to map CV to [0,1]
      const balance = Math.exp(-2 * cv);

      return Math.max(0, Math.min(1, balance));
    } catch (error) {
      this.logger.error(`Error calculating contribution balance:`, {
        error,
        taskId,
      });
      throw new Error(
        `Failed to calculate contribution balance for task ${taskId}`,
      );
    }
  }

  /**
   * Helper method to generate a timeline of contributions for a task
   */
  private generateContributionTimeline(taskId: string): any {
    const contributions = this.getTaskContributions(taskId);

    if (contributions.length === 0) {
      return [];
    }

    // Sort contributions by timestamp - ensure timestamps are Date objects
    contributions.sort((a, b) => {
      const aTime =
        a.timestamp instanceof Date
          ? a.timestamp.getTime()
          : new Date(a.timestamp).getTime();
      const bTime =
        b.timestamp instanceof Date
          ? b.timestamp.getTime()
          : new Date(b.timestamp).getTime();
      return aTime - bTime;
    });

    // Group contributions into time buckets (hourly)
    const timeWindows: Record<
      string,
      {
        timestamp: Date;
        contributions: ExpertiseContribution[];
        expertiseTypes: Record<string, number>;
        agents: Set<string>;
      }
    > = {};

    for (const contribution of contributions) {
      // Create a time bucket key (YYYY-MM-DD HH:00)
      const timestamp =
        contribution.timestamp instanceof Date
          ? contribution.timestamp
          : new Date(contribution.timestamp);

      const date = new Date(timestamp);
      date.setMinutes(0, 0, 0); // Round down to the hour
      const timeKey = date.toISOString();

      if (!timeWindows[timeKey]) {
        timeWindows[timeKey] = {
          timestamp: date,
          contributions: [],
          expertiseTypes: {},
          agents: new Set(),
        };
      }

      timeWindows[timeKey].contributions.push(contribution);
      timeWindows[timeKey].agents.add(contribution.agentId);

      if (!timeWindows[timeKey].expertiseTypes[contribution.expertiseType]) {
        timeWindows[timeKey].expertiseTypes[contribution.expertiseType] = 0;
      }

      timeWindows[timeKey].expertiseTypes[contribution.expertiseType] += 1;
    }

    // Convert to array and sort by timestamp
    const timeline = Object.values(timeWindows).map((window) => ({
      timestamp: window.timestamp,
      contributionCount: window.contributions.length,
      uniqueAgents: Array.from(window.agents),
      agentCount: window.agents.size,
      expertiseTypes: window.expertiseTypes,
      averageContributionLevel:
        window.contributions.reduce((sum, c) => sum + c.contributionLevel, 0) /
        window.contributions.length,
    }));

    return timeline.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
  }
}
