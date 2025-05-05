/**
 * Team Options and Team Member interfaces
 *
 * Interfaces for configuring agent teams and team members
 * @deprecated Will be replaced by graph-based agent collaboration in fully agentic implementation
 */

import { BaseAgentInterface } from './base-agent.interface';

/**
 * Represents a member of an agent team
 */
export interface TeamMember {
  /**
   * The agent itself
   */
  agent: BaseAgentInterface;

  /**
   * The role this agent plays in the team
   */
  role: string;

  /**
   * Priority level for task assignment (higher means more likely to be assigned)
   * Scale: 1-10 where 10 is highest priority
   */
  priority: number;

  /**
   * Whether this member is currently active in the team
   */
  active: boolean;

  /**
   * Optional capabilities this member is restricted to
   */
  allowedCapabilities?: string[];

  /**
   * Optional metadata for this member
   */
  metadata?: Record<string, any>;
}

/**
 * Options for configuring an agent team
 */
export interface TeamOptions {
  /**
   * Optional team ID
   */
  id?: string;

  /**
   * Team name
   */
  name?: string;

  /**
   * Team description
   */
  description?: string;

  /**
   * Initial team members
   */
  initialMembers?: TeamMember[];

  /**
   * Whether the team should operate in parallel when possible
   */
  allowParallel?: boolean;

  /**
   * Maximum number of agents that can work in parallel
   */
  maxParallelAgents?: number;

  /**
   * Additional options
   */
  [key: string]: any;
}
