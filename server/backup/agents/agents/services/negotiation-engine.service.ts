/**
 * Negotiation Engine Service
 *
 * Implements utility-based negotiation logic for agent team formation
 * including counter-proposal mechanisms and conflict resolution strategies.
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { AgentRegistryService } from './agent-registry.service';
import {
  UtilityCalculationParams,
  UtilityScore,
  ResolutionStrategy,
  RecruitmentProposalMessage,
  CounterProposalMessage,
  RecruitmentMessageType,
} from '../interfaces/recruitment-protocol.interface';
import { AgentRecruitmentService } from './agent-recruitment.service';
import { CapabilityAdvertisementService } from './capability-advertisement.service';

/**
 * Conflict resolution result
 */
interface ConflictResolutionResult {
  strategy: ResolutionStrategy;
  proposal: RecruitmentProposalMessage | CounterProposalMessage;
  explanation: string;
  compromiseDetails?: Record<string, any>;
}

/**
 * Service for negotiation logic between agents
 */
export class NegotiationEngineService {
  private static instance: NegotiationEngineService;
  private logger: Logger;
  private agentRegistry: AgentRegistryService;
  private recruitmentService: AgentRecruitmentService;
  private advertisementService: CapabilityAdvertisementService;

  /**
   * Private constructor (singleton pattern)
   */
  private constructor(
    options: {
      logger?: Logger;
      agentRegistry?: AgentRegistryService;
      recruitmentService?: AgentRecruitmentService;
      advertisementService?: CapabilityAdvertisementService;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.agentRegistry =
      options.agentRegistry || AgentRegistryService.getInstance();
    this.recruitmentService =
      options.recruitmentService || AgentRecruitmentService.getInstance();
    this.advertisementService =
      options.advertisementService ||
      CapabilityAdvertisementService.getInstance();

    this.logger.info('NegotiationEngineService initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(
    options: {
      logger?: Logger;
      agentRegistry?: AgentRegistryService;
      recruitmentService?: AgentRecruitmentService;
      advertisementService?: CapabilityAdvertisementService;
    } = {},
  ): NegotiationEngineService {
    if (!NegotiationEngineService.instance) {
      NegotiationEngineService.instance = new NegotiationEngineService(options);
    }
    return NegotiationEngineService.instance;
  }

  /**
   * Calculate the utility score for an agent-task pairing
   */
  public calculateUtility(params: UtilityCalculationParams): UtilityScore {
    const { agent, task, team } = params;

    // 1. Capability match calculation
    const requiredCapabilities = new Set(task.requiredCapabilities);
    const desiredCapabilities = new Set(task.desiredCapabilities || []);
    const agentCapabilities = new Set(agent.capabilities);

    // Count matches
    let requiredMatches = 0;
    for (const capability of requiredCapabilities) {
      if (agentCapabilities.has(capability)) {
        requiredMatches++;
      }
    }

    let desiredMatches = 0;
    for (const capability of desiredCapabilities) {
      if (agentCapabilities.has(capability)) {
        desiredMatches++;
      }
    }

    // Calculate capability match score
    const requiredMatchRatio =
      requiredCapabilities.size > 0
        ? requiredMatches / requiredCapabilities.size
        : 1;

    const desiredMatchRatio =
      desiredCapabilities.size > 0
        ? desiredMatches / desiredCapabilities.size
        : 1;

    // Weight required capabilities more heavily
    const capabilityMatch = requiredMatchRatio * 0.7 + desiredMatchRatio * 0.3;

    // 2. Confidence adjustment
    let confidenceSum = 0;
    let matchedCapabilitiesCount = 0;

    // Calculate average confidence for matched capabilities
    for (const capability of requiredCapabilities) {
      if (
        agentCapabilities.has(capability) &&
        agent.confidenceScores[capability]
      ) {
        confidenceSum += agent.confidenceScores[capability];
        matchedCapabilitiesCount++;
      }
    }

    for (const capability of desiredCapabilities) {
      if (
        agentCapabilities.has(capability) &&
        agent.confidenceScores[capability]
      ) {
        confidenceSum += agent.confidenceScores[capability] * 0.5; // Weight desired capabilities less
        matchedCapabilitiesCount += 0.5;
      }
    }

    const confidenceAdjustment =
      matchedCapabilitiesCount > 0
        ? confidenceSum / matchedCapabilitiesCount
        : 0.5; // Default medium confidence

    // 3. Availability match
    // Higher score for more available agents, adjusted by task priority
    const availabilityMatch = (1 - agent.availability) * (task.priority / 10);

    // 4. Team complementarity calculation
    let teamComplementarity = 0.5; // Default medium score

    if (team && team.currentMembers.length > 0) {
      // Create a set of all capabilities already present on the team
      const teamCapabilities = new Set<string>();
      for (const member of team.currentMembers) {
        member.capabilities.forEach((cap: string) => teamCapabilities.add(cap));
      }

      // Count unique capabilities this agent would add
      const uniqueContributions = agent.capabilities.filter(
        (cap: string) => !teamCapabilities.has(cap),
      ).length;

      // Calculate complementarity as a ratio of unique contributions to total capabilities
      teamComplementarity =
        uniqueContributions > 0
          ? Math.min(uniqueContributions / agent.capabilities.length, 1)
          : 0.2; // Low value if no unique contributions
    }

    // 5. Expected contribution based on specializations and task requirements
    const specializationMatch = agent.specializations.filter(
      (spec: string) =>
        task.requiredCapabilities.includes(spec) ||
        (task.desiredCapabilities || []).includes(spec),
    ).length;

    const expectedContribution =
      agent.recentSuccessRate * 0.4 + (specializationMatch > 0 ? 0.6 : 0.3);

    // Calculate overall score as weighted combination
    const overallScore =
      capabilityMatch * 0.35 +
      confidenceAdjustment * 0.25 +
      availabilityMatch * 0.15 +
      (team ? teamComplementarity * 0.15 : 0) +
      expectedContribution * 0.25;

    // Generate explanation
    const explanation =
      `Agent ${agent.id} has a ${Math.round(capabilityMatch * 100)}% capability match with ` +
      `${requiredMatches}/${requiredCapabilities.size} required capabilities and ` +
      `${desiredMatches}/${desiredCapabilities.size} desired capabilities. ` +
      `Confidence level is ${Math.round(confidenceAdjustment * 100)}%, with availability of ` +
      `${Math.round((1 - agent.availability) * 100)}%. ` +
      (team
        ? `Agent would add ${Math.round(teamComplementarity * 100)}% unique capabilities to the team. `
        : '') +
      `Expected contribution based on specializations and past performance: ${Math.round(expectedContribution * 100)}%.`;

    return {
      overallScore,
      capabilityMatch,
      availabilityMatch,
      teamComplementarity: team ? teamComplementarity : undefined,
      expectedContribution,
      confidenceAdjustment,
      explanation,
    };
  }

  /**
   * Generate a counter proposal based on conflicts in the original proposal
   */
  public generateCounterProposal(
    originalProposal: RecruitmentProposalMessage,
    agentPreferences: {
      preferredRole?: string;
      preferredResponsibilities?: string[];
      preferredDuration?: number;
      availableStartTime?: number;
      minimumCompensation?: {
        type: string;
        value: number;
      };
      specializedCapabilities?: string[];
    },
  ): CounterProposalMessage {
    const modifiedTerms: {
      field: string;
      originalValue: any;
      proposedValue: any;
      justification: string;
    }[] = [];

    // Check role preference
    if (
      agentPreferences.preferredRole &&
      agentPreferences.preferredRole !== originalProposal.proposedRole
    ) {
      modifiedTerms.push({
        field: 'proposedRole',
        originalValue: originalProposal.proposedRole,
        proposedValue: agentPreferences.preferredRole,
        justification: `Agent specializes in ${agentPreferences.preferredRole} roles`,
      });
    }

    // Check responsibilities
    if (
      agentPreferences.preferredResponsibilities &&
      agentPreferences.preferredResponsibilities.length > 0
    ) {
      // Find responsibilities to add and remove
      const toAdd = agentPreferences.preferredResponsibilities.filter(
        (r) => !originalProposal.responsibilities.includes(r),
      );

      const toRemove = originalProposal.responsibilities.filter(
        (r) => !agentPreferences.preferredResponsibilities!.includes(r),
      );

      if (toAdd.length > 0 || toRemove.length > 0) {
        const newResponsibilities = originalProposal.responsibilities
          .filter((r) => !toRemove.includes(r))
          .concat(toAdd);

        modifiedTerms.push({
          field: 'responsibilities',
          originalValue: originalProposal.responsibilities,
          proposedValue: newResponsibilities,
          justification: `Adjusting responsibilities to better match agent expertise`,
        });
      }
    }

    // Check duration
    if (
      agentPreferences.preferredDuration &&
      agentPreferences.preferredDuration < originalProposal.expectedDuration
    ) {
      modifiedTerms.push({
        field: 'expectedDuration',
        originalValue: originalProposal.expectedDuration,
        proposedValue: agentPreferences.preferredDuration,
        justification: `Agent can complete the task in less time`,
      });
    }

    // Check compensation
    if (agentPreferences.minimumCompensation && originalProposal.compensation) {
      if (
        agentPreferences.minimumCompensation.type ===
          originalProposal.compensation.type &&
        agentPreferences.minimumCompensation.value >
          originalProposal.compensation.value
      ) {
        modifiedTerms.push({
          field: 'compensation',
          originalValue: originalProposal.compensation,
          proposedValue: agentPreferences.minimumCompensation,
          justification: `Task requires higher compensation based on agent expertise`,
        });
      }
    }

    // Create the counter proposal
    const timestamp = Date.now();
    const expirationDuration = Math.min(
      originalProposal.expiration - timestamp,
      3600000, // Default max 1 hour
    );

    const counterProposal: CounterProposalMessage = {
      id: uuidv4(),
      type: RecruitmentMessageType.COUNTER_PROPOSAL,
      originalProposalId: originalProposal.id,
      timestamp,
      senderAgentId: originalProposal.recipientAgentId!,
      recipientAgentId: originalProposal.senderAgentId,
      senderId: originalProposal.recipientId!,
      recipientId: originalProposal.senderId,
      conversationId: originalProposal.conversationId,
      replyToId: originalProposal.id,
      taskId: originalProposal.taskId,
      teamId: originalProposal.teamId,
      proposedRole:
        modifiedTerms.find((t) => t.field === 'proposedRole')?.proposedValue ||
        originalProposal.proposedRole,
      responsibilities:
        modifiedTerms.find((t) => t.field === 'responsibilities')
          ?.proposedValue || originalProposal.responsibilities,
      requiredCapabilities: originalProposal.requiredCapabilities,
      modifiedTerms,
      expectedDuration:
        modifiedTerms.find((t) => t.field === 'expectedDuration')
          ?.proposedValue || originalProposal.expectedDuration,
      expiration: timestamp + expirationDuration,
      expectedContribution: originalProposal.expectedContribution,
      justification:
        "Counter proposal based on agent's preferences and capabilities",
      changes: {
        role: modifiedTerms.some((t) => t.field === 'proposedRole'),
        responsibilities: modifiedTerms.some(
          (t) => t.field === 'responsibilities',
        ),
        duration: modifiedTerms.some((t) => t.field === 'expectedDuration'),
        compensation: modifiedTerms.some((t) => t.field === 'compensation'),
      },
    };

    return counterProposal;
  }

  /**
   * Resolve conflicts between a proposal and counter proposal
   */
  public resolveConflicts(
    originalProposal: RecruitmentProposalMessage,
    counterProposal: CounterProposalMessage,
    preferences: {
      prioritizeCapabilities?: boolean;
      prioritizeAvailability?: boolean;
      prioritizeTeamBalance?: boolean;
      acceptableCompromiseThreshold?: number; // 0-1, how much compromise is acceptable
    } = {},
  ): ConflictResolutionResult {
    // Default preferences
    const {
      prioritizeCapabilities = true,
      prioritizeAvailability = false,
      prioritizeTeamBalance = false,
      acceptableCompromiseThreshold = 0.7, // 70% match required for acceptance
    } = preferences;

    // Track compromise decisions and justifications
    const compromiseDetails: Record<
      string,
      {
        field: string;
        recruiterPreference: any;
        agentPreference: any;
        resolution: any;
        reason: string;
      }
    > = {};

    // Determine which resolution strategy to use
    let strategy: ResolutionStrategy;

    if (prioritizeCapabilities) {
      strategy = ResolutionStrategy.PRIORITIZE_CAPABILITY_MATCH;
    } else if (prioritizeAvailability) {
      strategy = ResolutionStrategy.PRIORITIZE_AVAILABILITY;
    } else if (prioritizeTeamBalance) {
      strategy = ResolutionStrategy.PRIORITIZE_TEAM_BALANCE;
    } else {
      strategy = ResolutionStrategy.COMPROMISE;
    }

    // Create a compromise proposal
    const timestamp = Date.now();
    let compromiseProposal: RecruitmentProposalMessage = {
      ...originalProposal,
      id: uuidv4(),
      timestamp,
    };

    // Compromise logic for different fields
    let compromiseCount = 0;
    let totalFields = counterProposal.modifiedTerms.length;

    for (const term of counterProposal.modifiedTerms) {
      let resolution: any;
      let reason: string;

      switch (term.field) {
        case 'proposedRole':
          // For role, use agent's preference if it's specific, otherwise keep original
          if (strategy === ResolutionStrategy.COMPROMISE) {
            resolution = term.proposedValue;
            reason = "Using agent's preferred role to maintain engagement";
            compromiseCount++;
          } else {
            resolution = originalProposal.proposedRole;
            reason = 'Maintaining original role based on team needs';
          }
          break;

        case 'responsibilities':
          // For responsibilities, combine both sets with priority to required ones
          const originalResp = new Set(originalProposal.responsibilities);
          const proposedResp = new Set(term.proposedValue as string[]);

          // Find responsibilities in both
          const commonResp = Array.from(originalResp).filter((r) =>
            proposedResp.has(r),
          );

          if (strategy === ResolutionStrategy.COMPROMISE) {
            // Add some from each
            const onlyOriginal = Array.from(originalResp).filter(
              (r) => !proposedResp.has(r),
            );
            const onlyProposed = Array.from(proposedResp).filter(
              (r) => !originalResp.has(r),
            );

            resolution = [
              ...commonResp,
              ...onlyOriginal.slice(0, Math.ceil(onlyOriginal.length / 2)),
              ...onlyProposed.slice(0, Math.ceil(onlyProposed.length / 2)),
            ];
            reason = 'Combining core responsibilities from both proposals';
            compromiseCount += 0.5; // Partial compromise
          } else {
            // Prioritize original with some additions
            const importantProposed = Array.from(proposedResp)
              .filter((r) => !originalResp.has(r))
              .slice(0, 2); // Add up to 2 of agent's suggestions

            resolution = [...Array.from(originalResp), ...importantProposed];
            reason =
              'Maintaining core team requirements with some additions from agent';
          }
          break;

        case 'expectedDuration':
          // For duration, take the average if compromise, otherwise keep original
          if (strategy === ResolutionStrategy.COMPROMISE) {
            resolution = Math.round(
              (Number(originalProposal.expectedDuration) +
                Number(term.proposedValue)) /
                2,
            );
            reason = 'Compromising on duration to meet both parties halfway';
            compromiseCount++;
          } else if (strategy === ResolutionStrategy.PRIORITIZE_AVAILABILITY) {
            resolution = term.proposedValue;
            reason = "Accepting agent's timeline to prioritize availability";
            compromiseCount++;
          } else {
            resolution = originalProposal.expectedDuration;
            reason =
              'Maintaining original timeline based on project requirements';
          }
          break;

        case 'compensation':
          // For compensation, use original if close enough, otherwise increase slightly
          const originalValue = originalProposal.compensation?.value || 0;
          const proposedValue =
            (term.proposedValue as { value: number })?.value || 0;

          if (originalValue >= proposedValue * 0.9) {
            // Close enough
            resolution = originalProposal.compensation;
            reason = 'Original compensation is within acceptable range';
          } else if (strategy === ResolutionStrategy.COMPROMISE) {
            // Increase partway
            resolution = {
              type: originalProposal.compensation?.type || 'credits',
              value: Math.round(
                originalValue + (proposedValue - originalValue) * 0.7,
              ),
            };
            reason = "Increasing compensation to approach agent's request";
            compromiseCount++;
          } else {
            // Small increase
            resolution = {
              type: originalProposal.compensation?.type || 'credits',
              value: Math.round(originalValue * 1.1), // 10% increase
            };
            reason =
              'Modest increase in compensation while respecting budget constraints';
            compromiseCount += 0.5; // Partial compromise
          }
          break;

        default:
          // For other fields, keep original
          resolution =
            originalProposal[term.field as keyof RecruitmentProposalMessage];
          reason = `Maintaining original ${term.field} based on team requirements`;
      }

      // Update the compromise proposal
      compromiseProposal = {
        ...compromiseProposal,
        [term.field]: resolution,
      };

      // Track compromise details
      compromiseDetails[term.field] = {
        field: term.field,
        recruiterPreference: term.originalValue,
        agentPreference: term.proposedValue,
        resolution,
        reason,
      };
    }

    // Calculate compromise ratio
    const compromiseRatio = totalFields > 0 ? compromiseCount / totalFields : 0;

    // If compromise ratio is too low, switch to find alternative strategy
    if (
      compromiseRatio < acceptableCompromiseThreshold &&
      strategy === ResolutionStrategy.COMPROMISE
    ) {
      strategy = ResolutionStrategy.FIND_ALTERNATIVE;

      // In a real implementation, this would trigger looking for alternative agents
      // For now, just log the decision
      this.logger.info(
        `Compromise ratio too low (${compromiseRatio.toFixed(2)}), switching to find alternative strategy`,
      );
    }

    // Create explanation
    const explanation =
      `Resolution using ${strategy} strategy with a compromise ratio of ${(compromiseRatio * 100).toFixed(0)}%. ` +
      Object.values(compromiseDetails)
        .map((c) => c.reason)
        .join(' ');

    return {
      strategy,
      proposal: compromiseProposal,
      explanation,
      compromiseDetails,
    };
  }
}
