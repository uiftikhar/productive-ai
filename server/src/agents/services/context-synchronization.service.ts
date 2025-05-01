import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

import {
  ContextAccessGrant,
  ContextAccessLevel,
  ContextChangeNotification,
  ContextChangeRecord,
  ContextChangeType,
  ContextConflict,
  ContextSubscriptionOptions,
  ContextSyncStatus,
  ConflictResolutionStrategy,
  SharedContextObject,
  SharedContextType,
  TeamContextSettings,
} from '../interfaces/shared-context.interface';
import { AgentRegistryService } from './agent-registry.service';

/**
 * Service for context synchronization and management
 */
export class ContextSynchronizationService {
  private readonly contextStore: Map<string, SharedContextObject> = new Map();
  private readonly changeHistory: Map<string, ContextChangeRecord[]> =
    new Map();
  private readonly subscriptions: Map<
    string,
    {
      agentId: string;
      options: ContextSubscriptionOptions;
      handler: (notification: ContextChangeNotification) => Promise<void>;
    }
  > = new Map();
  private readonly syncStatus: Map<string, Map<string, ContextSyncStatus>> =
    new Map();
  private readonly accessGrants: Map<string, ContextAccessGrant[]> = new Map();
  private readonly teamSettings: Map<string, TeamContextSettings> = new Map();
  private readonly conflicts: Map<string, ContextConflict[]> = new Map();
  private readonly eventEmitter: EventEmitter;

  constructor(agentRegistry: AgentRegistryService) {
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100); // Increase max listeners to handle many subscriptions
    this.agentRegistry = agentRegistry;
  }

  private readonly agentRegistry: AgentRegistryService;

  /**
   * Create a new shared context object
   */
  async createContext<T extends SharedContextObject>(
    context: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
    creatorId: string,
  ): Promise<T> {
    const id = uuidv4();
    const now = Date.now();

    const fullContext: T = {
      ...(context as any),
      id,
      createdAt: now,
      updatedAt: now,
      createdBy: creatorId,
      updatedBy: creatorId,
      version: 1,
    } as T;

    // Store the context
    this.contextStore.set(id, fullContext);

    // Initialize change history
    this.changeHistory.set(id, [
      {
        id: uuidv4(),
        contextId: id,
        changeType: ContextChangeType.CREATE,
        changedBy: creatorId,
        changedAt: now,
        version: {
          from: 0,
          to: 1,
        },
        changes: [
          {
            path: '',
            previousValue: null,
            newValue: fullContext,
          },
        ],
      },
    ]);

    // Initialize sync status tracking
    this.syncStatus.set(id, new Map());

    // Notify subscribers
    await this.notifySubscribers(fullContext, ContextChangeType.CREATE);

    return fullContext;
  }

  /**
   * Get context by ID
   */
  getContext<T extends SharedContextObject>(contextId: string): T | undefined {
    const context = this.contextStore.get(contextId);
    return context as T;
  }

  /**
   * Get all contexts of a specific type
   */
  getContextsByType<T extends SharedContextObject>(
    type: SharedContextType,
  ): T[] {
    const contexts: T[] = [];

    for (const context of this.contextStore.values()) {
      if (context.type === type) {
        contexts.push(context as T);
      }
    }

    return contexts;
  }

  /**
   * Update a context object
   */
  async updateContext<T extends SharedContextObject>(
    contextId: string,
    updates: Partial<T>,
    agentId: string,
    reason?: string,
  ): Promise<T> {
    const context = this.contextStore.get(contextId) as T;

    if (!context) {
      throw new Error(`Context with ID ${contextId} not found`);
    }

    // Check access permissions
    if (!this.hasAccess(contextId, agentId, ContextAccessLevel.EDIT)) {
      throw new Error(
        `Agent ${agentId} does not have edit access to context ${contextId}`,
      );
    }

    // Create a copy of the current context
    const previousContext = { ...context };

    // Apply updates
    const changes: ContextChangeRecord['changes'] = [];
    const now = Date.now();
    const newVersion = context.version + 1;

    for (const [key, value] of Object.entries(updates)) {
      if (
        key !== 'id' &&
        key !== 'createdAt' &&
        key !== 'createdBy' &&
        key !== 'version'
      ) {
        changes.push({
          path: key,
          previousValue: (context as any)[key],
          newValue: value,
        });

        (context as any)[key] = value;
      }
    }

    // Update metadata
    context.updatedAt = now;
    context.updatedBy = agentId;
    context.version = newVersion;

    // Check for conflicts
    const conflictDetected = await this.detectConflicts(contextId, changes);
    if (conflictDetected) {
      // Apply conflict resolution if needed
      await this.resolveConflicts(contextId);
    }

    // Record the change
    const changeRecord: ContextChangeRecord = {
      id: uuidv4(),
      contextId,
      changeType: ContextChangeType.UPDATE,
      changedBy: agentId,
      changedAt: now,
      version: {
        from: previousContext.version,
        to: newVersion,
      },
      changes,
      reason,
    };

    if (!this.changeHistory.has(contextId)) {
      this.changeHistory.set(contextId, []);
    }

    this.changeHistory.get(contextId)?.push(changeRecord);

    // Update the context store
    this.contextStore.set(contextId, context);

    // Notify subscribers
    await this.notifySubscribers(
      context,
      ContextChangeType.UPDATE,
      changeRecord,
    );

    return context as T;
  }

  /**
   * Delete a context object
   */
  async deleteContext(
    contextId: string,
    agentId: string,
    reason?: string,
  ): Promise<boolean> {
    const context = this.contextStore.get(contextId);

    if (!context) {
      return false;
    }

    // Check access permissions
    if (!this.hasAccess(contextId, agentId, ContextAccessLevel.ADMIN)) {
      throw new Error(
        `Agent ${agentId} does not have admin access to delete context ${contextId}`,
      );
    }

    const now = Date.now();

    // Record the change
    const changeRecord: ContextChangeRecord = {
      id: uuidv4(),
      contextId,
      changeType: ContextChangeType.DELETE,
      changedBy: agentId,
      changedAt: now,
      version: {
        from: context.version,
        to: context.version + 1,
      },
      changes: [
        {
          path: '',
          previousValue: context,
          newValue: null,
        },
      ],
      reason,
    };

    if (!this.changeHistory.has(contextId)) {
      this.changeHistory.set(contextId, []);
    }

    this.changeHistory.get(contextId)?.push(changeRecord);

    // Notify subscribers before deletion
    await this.notifySubscribers(
      context,
      ContextChangeType.DELETE,
      changeRecord,
    );

    // Remove from the context store
    this.contextStore.delete(contextId);

    return true;
  }

  /**
   * Subscribe to context changes
   */
  subscribeToContextChanges(
    agentId: string,
    options: ContextSubscriptionOptions,
    handler: (notification: ContextChangeNotification) => Promise<void>,
  ): string {
    const subscriptionId = uuidv4();

    this.subscriptions.set(subscriptionId, {
      agentId,
      options,
      handler,
    });

    return subscriptionId;
  }

  /**
   * Unsubscribe from context changes
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Grant access to a context
   */
  grantAccess(
    contextId: string,
    grantedTo: string,
    grantedBy: string,
    accessLevel: ContextAccessLevel,
    expiresAt?: number,
  ): ContextAccessGrant {
    const context = this.contextStore.get(contextId);

    if (!context) {
      throw new Error(`Context with ID ${contextId} not found`);
    }

    // Check if granter has admin access
    if (!this.hasAccess(contextId, grantedBy, ContextAccessLevel.ADMIN)) {
      throw new Error(
        `Agent ${grantedBy} does not have admin access to grant permissions for context ${contextId}`,
      );
    }

    const now = Date.now();

    const grant: ContextAccessGrant = {
      id: uuidv4(),
      contextId,
      grantedTo,
      grantedBy,
      accessLevel,
      grantedAt: now,
      expiresAt,
      revoked: false,
    };

    if (!this.accessGrants.has(contextId)) {
      this.accessGrants.set(contextId, []);
    }

    this.accessGrants.get(contextId)?.push(grant);

    // Update the context's access control if needed
    if (!context.accessControl.agentAccess) {
      context.accessControl.agentAccess = {};
    }

    context.accessControl.agentAccess[grantedTo] = accessLevel;

    return grant;
  }

  /**
   * Revoke access to a context
   */
  revokeAccess(grantId: string, revokedBy: string): boolean {
    // Find the grant
    for (const [contextId, grants] of this.accessGrants.entries()) {
      const grantIndex = grants.findIndex((g) => g.id === grantId);

      if (grantIndex >= 0) {
        const grant = grants[grantIndex];

        // Check if revoker has admin access
        if (!this.hasAccess(contextId, revokedBy, ContextAccessLevel.ADMIN)) {
          throw new Error(
            `Agent ${revokedBy} does not have admin access to revoke permissions for context ${contextId}`,
          );
        }

        // Update the grant
        grant.revoked = true;
        grant.revokedAt = Date.now();
        grant.revokedBy = revokedBy;

        // Update the array
        grants[grantIndex] = grant;
        this.accessGrants.set(contextId, grants);

        // Update the context's access control
        const context = this.contextStore.get(contextId);
        if (context?.accessControl.agentAccess?.[grant.grantedTo]) {
          delete context.accessControl.agentAccess[grant.grantedTo];
        }

        return true;
      }
    }

    return false;
  }

  /**
   * Check if an agent has access to a context
   */
  hasAccess(
    contextId: string,
    agentId: string,
    requiredLevel: ContextAccessLevel,
  ): boolean {
    const context = this.contextStore.get(contextId);

    if (!context) {
      return false;
    }

    // Creator/updater always has admin access
    if (context.createdBy === agentId || context.updatedBy === agentId) {
      return true;
    }

    // Check explicit agent access
    const agentAccess = context.accessControl.agentAccess?.[agentId];
    if (agentAccess) {
      return this.isAccessLevelSufficient(agentAccess, requiredLevel);
    }

    // Check team access (would require additional team membership check)
    // This is a placeholder - real implementation would check team membership
    for (const [teamId, level] of Object.entries(
      context.accessControl.teamAccess || {},
    )) {
      if (
        this.isAgentInTeam(agentId, teamId) &&
        this.isAccessLevelSufficient(level, requiredLevel)
      ) {
        return true;
      }
    }

    // Fall back to default access
    return this.isAccessLevelSufficient(
      context.accessControl.defaultAccess,
      requiredLevel,
    );
  }

  /**
   * Get change history for a context
   */
  getChangeHistory(contextId: string): ContextChangeRecord[] {
    return this.changeHistory.get(contextId) || [];
  }

  /**
   * Get a specific version of a context
   */
  getContextVersion<T extends SharedContextObject>(
    contextId: string,
    version: number,
  ): T | undefined {
    if (version < 1) {
      return undefined;
    }

    const history = this.changeHistory.get(contextId) || [];
    const currentContext = this.contextStore.get(contextId);

    if (!history.length) {
      return undefined;
    }

    // If requesting the current version, return current context
    if (currentContext && currentContext.version === version) {
      return currentContext as T;
    }

    // If requesting version 1, return the initial creation result
    if (version === 1) {
      const createRecord = history.find(
        (rec) => rec.changeType === ContextChangeType.CREATE,
      );
      return createRecord?.changes[0].newValue as T;
    }

    // Otherwise, reconstruct the version by replaying changes
    let contextVersion: T | undefined;

    // Start with the initial version
    const createRecord = history.find(
      (rec) => rec.changeType === ContextChangeType.CREATE,
    );
    if (!createRecord) {
      return undefined;
    }

    contextVersion = { ...createRecord.changes[0].newValue } as T;

    // Apply all changes up to the requested version
    for (const record of history) {
      if (record.changeType === ContextChangeType.CREATE) {
        continue; // Already applied
      }

      if (record.version.to <= version) {
        // Apply this change
        if (record.changeType === ContextChangeType.UPDATE) {
          for (const change of record.changes) {
            // Apply the individual change
            if (change.path) {
              (contextVersion as any)[change.path] = change.newValue;
            }
          }
        } else if (record.changeType === ContextChangeType.DELETE) {
          // If this version was deleted, return undefined
          return undefined;
        }
      } else {
        // Stop once we've reached the target version
        break;
      }
    }

    return contextVersion;
  }

  /**
   * Set team context settings
   */
  setTeamContextSettings(settings: TeamContextSettings): void {
    this.teamSettings.set(settings.teamId, settings);
  }

  /**
   * Get team context settings
   */
  getTeamContextSettings(teamId: string): TeamContextSettings | undefined {
    return this.teamSettings.get(teamId);
  }

  /**
   * Get sync status for a context and agent
   */
  getSyncStatus(
    contextId: string,
    agentId: string,
  ): ContextSyncStatus | undefined {
    return this.syncStatus.get(contextId)?.get(agentId);
  }

  /**
   * Update sync status for an agent
   */
  updateSyncStatus(
    contextId: string,
    agentId: string,
    version: number,
  ): ContextSyncStatus {
    if (!this.syncStatus.has(contextId)) {
      this.syncStatus.set(contextId, new Map());
    }

    const now = Date.now();
    const agentSyncMap = this.syncStatus.get(contextId)!;
    const currentStatus = agentSyncMap.get(agentId);

    const newStatus: ContextSyncStatus = {
      contextId,
      agentId,
      lastSyncedVersion: version,
      lastSyncedAt: now,
      pendingChanges: false,
      syncAttempts: (currentStatus?.syncAttempts || 0) + 1,
    };

    agentSyncMap.set(agentId, newStatus);

    return newStatus;
  }

  /**
   * Get active conflicts for a context
   */
  getActiveConflicts(contextId: string): ContextConflict[] {
    const allConflicts = this.conflicts.get(contextId) || [];
    return allConflicts.filter(
      (c) => c.status === 'detected' || c.status === 'resolving',
    );
  }

  // Private helper methods

  private isAccessLevelSufficient(
    granted: ContextAccessLevel,
    required: ContextAccessLevel,
  ): boolean {
    const levels = [
      ContextAccessLevel.READ_ONLY,
      ContextAccessLevel.COMMENT,
      ContextAccessLevel.SUGGEST,
      ContextAccessLevel.EDIT,
      ContextAccessLevel.ADMIN,
    ];

    const grantedIndex = levels.indexOf(granted);
    const requiredIndex = levels.indexOf(required);

    return grantedIndex >= requiredIndex;
  }

  private isAgentInTeam(agentId: string, teamId: string): boolean {
    // This is a placeholder - in a real implementation, you would check team membership
    // Probably by calling a team service
    return false;
  }

  private async notifySubscribers(
    context: SharedContextObject,
    changeType: ContextChangeType,
    changeRecord?: ContextChangeRecord,
  ): Promise<void> {
    const notifications: Array<{
      subscription: string;
      notification: ContextChangeNotification;
    }> = [];

    // Find matching subscriptions
    for (const [subscriptionId, subscription] of this.subscriptions.entries()) {
      const { agentId, options, handler } = subscription;

      // Skip if agent doesn't have access to read the context
      if (!this.hasAccess(context.id, agentId, ContextAccessLevel.READ_ONLY)) {
        continue;
      }

      // Check if subscription matches
      let matches = true;

      // Check context type
      if (options.contextType) {
        if (Array.isArray(options.contextType)) {
          if (!options.contextType.includes(context.type)) {
            matches = false;
          }
        } else if (options.contextType !== context.type) {
          matches = false;
        }
      }

      // Check change type
      if (options.changeTypes && options.changeTypes.length > 0) {
        if (!options.changeTypes.includes(changeType)) {
          matches = false;
        }
      }

      // Check notification flags
      if (
        (changeType === ContextChangeType.CREATE &&
          options.notifyOnCreate === false) ||
        (changeType === ContextChangeType.UPDATE &&
          options.notifyOnUpdate === false) ||
        (changeType === ContextChangeType.DELETE &&
          options.notifyOnDelete === false)
      ) {
        matches = false;
      }

      if (matches) {
        // Create notification
        const notification: ContextChangeNotification = {
          subscriptionId,
          agentId,
          change: changeRecord || {
            id: uuidv4(),
            contextId: context.id,
            changeType,
            changedBy: context.updatedBy,
            changedAt: context.updatedAt,
            version: {
              from: context.version - 1,
              to: context.version,
            },
            changes: [],
          },
          timestamp: Date.now(),
          context: {
            after:
              changeType !== ContextChangeType.DELETE ? context : undefined,
            before:
              changeType !== ContextChangeType.CREATE
                ? this.getContextVersion(context.id, context.version - 1)
                : undefined,
          },
        };

        notifications.push({ subscription: subscriptionId, notification });
      }
    }

    // Send notifications
    for (const { subscription, notification } of notifications) {
      try {
        const { handler } = this.subscriptions.get(subscription)!;
        await handler(notification);
      } catch (error) {
        console.error(`Error notifying subscriber ${subscription}:`, error);
      }
    }

    // Also emit events for general listening
    this.eventEmitter.emit(`context.${context.id}.changed`, {
      contextId: context.id,
      changeType,
      context,
    });

    this.eventEmitter.emit(`context.type.${context.type}.changed`, {
      contextId: context.id,
      changeType,
      context,
    });
  }

  private async detectConflicts(
    contextId: string,
    changes: ContextChangeRecord['changes'],
  ): Promise<boolean> {
    const context = this.contextStore.get(contextId);

    if (!context) {
      return false;
    }

    const teamId = context.accessControl.teamAccess
      ? Object.keys(context.accessControl.teamAccess)[0]
      : undefined;
    const teamSettings = teamId ? this.teamSettings.get(teamId) : undefined;

    // Skip conflict detection if not configured
    if (!teamSettings) {
      return false;
    }

    // Get recent changes
    const history = this.changeHistory.get(contextId) || [];
    const recentChanges = history
      .filter((c) => c.changedAt > Date.now() - 60000) // Last minute
      .filter((c) => c.changeType === ContextChangeType.UPDATE);

    if (recentChanges.length === 0) {
      return false;
    }

    // Check for conflicts on the same fields
    const conflictingChanges: ContextChangeRecord[] = [];

    for (const record of recentChanges) {
      // Check if any changes overlap
      const conflictingFields = record.changes.filter((c1) =>
        changes.some((c2) => c1.path === c2.path),
      );

      if (conflictingFields.length > 0) {
        conflictingChanges.push(record);
      }
    }

    if (conflictingChanges.length === 0) {
      return false;
    }

    // Create conflict record
    const conflict: ContextConflict = {
      id: uuidv4(),
      contextId,
      conflictingChanges,
      detectedAt: Date.now(),
      status: 'detected',
      severity: 'medium',
      affectedAgents: Array.from(
        new Set(conflictingChanges.map((c) => c.changedBy)),
      ),
    };

    if (!this.conflicts.has(contextId)) {
      this.conflicts.set(contextId, []);
    }

    this.conflicts.get(contextId)!.push(conflict);

    return true;
  }

  private async resolveConflicts(contextId: string): Promise<void> {
    const activeConflicts = this.getActiveConflicts(contextId);

    if (activeConflicts.length === 0) {
      return;
    }

    const context = this.contextStore.get(contextId);

    if (!context) {
      return;
    }

    // Get team settings for resolution strategy
    const teamId = context.accessControl.teamAccess
      ? Object.keys(context.accessControl.teamAccess)[0]
      : undefined;
    const teamSettings = teamId ? this.teamSettings.get(teamId) : undefined;

    if (!teamSettings) {
      // Without team settings, just mark as resolved without action
      for (const conflict of activeConflicts) {
        conflict.status = 'resolved';
        conflict.resolution = {
          strategy: 'manual',
          resolvedBy: 'system',
          resolvedAt: Date.now(),
        };
      }
      return;
    }

    // Get strategy to use
    let strategy =
      teamSettings.conflictResolution.strategyByContextType?.[context.type] ||
      teamSettings.conflictResolution.defaultStrategy;

    // Apply resolution
    for (const conflict of activeConflicts) {
      // Check if we should escalate based on threshold
      if (
        teamSettings.conflictResolution.escalationThreshold &&
        conflict.conflictingChanges.length >=
          teamSettings.conflictResolution.escalationThreshold
      ) {
        strategy = ConflictResolutionStrategy.ESCALATE_TO_HUMAN;
      }

      conflict.status = 'resolving';

      switch (strategy) {
        case ConflictResolutionStrategy.LAST_WRITE_WINS:
          // Already handled by default last-write behavior
          conflict.status = 'resolved';
          conflict.resolution = {
            strategy: 'rule_based',
            resolvedBy: 'system',
            resolvedAt: Date.now(),
          };
          break;

        case ConflictResolutionStrategy.PRIORITY_AGENT:
          // Get priorities, would need to be implemented
          conflict.status = 'resolved';
          conflict.resolution = {
            strategy: 'priority_based',
            resolvedBy: 'system',
            resolvedAt: Date.now(),
          };
          break;

        case ConflictResolutionStrategy.ESCALATE_TO_HUMAN:
          // Mark for escalation
          conflict.status = 'escalated';
          break;

        default:
          // Other strategies would be implemented
          conflict.status = 'resolved';
          conflict.resolution = {
            strategy: 'rule_based',
            resolvedBy: 'system',
            resolvedAt: Date.now(),
          };
      }
    }
  }
}
