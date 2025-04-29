/**
 * Team Assembly Service
 * 
 * Creates dynamic teams based on task requirements, capability matching,
 * and agent performance history
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { BaseAgentInterface } from '../interfaces/base-agent.interface';
import { AgentRegistryService } from './agent-registry.service';
import { AgentDiscoveryService } from './agent-discovery.service';
import { TaskPlanningService, PlannedTask } from './task-planning.service';

/**
 * Team structure
 */
export interface Team {
  id: string;
  name: string;
  description: string;
  members: TeamMember[];
  taskId?: string;
  formationStrategy: string;
  formationTimestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Team member structure
 */
export interface TeamMember {
  agentId: string;
  agentName: string;
  role: string;
  capabilities: string[];
  compatibilityScore: number; // 0-1 score of how well agent fits requirements
  performanceHistory?: {
    successRate: number;
    taskCount: number;
    averageCompletionTime: number;
  };
  metadata?: Record<string, any>;
}

/**
 * Team formation options
 */
export interface TeamFormationOptions {
  taskId?: string;
  taskDescription?: string;
  requiredCapabilities?: string[];
  preferredAgentIds?: string[];
  excludedAgentIds?: string[];
  teamSize?: number;
  prioritizePerformance?: boolean;
  considerCompatibility?: boolean;
  diversityWeight?: number; // 0-1 weight for encouraging diverse capabilities
  strategy?: 'specialist' | 'generalist' | 'balanced' | 'performance';
  metadata?: Record<string, any>;
}

/**
 * Configuration for the TeamAssemblyService
 */
export interface TeamAssemblyConfig {
  logger?: Logger;
  agentRegistry?: AgentRegistryService;
  agentDiscovery?: AgentDiscoveryService;
  taskPlanningService?: TaskPlanningService;
}

/**
 * Service for assembling teams of agents based on task requirements
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export class TeamAssemblyService {
  private static instance: TeamAssemblyService;
  private logger: Logger;
  private agentRegistry: AgentRegistryService;
  private agentDiscovery: AgentDiscoveryService;
  private taskPlanningService: TaskPlanningService;
  
  // Store created teams
  private teams: Map<string, Team> = new Map();
  
  // Performance history cache
  private agentPerformance: Map<string, {
    successRate: number;
    taskCount: number;
    averageCompletionTime: number;
    lastUpdated: number;
  }> = new Map();

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: TeamAssemblyConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    
    this.agentRegistry = config.agentRegistry || AgentRegistryService.getInstance();
    this.agentDiscovery = config.agentDiscovery || AgentDiscoveryService.getInstance();
    this.taskPlanningService = config.taskPlanningService || TaskPlanningService.getInstance();
    
    this.logger.info('Initialized TeamAssemblyService');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    config: TeamAssemblyConfig = {},
  ): TeamAssemblyService {
    if (!TeamAssemblyService.instance) {
      TeamAssemblyService.instance = new TeamAssemblyService(config);
    }
    return TeamAssemblyService.instance;
  }

  /**
   * Form a team based on task requirements
   */
  async formTeam(options: TeamFormationOptions = {}): Promise<Team> {
    this.logger.info('Forming team', options);
    
    // Determine the formation strategy
    const strategy = options.strategy || 'balanced';
    
    let task: PlannedTask | undefined;
    if (options.taskId) {
      // Find the task details if taskId is provided
      const allTaskPlans = this.taskPlanningService.listTaskPlans();
      for (const plan of allTaskPlans) {
        task = plan.tasks.find(t => t.id === options.taskId);
        if (task) break;
      }
    }
    
    // Get required capabilities
    let requiredCapabilities: string[] = options.requiredCapabilities || [];
    if (task && task.requiredCapabilities) {
      requiredCapabilities = [...requiredCapabilities, ...task.requiredCapabilities];
    }
    
    // Get task description
    const taskDescription = options.taskDescription || (task ? task.description : '');
    
    // Find candidate agents
    let candidateAgents: BaseAgentInterface[] = [];
    
    if (requiredCapabilities.length > 0) {
      // Use capability-based agent selection
      candidateAgents = await this.findAgentsByCapabilities(requiredCapabilities);
    } else if (taskDescription) {
      // Use task description to find relevant agents
      candidateAgents = await this.findAgentsForTask(taskDescription);
    } else {
      // Use all available agents as candidates
      candidateAgents = this.agentRegistry.listAgents();
    }
    
    // Filter out excluded agents
    if (options.excludedAgentIds && options.excludedAgentIds.length > 0) {
      const excludedSet = new Set(options.excludedAgentIds);
      candidateAgents = candidateAgents.filter(agent => !excludedSet.has(agent.id));
    }
    
    // Calculate compatibility scores for candidates
    const agentScores = await this.calculateAgentScores(
      candidateAgents,
      requiredCapabilities,
      taskDescription,
      options,
    );
    
    // Select team members based on strategy
    const selectedMembers = this.selectTeamMembers(
      agentScores,
      options,
      strategy,
    );
    
    // Create team structure
    const team: Team = {
      id: uuidv4(),
      name: `Team-${new Date().toISOString().substring(0, 10)}`,
      description: `Team formed for ${task ? task.name : 'unnamed task'} using ${strategy} strategy`,
      members: selectedMembers,
      taskId: options.taskId,
      formationStrategy: strategy,
      formationTimestamp: Date.now(),
      metadata: options.metadata,
    };
    
    // Store the team
    this.teams.set(team.id, team);
    
    this.logger.info(`Formed team ${team.id} with ${team.members.length} members`);
    
    return team;
  }

  /**
   * Find agents by capabilities
   */
  private async findAgentsByCapabilities(capabilities: string[]): Promise<BaseAgentInterface[]> {
    // This could be improved with a weighted matching algorithm
    const agents = this.agentRegistry.listAgents();
    
    return agents.filter(agent => {
      const agentCapabilities = agent.getCapabilities().map(c => c.name);
      // Check if agent has at least one of the required capabilities
      return capabilities.some(cap => agentCapabilities.includes(cap));
    });
  }

  /**
   * Find agents most suitable for a task based on its description
   */
  private async findAgentsForTask(taskDescription: string): Promise<BaseAgentInterface[]> {
    try {
      return await this.agentDiscovery.findAgentsForTask(taskDescription);
    } catch (error) {
      this.logger.warn('Error using agent discovery, falling back to all agents', { error });
      return this.agentRegistry.listAgents();
    }
  }

  /**
   * Calculate compatibility scores for candidate agents
   */
  private async calculateAgentScores(
    candidates: BaseAgentInterface[],
    requiredCapabilities: string[],
    taskDescription: string,
    options: TeamFormationOptions,
  ): Promise<Array<TeamMember & { agent: BaseAgentInterface; score: number }>> {
    const scores: Array<TeamMember & { agent: BaseAgentInterface; score: number }> = [];
    
    for (const agent of candidates) {
      // Get agent capabilities
      const capabilities = agent.getCapabilities().map(c => c.name);
      
      // Calculate capability match score (0-1)
      let capabilityScore = 0;
      if (requiredCapabilities.length > 0) {
        const matchedCapabilities = requiredCapabilities.filter(cap => 
          capabilities.includes(cap)
        );
        capabilityScore = matchedCapabilities.length / requiredCapabilities.length;
      } else {
        // If no specific capabilities required, give neutral score
        capabilityScore = 0.5;
      }
      
      // Get performance history
      let performanceScore = 0.5; // Default neutral score
      const performance = this.getAgentPerformance(agent.id);
      if (performance && options.prioritizePerformance) {
        performanceScore = performance.successRate;
      }
      
      // Calculate overall compatibility score
      let compatibilityScore = 0.5; // Default neutral score
      if (options.considerCompatibility) {
        // This would be enhanced with a more sophisticated compatibility algorithm
        compatibilityScore = 0.5;
      }
      
      // Calculate final score
      // Weight the different factors according to the strategy
      let finalScore = 0;
      
      switch (options.strategy) {
        case 'specialist':
          finalScore = capabilityScore * 0.7 + performanceScore * 0.2 + compatibilityScore * 0.1;
          break;
        case 'performance':
          finalScore = performanceScore * 0.7 + capabilityScore * 0.2 + compatibilityScore * 0.1;
          break;
        case 'generalist':
          // For generalist strategy, value agents with more capabilities
          finalScore = (capabilities.length / 10) * 0.5 + performanceScore * 0.3 + compatibilityScore * 0.2;
          break;
        case 'balanced':
        default:
          finalScore = capabilityScore * 0.4 + performanceScore * 0.4 + compatibilityScore * 0.2;
          break;
      }
      
      // Boost score for preferred agents
      if (options.preferredAgentIds && options.preferredAgentIds.includes(agent.id)) {
        finalScore = Math.min(1, finalScore * 1.2);
      }
      
      scores.push({
        agent,
        agentId: agent.id,
        agentName: agent.name,
        role: this.determineRole(agent, requiredCapabilities),
        capabilities,
        compatibilityScore,
        performanceHistory: performance,
        score: finalScore,
      });
    }
    
    // Sort by score descending
    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Determine a role for an agent based on capabilities
   */
  private determineRole(agent: BaseAgentInterface, requiredCapabilities: string[]): string {
    const agentCapabilities = agent.getCapabilities().map(c => c.name);
    
    // Check if agent is a specialist (matches one specific capability very well)
    if (requiredCapabilities.length > 0) {
      for (const cap of requiredCapabilities) {
        if (agentCapabilities.includes(cap)) {
          return `${cap} specialist`;
        }
      }
    }
    
    // Check for known capability patterns and assign roles
    if (agentCapabilities.includes('planning')) {
      return 'Planner';
    } else if (agentCapabilities.includes('research')) {
      return 'Researcher';
    } else if (agentCapabilities.includes('coding')) {
      return 'Developer';
    } else if (agentCapabilities.includes('writing')) {
      return 'Content Creator';
    } else if (agentCapabilities.includes('data-analysis')) {
      return 'Analyst';
    }
    
    // Default role
    return 'Team Member';
  }

  /**
   * Select team members based on scores and strategy
   */
  private selectTeamMembers(
    scoredCandidates: Array<TeamMember & { agent: BaseAgentInterface; score: number }>,
    options: TeamFormationOptions,
    strategy: string,
  ): TeamMember[] {
    // Determine team size
    const targetSize = options.teamSize || this.calculateOptimalTeamSize(
      options.requiredCapabilities?.length || 0,
      strategy,
    );
    
    const selected: TeamMember[] = [];
    const selectedCapabilities = new Set<string>();
    const selectedAgentIds = new Set<string>();
    
    // First pass: select agents based on strategy
    for (const candidate of scoredCandidates) {
      // Stop if we've reached the target size
      if (selected.length >= targetSize) break;
      
      // Skip if already selected
      if (selectedAgentIds.has(candidate.agentId)) continue;
      
      let shouldSelect = false;
      
      switch (strategy) {
        case 'specialist':
          // Select if agent has high capability match and we don't have good coverage yet
          shouldSelect = candidate.score > 0.7 && !this.hasCapabilityOverlap(candidate.capabilities, selectedCapabilities);
          break;
        
        case 'performance':
          // Select highest performing agents regardless of capability overlap
          shouldSelect = candidate.score > 0.6;
          break;
        
        case 'generalist':
          // Select agents with broader capability sets
          shouldSelect = candidate.capabilities.length > 3 && candidate.score > 0.5;
          break;
        
        case 'balanced':
        default:
          // Balance capability coverage and performance
          shouldSelect = candidate.score > 0.6 && this.hasCapabilityOverlap(candidate.capabilities, selectedCapabilities) < 0.5;
          break;
      }
      
      if (shouldSelect) {
        selected.push(this.createTeamMember(candidate));
        selectedAgentIds.add(candidate.agentId);
        candidate.capabilities.forEach(cap => selectedCapabilities.add(cap));
      }
    }
    
    // Second pass: fill remaining spots if needed
    while (selected.length < targetSize && scoredCandidates.length > selected.length) {
      // Find the best remaining candidate
      for (const candidate of scoredCandidates) {
        if (!selectedAgentIds.has(candidate.agentId)) {
          selected.push(this.createTeamMember(candidate));
          selectedAgentIds.add(candidate.agentId);
          break;
        }
      }
    }
    
    return selected;
  }

  /**
   * Create a team member object from a scored candidate
   */
  private createTeamMember(
    candidate: TeamMember & { agent: BaseAgentInterface; score: number }
  ): TeamMember {
    const { agent, score, ...memberData } = candidate;
    return memberData;
  }

  /**
   * Calculate the optimal team size based on task complexity
   */
  private calculateOptimalTeamSize(requiredCapabilitiesCount: number, strategy: string): number {
    // Base size on the number of required capabilities
    let baseSize = Math.max(2, requiredCapabilitiesCount);
    
    // Adjust based on strategy
    switch (strategy) {
      case 'specialist':
        // One specialist per capability, plus one coordinator
        return requiredCapabilitiesCount + 1;
      
      case 'generalist':
        // Fewer generalists can cover more capabilities
        return Math.max(2, Math.ceil(requiredCapabilitiesCount / 2));
      
      case 'performance':
        // Focus on a smaller, high-performing team
        return Math.max(2, Math.ceil(baseSize * 0.7));
      
      case 'balanced':
      default:
        // Balanced approach
        return baseSize;
    }
  }

  /**
   * Calculate what percentage of an agent's capabilities overlap with already selected capabilities
   * Returns a value between 0 (no overlap) and 1 (complete overlap)
   */
  private hasCapabilityOverlap(
    capabilities: string[],
    selectedCapabilities: Set<string>,
  ): number {
    if (capabilities.length === 0) return 0;
    if (selectedCapabilities.size === 0) return 0;
    
    let overlapCount = 0;
    for (const cap of capabilities) {
      if (selectedCapabilities.has(cap)) {
        overlapCount++;
      }
    }
    
    return overlapCount / capabilities.length;
  }

  /**
   * Get performance history for an agent
   */
  private getAgentPerformance(agentId: string): {
    successRate: number;
    taskCount: number;
    averageCompletionTime: number;
  } | undefined {
    const cached = this.agentPerformance.get(agentId);
    
    if (cached) {
      // Return cached data if it's recent (less than 1 hour old)
      const cacheAge = Date.now() - cached.lastUpdated;
      if (cacheAge < 60 * 60 * 1000) {
        return {
          successRate: cached.successRate,
          taskCount: cached.taskCount,
          averageCompletionTime: cached.averageCompletionTime,
        };
      }
    }
    
    // For now, we'll just return placeholder data
    // This would be replaced with actual performance tracking
    const performance = {
      successRate: Math.random() * 0.3 + 0.7, // Random value between 0.7 and 1.0
      taskCount: Math.floor(Math.random() * 20) + 1,
      averageCompletionTime: Math.floor(Math.random() * 60000) + 10000,
      lastUpdated: Date.now(),
    };
    
    // Cache the data
    this.agentPerformance.set(agentId, performance);
    
    return {
      successRate: performance.successRate,
      taskCount: performance.taskCount,
      averageCompletionTime: performance.averageCompletionTime,
    };
  }

  /**
   * Get a team by ID
   */
  getTeam(teamId: string): Team | undefined {
    return this.teams.get(teamId);
  }

  /**
   * List all teams
   */
  listTeams(): Team[] {
    return Array.from(this.teams.values());
  }

  /**
   * Update a team's metadata
   */
  updateTeamMetadata(teamId: string, metadata: Record<string, any>): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;
    
    team.metadata = { ...(team.metadata || {}), ...metadata };
    this.teams.set(teamId, team);
    
    return true;
  }

  /**
   * Add a member to an existing team
   */
  addTeamMember(teamId: string, member: TeamMember): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;
    
    // Check if agent is already a member
    if (team.members.some(m => m.agentId === member.agentId)) {
      return false;
    }
    
    team.members.push(member);
    this.teams.set(teamId, team);
    
    return true;
  }

  /**
   * Remove a member from a team
   */
  removeTeamMember(teamId: string, agentId: string): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;
    
    const initialLength = team.members.length;
    team.members = team.members.filter(m => m.agentId !== agentId);
    
    if (team.members.length !== initialLength) {
      this.teams.set(teamId, team);
      return true;
    }
    
    return false;
  }

  /**
   * Delete a team
   */
  deleteTeam(teamId: string): boolean {
    return this.teams.delete(teamId);
  }
} 