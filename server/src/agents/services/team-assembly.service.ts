/**
 * Team Assembly Service
 * 
 * Implements capability-aware team formation for collaborative task execution
 * Part of the Supervisor Transformation in Milestone 2
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { BaseAgentInterface, AgentCapability } from '../interfaces/base-agent.interface';
import { AgentRegistryService } from './agent-registry.service';
import { 
  TeamFormationResult, 
  CapabilityComposition 
} from '../interfaces/collaboration.interface';

export interface TeamAssemblyOptions {
  teamSize?: number;
  strategy?: 'specialist' | 'generalist' | 'balanced';
  prioritizePerformance?: boolean;
  diversityWeight?: number;
  requiredRoles?: string[];
  taskComplexity?: number;
}

/**
 * TeamAssemblyService - Responsible for forming effective teams based on capability composition
 */
export class TeamAssemblyService {
  private static instance: TeamAssemblyService;
  private logger: Logger;
  private agentRegistry: AgentRegistryService;
  private agentPerformanceCache: Map<string, {
    successRate: number;
    averageExecutionTime: number;
    completedTasks: number;
    lastEvaluatedAt: number;
  }> = new Map();

  private constructor(
    options: {
      logger?: Logger;
      agentRegistry?: AgentRegistryService;
    } = {}
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.agentRegistry = options.agentRegistry || AgentRegistryService.getInstance();
    
    this.logger.info('TeamAssemblyService initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    options: {
      logger?: Logger;
      agentRegistry?: AgentRegistryService;
    } = {}
  ): TeamAssemblyService {
    if (!TeamAssemblyService.instance) {
      TeamAssemblyService.instance = new TeamAssemblyService(options);
    }
    return TeamAssemblyService.instance;
  }

  /**
   * Form a team for a specific task based on capability requirements
   */
  public async formTaskTeam(
    taskId: string,
    requiredCapabilities: string[] = [],
    taskDescription: string = '',
    options: TeamAssemblyOptions = {}
  ): Promise<TeamFormationResult> {
    const {
      teamSize = 3,
      strategy = 'balanced',
      prioritizePerformance = true,
      diversityWeight = 0.3,
    } = options;

    this.logger.info(`Forming team for task ${taskId} using strategy: ${strategy}`);
    
    // Get all available agents
    const availableAgents = this.agentRegistry.listAgents();
    
    if (availableAgents.length === 0) {
      this.logger.warn('No agents available for team formation');
      return {
        taskId,
        teamMembers: []
      };
    }
    
    // Calculate scores for each agent
    const scoredAgents = availableAgents.map(agent => {
      const agentCapabilities = agent.getCapabilities().map(c => c.name);
      
      // Calculate capability match
      const matchedCapabilities = requiredCapabilities.filter(rc => 
        agentCapabilities.includes(rc)
      );
      
      // Base capability score (0-1)
      const capabilityScore = requiredCapabilities.length > 0
        ? matchedCapabilities.length / requiredCapabilities.length
        : 0.5;
      
      // Performance score based on history (0-1)
      let performanceScore = 0.5; // Default neutral score
      const performance = this.agentPerformanceCache.get(agent.id);
      if (performance && prioritizePerformance) {
        performanceScore = Math.min(
          performance.successRate * 0.7 + 
          (1 - Math.min(performance.averageExecutionTime / 10000, 1)) * 0.3,
          1
        );
      }
      
      // Strategy-specific scoring
      let strategyScore = 0;
      switch (strategy) {
        case 'specialist':
          // Specialists should have high match on specific capabilities
          strategyScore = matchedCapabilities.length > 0 ? 0.3 : 0;
          break;
        case 'generalist':
          // Generalists should have many capabilities
          strategyScore = agentCapabilities.length > 5 ? 0.3 : 0;
          break;
        case 'balanced':
          // Balanced approach - some matching, some diversity
          strategyScore = 
            (capabilityScore * 0.5) + 
            (agentCapabilities.length / 10) * 0.5;
          break;
      }
      
      // Calculate final score
      const finalScore = 
        (capabilityScore * 0.5) + 
        (performanceScore * 0.3) + 
        (strategyScore * 0.2);
      
      // Determine role based on capabilities and strategy
      let role = 'contributor';
      if (matchedCapabilities.length === requiredCapabilities.length && 
          requiredCapabilities.length > 0) {
        role = 'specialist';
      } else if (agentCapabilities.includes('task-planning') || 
                 agentCapabilities.includes('work-coordination')) {
        role = 'coordinator';
      }
      
      // Generate reason for suggestion
      const suggestedReason = matchedCapabilities.length > 0
        ? `Matched ${matchedCapabilities.length} required capabilities: ${matchedCapabilities.join(', ')}`
        : `Selected as ${role} based on general capability fit and ${performance?.completedTasks || 0} completed tasks`;
      
      return {
        agent,
        agentId: agent.id,
        name: agent.name,
        score: finalScore,
        matchedCapabilities,
        agentCapabilities,
        role,
        suggestedReason
      };
    }).sort((a, b) => b.score - a.score);
    
    // Select initial members based on highest scores
    const selectedMembers: Set<string> = new Set();
    const teamMembers: Array<{
      agentId: string;
      name: string;
      role: string;
      score: number;
      suggestedReason: string;
    }> = [];
    
    // Always include the top scoring member if available
    if (scoredAgents.length > 0) {
      const topMember = scoredAgents[0];
      selectedMembers.add(topMember.agentId);
      teamMembers.push({
        agentId: topMember.agentId,
        name: topMember.name,
        role: topMember.role,
        score: topMember.score,
        suggestedReason: topMember.suggestedReason
      });
    }
    
    // Select remaining members to maximize team diversity and complementary capabilities
    while (teamMembers.length < teamSize && teamMembers.length < scoredAgents.length) {
      // Get the capabilities already covered by selected team members
      const coveredCapabilities = new Set<string>();
      
      for (const memberId of selectedMembers) {
        const member = scoredAgents.find(a => a.agentId === memberId);
        if (member) {
          member.agentCapabilities.forEach(cap => coveredCapabilities.add(cap));
        }
      }
      
      // Find the agent with the best complementary score
      let bestComplementaryAgent = null;
      let bestComplementaryScore = -1;
      
      for (const agent of scoredAgents) {
        // Skip if already selected
        if (selectedMembers.has(agent.agentId)) continue;
        
        // Calculate new capabilities this agent would bring
        const newCapabilities = agent.agentCapabilities.filter(
          cap => !coveredCapabilities.has(cap)
        );
        
        // Calculate complementary score
        const diversityBonus = newCapabilities.length * 0.1;
        const roleBonus = !teamMembers.some(m => m.role === agent.role) ? 0.2 : 0;
        
        // Balance between individual score and complementary value
        const complementaryScore = 
          (agent.score * (1 - diversityWeight)) + 
          ((diversityBonus + roleBonus) * diversityWeight);
        
        if (complementaryScore > bestComplementaryScore) {
          bestComplementaryScore = complementaryScore;
          bestComplementaryAgent = agent;
        }
      }
      
      // Add the best complementary agent to the team
      if (bestComplementaryAgent) {
        selectedMembers.add(bestComplementaryAgent.agentId);
        
        // Generate enhanced reason that highlights complementary value
        let enhancedReason = bestComplementaryAgent.suggestedReason;
        const newCapabilities = bestComplementaryAgent.agentCapabilities.filter(
          cap => !coveredCapabilities.has(cap)
        );
        
        if (newCapabilities.length > 0) {
          enhancedReason += `. Adds ${newCapabilities.length} complementary capabilities to the team.`;
        }
        
        if (!teamMembers.some(m => m.role === bestComplementaryAgent.role)) {
          enhancedReason += ` Adds ${bestComplementaryAgent.role} role diversity.`;
        }
        
        teamMembers.push({
          agentId: bestComplementaryAgent.agentId,
          name: bestComplementaryAgent.name,
          role: bestComplementaryAgent.role,
          score: bestComplementaryScore,
          suggestedReason: enhancedReason
        });
      } else {
        // No more complementary agents available
        break;
      }
    }
    
    this.logger.info(`Formed team with ${teamMembers.length} members for task ${taskId}`);
    
    return {
      taskId,
      teamMembers
    };
  }
  
  /**
   * Update agent performance metrics
   */
  public updateAgentPerformance(
    agentId: string, 
    metrics: {
      success: boolean;
      executionTimeMs: number;
    }
  ): void {
    // Get existing performance or create new entry
    const existingPerformance = this.agentPerformanceCache.get(agentId) || {
      successRate: 0.5,
      averageExecutionTime: 5000,
      completedTasks: 0,
      lastEvaluatedAt: Date.now()
    };
    
    // Update with exponential moving average (give more weight to recent performance)
    const weight = Math.min(1 / (existingPerformance.completedTasks + 1), 0.3);
    
    existingPerformance.successRate = 
      existingPerformance.successRate * (1 - weight) + 
      (metrics.success ? 1 : 0) * weight;
      
    existingPerformance.averageExecutionTime = 
      existingPerformance.averageExecutionTime * (1 - weight) + 
      metrics.executionTimeMs * weight;
      
    existingPerformance.completedTasks += 1;
    existingPerformance.lastEvaluatedAt = Date.now();
    
    this.agentPerformanceCache.set(agentId, existingPerformance);
  }
  
  /**
   * Get capability composition analysis for a task
   */
  public analyzeCapabilityComposition(
    taskId: string,
    requiredCapabilities: string[],
    taskDescription: string = ''
  ): CapabilityComposition {
    // Analyze required capabilities and their importance
    const analyzedCapabilities = requiredCapabilities.map(capability => {
      // Default values - in a real implementation, this would use more
      // sophisticated analysis of the task description and capability
      return {
        name: capability,
        importance: 0.8,
        specializationLevel: 0.7
      };
    });
    
    // Recommend team size based on capability count and specialization
    const specializationSum = analyzedCapabilities.reduce(
      (sum, cap) => sum + cap.specializationLevel, 0
    );
    
    const recommendedTeamSize = Math.max(
      2,
      Math.min(
        5,
        Math.ceil(analyzedCapabilities.length / 2)
      )
    );
    
    // Determine recommended balance based on specialization levels
    const avgSpecialization = 
      analyzedCapabilities.length > 0 
        ? specializationSum / analyzedCapabilities.length 
        : 0.5;
        
    let recommendedTeamBalance: 'specialist' | 'generalist' | 'balanced';
    
    if (avgSpecialization > 0.7) {
      recommendedTeamBalance = 'specialist';
    } else if (avgSpecialization < 0.4) {
      recommendedTeamBalance = 'generalist';
    } else {
      recommendedTeamBalance = 'balanced';
    }
    
    // Get agent recommendations
    const availableAgents = this.agentRegistry.listAgents();
    const agentRecommendations = availableAgents
      .map(agent => {
        const agentCapabilities = agent.getCapabilities().map(c => c.name);
        
        // Calculate match score based on required capabilities
        const matchedCapabilities = requiredCapabilities.filter(rc => 
          agentCapabilities.includes(rc)
        );
        
        const matchScore = requiredCapabilities.length > 0
          ? matchedCapabilities.length / requiredCapabilities.length
          : 0.5;
          
        return {
          agentId: agent.id,
          name: agent.name,
          matchScore,
          keyCapabilities: matchedCapabilities
        };
      })
      .filter(agent => agent.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5); // Top 5 recommendations
      
    return {
      taskId,
      requiredCapabilities: analyzedCapabilities,
      recommendedTeamSize,
      recommendedTeamBalance,
      agentRecommendations
    };
  }
} 