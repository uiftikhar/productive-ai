/**
 * Team Formation Service for the Agentic Meeting Analysis System
 *
 * This service implements advanced team formation logic:
 * - Meeting characteristics assessment
 * - Content-based team formation algorithms
 * - Resource optimization for team composition
 * - Incremental team building mechanisms
 * - Role combination for simpler meetings
 */
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { AgentExpertise } from '../interfaces/agent.interface';
import {
  SemanticChunkingService,
  ContentCharacteristics,
  ChunkMetadata,
} from './semantic-chunking.service';
import { StateManager } from '../state/state.manager';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

/**
 * Configuration options for TeamFormationService
 */
export interface TeamFormationConfig {
  logger?: Logger;
  stateManager: StateManager;
  semanticChunkingService?: SemanticChunkingService;
  maxTeamSize?: number;
  minTeamSize?: number;
}

/**
 * Team member with role and expertise
 */
export interface TeamMember {
  id: string;
  expertise: AgentExpertise[];
  primaryRole: AgentExpertise;
  confidence: number;
  assignments: string[];
}

/**
 * Meeting complexity assessment
 */
export interface MeetingComplexity {
  overall: 'simple' | 'moderate' | 'complex';
  technicalScore: number;
  interactiveScore: number;
  decisionScore: number;
  topicDiversityScore: number;
  recommendedTeamSize: number;
}

/**
 * Team composition configuration
 */
export interface TeamComposition {
  id: string;
  meetingId: string;
  complexity: MeetingComplexity;
  members: TeamMember[];
  requiredExpertise: Record<AgentExpertise, number>; // expertise -> priority score
  optionalExpertise: Record<AgentExpertise, number>; // expertise -> priority score
  created: number;
  updated: number;
}

/**
 * Implementation of team formation service
 */
export class TeamFormationService extends EventEmitter {
  private logger: Logger;
  private stateManager: StateManager;
  private semanticChunkingService: SemanticChunkingService;
  private maxTeamSize: number;
  private minTeamSize: number;

  /**
   * Create a new team formation service
   */
  constructor(config: TeamFormationConfig) {
    super();

    this.logger = config.logger || new ConsoleLogger();
    this.stateManager = config.stateManager;
    this.semanticChunkingService =
      config.semanticChunkingService ||
      new SemanticChunkingService({ logger: this.logger });
    this.maxTeamSize = config.maxTeamSize || 8;
    this.minTeamSize = config.minTeamSize || 2;

    this.logger.info('Initialized TeamFormationService');
  }

  /**
   * Initialize the team formation service
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing team formation service');

      // Additional initialization if needed

      this.logger.info('Team formation service initialized successfully');
    } catch (error) {
      this.logger.error(
        `Error initializing team formation service: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Assess meeting characteristics from transcript
   */
  async assessMeetingCharacteristics(
    meetingId: string,
    transcript: string,
  ): Promise<MeetingComplexity> {
    this.logger.info(
      `Assessing meeting characteristics for meeting ${meetingId}`,
    );

    try {
      // Step 1: Perform semantic chunking on the transcript
      const chunks =
        await this.semanticChunkingService.chunkTranscript(transcript);

      // Step 2: Analyze content characteristics from chunks
      const characteristics =
        await this.semanticChunkingService.analyzeContentCharacteristics(
          chunks,
        );

      // Step 3: Calculate complexity scores based on characteristics
      const technicalScore =
        characteristics.technicalComplexity * 0.7 +
        characteristics.domainSpecificity * 0.3;
      const interactiveScore =
        characteristics.participantInteractions * 0.6 +
        characteristics.controversyLevel * 0.4;
      const decisionScore = characteristics.decisionDensity;
      const topicDiversityScore = characteristics.topicDiversity;

      // Step 4: Determine overall complexity
      const overallScore =
        technicalScore * 0.3 +
        interactiveScore * 0.3 +
        decisionScore * 0.2 +
        topicDiversityScore * 0.2;

      let overallComplexity: 'simple' | 'moderate' | 'complex';

      if (overallScore < 0.33) {
        overallComplexity = 'simple';
      } else if (overallScore < 0.66) {
        overallComplexity = 'moderate';
      } else {
        overallComplexity = 'complex';
      }

      // Step 5: Calculate recommended team size based on complexity
      let recommendedTeamSize: number;

      if (overallComplexity === 'simple') {
        recommendedTeamSize = Math.max(
          this.minTeamSize,
          Math.round(this.minTeamSize * 1.2),
        );
      } else if (overallComplexity === 'moderate') {
        recommendedTeamSize = Math.round(
          (this.minTeamSize + this.maxTeamSize) / 2,
        );
      } else {
        recommendedTeamSize = Math.min(
          this.maxTeamSize,
          Math.round(this.maxTeamSize * 0.9),
        );
      }

      // Step 6: Create complexity assessment
      const complexity: MeetingComplexity = {
        overall: overallComplexity,
        technicalScore,
        interactiveScore,
        decisionScore,
        topicDiversityScore,
        recommendedTeamSize,
      };

      // Store assessment in state manager
      await this.stateManager.setState(
        `meeting:${meetingId}:complexity`,
        complexity,
      );

      this.logger.info(
        `Meeting ${meetingId} assessed as ${overallComplexity} complexity`,
      );

      return complexity;
    } catch (error) {
      this.logger.error(
        `Error assessing meeting characteristics: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Form an analysis team based on meeting characteristics
   */
  async formTeam(
    meetingId: string,
    transcript: string,
    availableAgents: string[],
  ): Promise<TeamComposition> {
    this.logger.info(`Forming team for meeting ${meetingId}`);

    try {
      // Step 1: Assess meeting characteristics
      const complexity = await this.assessMeetingCharacteristics(
        meetingId,
        transcript,
      );

      // Step 2: Determine required expertise based on content
      const requiredExpertise = await this.determineRequiredExpertise(
        meetingId,
        transcript,
        complexity,
      );

      // Step 3: Determine optional expertise
      const optionalExpertise = await this.determineOptionalExpertise(
        requiredExpertise,
        complexity,
      );

      // Step 4: Select team members optimizing for coverage and resource efficiency
      const members = await this.selectTeamMembers(
        meetingId,
        requiredExpertise,
        optionalExpertise,
        availableAgents,
        complexity.recommendedTeamSize,
      );

      // Step 5: Create team composition
      const teamComposition: TeamComposition = {
        id: `team-${uuidv4()}`,
        meetingId,
        complexity,
        members,
        requiredExpertise,
        optionalExpertise,
        created: Date.now(),
        updated: Date.now(),
      };

      // Step 6: Store team composition in state manager
      await this.stateManager.setState(
        `meeting:${meetingId}:team`,
        teamComposition,
      );

      // Step 7: Emit team formed event
      this.emit('team_formed', {
        meetingId,
        teamId: teamComposition.id,
        memberCount: members.length,
        expertiseCoverage: this.calculateExpertiseCoverage(
          members,
          requiredExpertise,
        ),
      });

      this.logger.info(
        `Team formed for meeting ${meetingId} with ${members.length} members`,
      );

      return teamComposition;
    } catch (error) {
      this.logger.error(
        `Error forming team: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Incrementally add new team members based on emerging needs
   */
  async addTeamMembers(
    meetingId: string,
    teamId: string,
    neededExpertise: AgentExpertise[],
    availableAgents: string[],
  ): Promise<TeamMember[]> {
    this.logger.info(
      `Adding team members with expertise ${neededExpertise.join(', ')} to team ${teamId}`,
    );

    try {
      // Step 1: Get current team composition
      const teamComposition = (await this.stateManager.getState(
        `meeting:${meetingId}:team`,
      )) as TeamComposition;

      if (!teamComposition) {
        throw new Error(`Team composition not found for meeting ${meetingId}`);
      }

      // Step 2: Create priority map for needed expertise
      const expertisePriority: Record<AgentExpertise, number> = {
        [AgentExpertise.COORDINATION]: 0,
        [AgentExpertise.SUMMARY_GENERATION]: 0,
        [AgentExpertise.ACTION_ITEM_EXTRACTION]: 0,
        [AgentExpertise.DECISION_TRACKING]: 0,
        [AgentExpertise.TOPIC_ANALYSIS]: 0,
        [AgentExpertise.SENTIMENT_ANALYSIS]: 0,
        [AgentExpertise.PARTICIPANT_DYNAMICS]: 0,
        [AgentExpertise.CONTEXT_INTEGRATION]: 0
      };
      for (let i = 0; i < neededExpertise.length; i++) {
        expertisePriority[neededExpertise[i]] = 1 - i / neededExpertise.length; // Prioritize earlier in the list
      }

      // Step 3: Select additional team members
      const currentMemberIds = teamComposition.members.map((m) => m.id);
      const eligibleAgents = availableAgents.filter(
        (a) => !currentMemberIds.includes(a),
      );

      // Get agent capabilities from state (simplified)
      const agentCapabilities: Record<string, AgentExpertise[]> = {};
      for (const agentId of eligibleAgents) {
        const agentState = await this.stateManager.getState(`agent:${agentId}`);
        if (agentState && agentState.expertise) {
          agentCapabilities[agentId] = agentState.expertise;
        } else {
          // Fallback if agent state not found
          agentCapabilities[agentId] = [AgentExpertise.COORDINATION];
        }
      }

      // Step 4: Score and select best agents
      const scoredAgents = this.scoreAgentsForExpertise(
        agentCapabilities,
        expertisePriority,
      );

      // Take top agents until we cover all needed expertise or run out of agents
      const selectedAgents: string[] = [];
      const coveredExpertise = new Set<AgentExpertise>();

      for (const { agentId, score, matchingExpertise } of scoredAgents) {
        if (selectedAgents.length >= neededExpertise.length) break;

        // Check if this agent covers any uncovered expertise
        const newExpertise = matchingExpertise.filter(
          (e) => !coveredExpertise.has(e),
        );

        if (newExpertise.length > 0) {
          selectedAgents.push(agentId);
          newExpertise.forEach((e) => coveredExpertise.add(e));
        }
      }

      // Step 5: Create team members
      const newMembers: TeamMember[] = selectedAgents.map((agentId) => {
        const expertise = agentCapabilities[agentId];
        const primaryExpertise =
          expertise.find((e) => neededExpertise.includes(e)) || expertise[0];

        return {
          id: agentId,
          expertise: expertise,
          primaryRole: primaryExpertise,
          confidence: 0.8, // Default initial confidence
          assignments: [],
        };
      });

      // Step 6: Update team composition
      teamComposition.members = [...teamComposition.members, ...newMembers];
      teamComposition.updated = Date.now();

      await this.stateManager.setState(
        `meeting:${meetingId}:team`,
        teamComposition,
      );

      // Step 7: Emit members added event
      this.emit('team_members_added', {
        meetingId,
        teamId,
        addedMembers: newMembers.map((m) => m.id),
        totalMembers: teamComposition.members.length,
      });

      this.logger.info(`Added ${newMembers.length} members to team ${teamId}`);

      return newMembers;
    } catch (error) {
      this.logger.error(
        `Error adding team members: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Optimize team composition for a simpler meeting
   */
  async optimizeForSimpleMeeting(
    meetingId: string,
    teamId: string,
  ): Promise<TeamComposition> {
    this.logger.info(
      `Optimizing team composition for simple meeting ${meetingId}`,
    );

    try {
      // Step 1: Get current team composition
      const teamComposition = (await this.stateManager.getState(
        `meeting:${meetingId}:team`,
      )) as TeamComposition;

      if (!teamComposition) {
        throw new Error(`Team composition not found for meeting ${meetingId}`);
      }

      // Step 2: Check if optimization is needed
      if (
        teamComposition.complexity.overall !== 'simple' ||
        teamComposition.members.length <= this.minTeamSize
      ) {
        // No optimization needed
        return teamComposition;
      }

      // Step 3: Identify roles that can be combined
      const roleCombinations = this.identifyRoleCombinations(teamComposition);

      // Step 4: Create optimized member list
      const optimizedMembers: TeamMember[] = [];
      const combinedRoles = new Set<string>();

      // Keep coordinator and essential roles
      for (const member of teamComposition.members) {
        // Always keep coordinator
        if (member.primaryRole === AgentExpertise.COORDINATION) {
          optimizedMembers.push(member);
          continue;
        }

        // Check if role is part of a combination and already processed
        if (combinedRoles.has(member.id)) {
          continue;
        }

        // Check if this role can be combined with another
        const combination = roleCombinations.find(
          (c) => c.memberId1 === member.id || c.memberId2 === member.id,
        );

        if (combination) {
          // This role can be combined, create a merged member
          const otherId =
            combination.memberId1 === member.id
              ? combination.memberId2
              : combination.memberId1;
          const otherMember = teamComposition.members.find(
            (m) => m.id === otherId,
          );

          if (otherMember) {
            // Create combined member
            const combinedMember: TeamMember = {
              id: member.id, // Keep first member's ID
              expertise: [
                ...new Set([...member.expertise, ...otherMember.expertise]),
              ],
              primaryRole: combination.primaryRole,
              confidence:
                Math.min(member.confidence, otherMember.confidence) * 0.9, // Slightly reduced confidence
              assignments: [
                ...new Set([...member.assignments, ...otherMember.assignments]),
              ],
            };

            optimizedMembers.push(combinedMember);
            combinedRoles.add(member.id);
            combinedRoles.add(otherMember.id);
          }
        } else {
          // This role cannot be combined, keep as is
          optimizedMembers.push(member);
        }
      }

      // Step 5: Update team composition
      teamComposition.members = optimizedMembers;
      teamComposition.updated = Date.now();

      await this.stateManager.setState(
        `meeting:${meetingId}:team`,
        teamComposition,
      );

      // Step 6: Emit team optimized event
      this.emit('team_optimized', {
        meetingId,
        teamId,
        originalSize: teamComposition.members.length + combinedRoles.size / 2,
        optimizedSize: optimizedMembers.length,
      });

      this.logger.info(
        `Optimized team ${teamId} from ${teamComposition.members.length + combinedRoles.size / 2} to ${optimizedMembers.length} members`,
      );

      return teamComposition;
    } catch (error) {
      this.logger.error(
        `Error optimizing team: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Determine required expertise based on content
   */
  private async determineRequiredExpertise(
    meetingId: string,
    transcript: string,
    complexity: MeetingComplexity,
  ): Promise<Record<AgentExpertise, number>> {
    // In a real implementation, this would use semantic analysis to determine required expertise

    // Create a complete record with all expertise types initialized to 0
    const requiredExpertise: Record<AgentExpertise, number> = {
      [AgentExpertise.COORDINATION]: 0,
      [AgentExpertise.SUMMARY_GENERATION]: 0,
      [AgentExpertise.ACTION_ITEM_EXTRACTION]: 0,
      [AgentExpertise.DECISION_TRACKING]: 0,
      [AgentExpertise.TOPIC_ANALYSIS]: 0,
      [AgentExpertise.SENTIMENT_ANALYSIS]: 0,
      [AgentExpertise.PARTICIPANT_DYNAMICS]: 0,
      [AgentExpertise.CONTEXT_INTEGRATION]: 0,
    };

    // Always include coordinator
    requiredExpertise[AgentExpertise.COORDINATION] = 1.0;

    // For simple meetings, focus on core expertise
    if (complexity.overall === 'simple') {
      requiredExpertise[AgentExpertise.SUMMARY_GENERATION] = 0.9;
      requiredExpertise[AgentExpertise.ACTION_ITEM_EXTRACTION] = 0.8;

      if (complexity.decisionScore > 0.5) {
        requiredExpertise[AgentExpertise.DECISION_TRACKING] = 0.7;
      }
    }
    // For moderate complexity, add more expertise
    else if (complexity.overall === 'moderate') {
      requiredExpertise[AgentExpertise.SUMMARY_GENERATION] = 0.9;
      requiredExpertise[AgentExpertise.ACTION_ITEM_EXTRACTION] = 0.9;
      requiredExpertise[AgentExpertise.DECISION_TRACKING] = 0.8;
      requiredExpertise[AgentExpertise.TOPIC_ANALYSIS] = 0.7;

      if (complexity.interactiveScore > 0.6) {
        requiredExpertise[AgentExpertise.PARTICIPANT_DYNAMICS] = 0.6;
      }
    }
    // For complex meetings, include all expertise
    else {
      requiredExpertise[AgentExpertise.SUMMARY_GENERATION] = 1.0;
      requiredExpertise[AgentExpertise.ACTION_ITEM_EXTRACTION] = 0.9;
      requiredExpertise[AgentExpertise.DECISION_TRACKING] = 0.9;
      requiredExpertise[AgentExpertise.TOPIC_ANALYSIS] = 0.8;
      requiredExpertise[AgentExpertise.SENTIMENT_ANALYSIS] = 0.7;
      requiredExpertise[AgentExpertise.PARTICIPANT_DYNAMICS] = 0.8;
      requiredExpertise[AgentExpertise.CONTEXT_INTEGRATION] = 0.7;
    }

    return requiredExpertise;
  }

  /**
   * Determine optional expertise based on meeting characteristics
   */
  private async determineOptionalExpertise(
    requiredExpertise: Record<AgentExpertise, number>,
    complexity: MeetingComplexity,
  ): Promise<Record<AgentExpertise, number>> {
    // Create a complete record with all expertise types initialized to 0
    const optionalExpertise: Record<AgentExpertise, number> = {
      [AgentExpertise.COORDINATION]: 0,
      [AgentExpertise.SUMMARY_GENERATION]: 0,
      [AgentExpertise.ACTION_ITEM_EXTRACTION]: 0,
      [AgentExpertise.DECISION_TRACKING]: 0,
      [AgentExpertise.TOPIC_ANALYSIS]: 0,
      [AgentExpertise.SENTIMENT_ANALYSIS]: 0,
      [AgentExpertise.PARTICIPANT_DYNAMICS]: 0,
      [AgentExpertise.CONTEXT_INTEGRATION]: 0,
    };

    // Add all expertise not in required list as optional
    for (const expertise of Object.values(AgentExpertise)) {
      if (requiredExpertise[expertise] === 0) {
        // Optional expertise has lower priority
        optionalExpertise[expertise] = 0.3;
      }
    }

    // Adjust based on complexity
    if (complexity.overall === 'simple') {
      // For simple meetings, limit optional expertise
      if (optionalExpertise[AgentExpertise.SENTIMENT_ANALYSIS] > 0) {
        optionalExpertise[AgentExpertise.SENTIMENT_ANALYSIS] = 0.2;
      }
      if (optionalExpertise[AgentExpertise.CONTEXT_INTEGRATION] > 0) {
        optionalExpertise[AgentExpertise.CONTEXT_INTEGRATION] = 0.1;
      }
    } else if (complexity.overall === 'complex') {
      // For complex meetings, increase priority of certain optional expertise
      if (optionalExpertise[AgentExpertise.SENTIMENT_ANALYSIS] > 0) {
        optionalExpertise[AgentExpertise.SENTIMENT_ANALYSIS] = 0.5;
      }
      if (optionalExpertise[AgentExpertise.CONTEXT_INTEGRATION] > 0) {
        optionalExpertise[AgentExpertise.CONTEXT_INTEGRATION] = 0.6;
      }
    }

    return optionalExpertise;
  }

  /**
   * Select team members based on required and optional expertise
   */
  private async selectTeamMembers(
    meetingId: string,
    requiredExpertise: Record<AgentExpertise, number>,
    optionalExpertise: Record<AgentExpertise, number>,
    availableAgents: string[],
    targetTeamSize: number,
  ): Promise<TeamMember[]> {
    // Get agent capabilities from state (simplified)
    const agentCapabilities: Record<string, AgentExpertise[]> = {};
    for (const agentId of availableAgents) {
      const agentState = await this.stateManager.getState(`agent:${agentId}`);
      if (agentState && agentState.expertise) {
        agentCapabilities[agentId] = agentState.expertise;
      } else {
        // Fallback if agent state not found
        agentCapabilities[agentId] = [AgentExpertise.COORDINATION];
      }
    }

    // Step 1: Score agents for required expertise
    const scoredForRequired = this.scoreAgentsForExpertise(
      agentCapabilities,
      requiredExpertise,
    );

    // Step 2: Select agents to cover required expertise
    const selectedAgents: string[] = [];
    const coveredExpertise = new Set<AgentExpertise>();

    // First pass: prioritize coverage of required expertise
    for (const { agentId, matchingExpertise } of scoredForRequired) {
      // Check if this agent covers any uncovered required expertise
      const newRequiredExpertise = matchingExpertise.filter(
        (e) => requiredExpertise[e] !== undefined && !coveredExpertise.has(e),
      );

      if (newRequiredExpertise.length > 0) {
        selectedAgents.push(agentId);
        newRequiredExpertise.forEach((e) => coveredExpertise.add(e));

        // Check if we've covered all required expertise
        if (
          Object.keys(requiredExpertise).every((e) =>
            coveredExpertise.has(e as AgentExpertise),
          )
        ) {
          break;
        }
      }
    }

    // Step 3: If we still haven't reached target team size, add agents with optional expertise
    if (selectedAgents.length < targetTeamSize) {
      const remainingAgents = availableAgents.filter(
        (a) => !selectedAgents.includes(a),
      );
      const combinedExpertise = { ...requiredExpertise, ...optionalExpertise };

      // Score remaining agents against all expertise
      const scoredRemaining = this.scoreAgentsForExpertise(
        Object.fromEntries(
          remainingAgents.map((a) => [a, agentCapabilities[a] || []]),
        ),
        combinedExpertise,
      );

      // Select additional agents up to target team size
      for (const { agentId } of scoredRemaining) {
        if (selectedAgents.length >= targetTeamSize) break;
        selectedAgents.push(agentId);
      }
    }

    // Step 4: Create team members
    const members: TeamMember[] = selectedAgents.map((agentId) => {
      const expertise = agentCapabilities[agentId];

      // Determine primary role
      let primaryRole: AgentExpertise;

      // First check required expertise that's covered
      const coveredRequired = expertise.filter(
        (e) => requiredExpertise[e] !== undefined,
      );
      if (coveredRequired.length > 0) {
        // Sort by priority
        primaryRole = coveredRequired.sort(
          (a, b) => (requiredExpertise[b] || 0) - (requiredExpertise[a] || 0),
        )[0];
      } else {
        // Fall back to first expertise
        primaryRole = expertise[0];
      }

      return {
        id: agentId,
        expertise,
        primaryRole,
        confidence: 0.9, // Default confidence
        assignments: [],
      };
    });

    return members;
  }

  /**
   * Score agents based on how well they match needed expertise
   */
  private scoreAgentsForExpertise(
    agentCapabilities: Record<string, AgentExpertise[]>,
    neededExpertise: Record<AgentExpertise, number>,
  ): Array<{
    agentId: string;
    score: number;
    matchingExpertise: AgentExpertise[];
  }> {
    const scoredAgents = [];

    for (const [agentId, expertise] of Object.entries(agentCapabilities)) {
      // Find matching expertise
      const matchingExpertise = expertise.filter(
        (e) => neededExpertise[e] !== undefined,
      );

      // Calculate score based on priority
      let score = 0;
      for (const exp of matchingExpertise) {
        score += neededExpertise[exp] || 0;
      }

      // Normalize by number of needed expertise
      score = score / Object.keys(neededExpertise).length;

      scoredAgents.push({ agentId, score, matchingExpertise });
    }

    // Sort by score, highest first
    return scoredAgents.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate expertise coverage percentage
   */
  private calculateExpertiseCoverage(
    members: TeamMember[],
    requiredExpertise: Record<AgentExpertise, number>,
  ): number {
    const requiredExpertiseList = Object.keys(
      requiredExpertise,
    ) as AgentExpertise[];
    const coveredExpertise = new Set<AgentExpertise>();

    // Collect all expertise covered by team members
    for (const member of members) {
      for (const expertise of member.expertise) {
        coveredExpertise.add(expertise);
      }
    }

    // Calculate coverage percentage
    const coveredCount = requiredExpertiseList.filter((e) =>
      coveredExpertise.has(e),
    ).length;
    return requiredExpertiseList.length > 0
      ? coveredCount / requiredExpertiseList.length
      : 1.0;
  }

  /**
   * Identify roles that can be combined in simple meetings
   */
  private identifyRoleCombinations(teamComposition: TeamComposition): Array<{
    memberId1: string;
    memberId2: string;
    primaryRole: AgentExpertise;
    score: number;
  }> {
    const combinations = [];

    // Define compatible expertise pairs
    const compatiblePairs = [
      [AgentExpertise.SUMMARY_GENERATION, AgentExpertise.TOPIC_ANALYSIS],
      [AgentExpertise.ACTION_ITEM_EXTRACTION, AgentExpertise.DECISION_TRACKING],
      [AgentExpertise.SENTIMENT_ANALYSIS, AgentExpertise.PARTICIPANT_DYNAMICS],
    ];

    // Find members with compatible expertise
    for (const [exp1, exp2] of compatiblePairs) {
      const membersWithExp1 = teamComposition.members.filter(
        (m) =>
          m.primaryRole === exp1 &&
          m.id !==
            teamComposition.members.find(
              (c) => c.primaryRole === AgentExpertise.COORDINATION,
            )?.id,
      );

      const membersWithExp2 = teamComposition.members.filter(
        (m) =>
          m.primaryRole === exp2 &&
          m.id !==
            teamComposition.members.find(
              (c) => c.primaryRole === AgentExpertise.COORDINATION,
            )?.id,
      );

      // Check if we can combine these roles
      if (membersWithExp1.length > 0 && membersWithExp2.length > 0) {
        for (const member1 of membersWithExp1) {
          for (const member2 of membersWithExp2) {
            // Calculate combination score (simple heuristic)
            const score =
              ((member1.confidence + member2.confidence) / 2) *
              (1 -
                Math.abs(
                  member1.assignments.length - member2.assignments.length,
                ) /
                  10);

            // Determine primary role based on priority
            const primaryRole =
              teamComposition.requiredExpertise[exp1] >
              teamComposition.requiredExpertise[exp2]
                ? exp1
                : exp2;

            combinations.push({
              memberId1: member1.id,
              memberId2: member2.id,
              primaryRole,
              score,
            });
          }
        }
      }
    }

    // Sort combinations by score
    return combinations.sort((a, b) => b.score - a.score);
  }
}
