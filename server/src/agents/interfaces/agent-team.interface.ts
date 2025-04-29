/**
 * Agent Team interface
 *
 * Represents a team of agents that can collaborate to solve complex tasks
 * @deprecated Will be replaced by graph-based agent collaboration in fully agentic implementation
 */

import { BaseAgentInterface } from './base-agent.interface';
import { TeamMember } from './team-options.interface';

export class AgentTeam {
  /**
   * The unique identifier of this team
   */
  readonly id: string;

  /**
   * The name of this team
   */
  readonly name: string;

  /**
   * Description of the team's purpose
   */
  readonly description: string;

  /**
   * List of team members
   */
  private members: TeamMember[];

  constructor(options: {
    id?: string;
    name?: string;
    description?: string;
    agents: BaseAgentInterface[];
    [key: string]: any;
  }) {
    this.id = options.id || `team-${Date.now()}`;
    this.name = options.name || 'Agent Team';
    this.description = options.description || 'A team of collaborative agents';

    // Convert agents to team members with default roles
    this.members = options.agents.map((agent) => ({
      agent,
      role: agent.name,
      priority: 5,
      active: true,
    }));
  }

  /**
   * Get the list of members in this team
   */
  getMembers(): TeamMember[] {
    return [...this.members];
  }

  /**
   * Add a member to the team
   */
  addMember(member: TeamMember): AgentTeam {
    this.members.push(member);
    return this;
  }

  /**
   * Remove a member from the team
   */
  removeMember(agentId: string): AgentTeam {
    this.members = this.members.filter((m) => m.agent.id !== agentId);
    return this;
  }

  /**
   * Find members by role
   */
  findMembersByRole(role: string): TeamMember[] {
    return this.members.filter((m) => m.role === role);
  }

  /**
   * Get active members (available for tasks)
   */
  getActiveMembers(): TeamMember[] {
    return this.members.filter((m) => m.active);
  }
}
