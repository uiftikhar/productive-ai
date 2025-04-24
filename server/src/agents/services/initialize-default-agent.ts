import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { DefaultAgentService } from './default-agent.service';
import { AgentRegistryService } from './agent-registry.service';
import { BaseAgentInterface } from '../interfaces/base-agent.interface';

/**
 * Options for initializing the default agent system
 */
export interface DefaultAgentInitOptions {
  /**
   * Logger to use for the initialization process
   */
  logger?: Logger;

  /**
   * Default agent ID to configure
   * If not provided, will try to use a generalist agent from the registry
   */
  defaultAgentId?: string;

  /**
   * Confidence threshold for triggering fallback
   * @default 0.6
   */
  confidenceThreshold?: number;

  /**
   * AgentRegistryService instance to use
   * If not provided, will use the singleton instance
   */
  agentRegistry?: AgentRegistryService;
}

/**
 * Initialize the default agent fallback system
 *
 * This function configures the DefaultAgentService with appropriate
 * settings based on the available agents in the registry.
 *
 * @returns The configured DefaultAgentService instance
 */
export async function initializeDefaultAgentSystem(
  options: DefaultAgentInitOptions = {},
): Promise<DefaultAgentService> {
  const logger = options.logger || new ConsoleLogger();
  const agentRegistry =
    options.agentRegistry || AgentRegistryService.getInstance();

  logger.info('Initializing Default Agent Fallback System');

  // Get the default agent service
  const defaultAgentService = DefaultAgentService.getInstance({
    logger,
    confidenceThreshold: options.confidenceThreshold || 0.6,
    agentRegistry,
  });

  // If a specific ID is provided, use it
  if (options.defaultAgentId) {
    try {
      defaultAgentService.setDefaultAgent(options.defaultAgentId);
      logger.info(
        `Default agent set to specified ID: ${options.defaultAgentId}`,
      );
      return defaultAgentService;
    } catch (error) {
      logger.warn(
        `Failed to set specified default agent: ${options.defaultAgentId}`,
        { error },
      );
      // Continue to automatic selection
    }
  }

  // Otherwise, try to find a suitable agent automatically
  logger.info('Attempting to select default agent automatically');

  // Get all registered agents
  const agents = agentRegistry.listAgents();

  if (agents.length === 0) {
    logger.warn(
      'No agents registered, default agent fallback will not be available',
    );
    return defaultAgentService;
  }

  // Look for agents with general capabilities
  // We'll prefer agents with these capabilities for default fallback handling
  const generalCapabilityTerms = [
    'general',
    'assistant',
    'default',
    'fallback',
    'help',
    'generalist',
    'multipurpose',
    'multi-purpose',
  ];

  // Score each agent based on how suitable they are as a default
  const scoredAgents: Array<{ agent: BaseAgentInterface; score: number }> = [];

  for (const agent of agents) {
    let score = 0;

    // Check agent name and description for general terms
    const nameAndDesc = (agent.name + ' ' + agent.description).toLowerCase();
    generalCapabilityTerms.forEach((term) => {
      if (nameAndDesc.includes(term.toLowerCase())) {
        score += 5;
      }
    });

    // Check agent capabilities
    const capabilities = agent.getCapabilities();

    // More capabilities is generally better for a default agent
    score += Math.min(capabilities.length, 5);

    // Look for general capabilities
    for (const capability of capabilities) {
      const capName = capability.name.toLowerCase();
      generalCapabilityTerms.forEach((term) => {
        if (capName.includes(term.toLowerCase())) {
          score += 3;
        }
      });
    }

    // Add to scored list
    scoredAgents.push({ agent, score });
  }

  // Sort by score (highest first)
  scoredAgents.sort((a, b) => b.score - a.score);

  // Select the highest scored agent, or the first one if all scores are 0
  const selectedAgent = scoredAgents[0]?.agent;

  if (selectedAgent) {
    try {
      defaultAgentService.setDefaultAgent(selectedAgent.id);
      logger.info(
        `Default agent automatically set to: ${selectedAgent.name} (${selectedAgent.id})`,
        {
          score: scoredAgents[0].score,
        },
      );
    } catch (error) {
      logger.error('Failed to set automatically selected default agent', {
        error,
      });
    }
  } else {
    logger.warn('Could not find a suitable default agent');
  }

  return defaultAgentService;
}
