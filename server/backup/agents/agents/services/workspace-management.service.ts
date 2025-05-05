import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';

import {
  ArtifactType,
  WorkspaceAccessLevel,
  WorkspaceConfiguration,
  WorkspaceArtifact,
  ArtifactAnnotation,
  WorkspaceActivity,
  CollaborationSession,
  WorkspaceLock,
  WorkspaceAccessGrant,
  WorkspaceConflict,
  WorkspaceSearchQuery,
  createWorkspaceConfiguration,
  createWorkspaceArtifact,
} from '../interfaces/team-workspace.interface';

/**
 * Service for managing team workspaces
 */
export class WorkspaceManagementService {
  private workspaces: Map<string, WorkspaceConfiguration> = new Map();
  private artifacts: Map<string, WorkspaceArtifact> = new Map();
  private annotations: Map<string, ArtifactAnnotation[]> = new Map();
  private activities: Map<string, WorkspaceActivity[]> = new Map();
  private sessions: Map<string, CollaborationSession> = new Map();
  private locks: Map<string, WorkspaceLock[]> = new Map();
  private accessGrants: Map<string, WorkspaceAccessGrant[]> = new Map();
  private conflicts: Map<string, WorkspaceConflict[]> = new Map();
  private readonly eventEmitter: EventEmitter;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);
  }

  /**
   * Create a new workspace
   */
  createWorkspace(
    name: string,
    teamId: string,
    taskId: string,
    createdBy: string,
    description?: string,
    settings?: Partial<WorkspaceConfiguration['settings']>,
  ): WorkspaceConfiguration {
    const workspace = createWorkspaceConfiguration(
      name,
      teamId,
      taskId,
      createdBy,
      settings,
    );

    if (description) {
      workspace.description = description;
    }

    this.workspaces.set(workspace.id, workspace);
    this.activities.set(workspace.id, []);

    // Record activity
    this.recordActivity({
      id: uuidv4(),
      workspaceId: workspace.id,
      timestamp: Date.now(),
      agentId: createdBy,
      activityType: 'create',
      resourceType: 'workspace',
      resourceId: workspace.id,
      details: { name, teamId, taskId },
    });

    this.logger.info('Workspace created', { workspaceId: workspace.id, name });

    // Emit event
    this.eventEmitter.emit('workspace.created', workspace);

    return workspace;
  }

  /**
   * Get a workspace by ID
   */
  getWorkspace(workspaceId: string): WorkspaceConfiguration | undefined {
    return this.workspaces.get(workspaceId);
  }

  /**
   * Update a workspace configuration
   */
  updateWorkspace(
    workspaceId: string,
    updates: Partial<
      Omit<WorkspaceConfiguration, 'id' | 'createdAt' | 'createdBy'>
    >,
    updatedBy: string,
  ): WorkspaceConfiguration | undefined {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      return undefined;
    }

    // Check access
    if (
      !this.hasAccess(
        workspaceId,
        updatedBy,
        WorkspaceAccessLevel.ADMIN,
        'workspace',
      )
    ) {
      throw new Error(
        `Agent ${updatedBy} does not have admin access to workspace ${workspaceId}`,
      );
    }

    const updatedWorkspace = {
      ...workspace,
      ...updates,
      updatedAt: Date.now(),
    };

    // Update the workspace
    this.workspaces.set(workspaceId, updatedWorkspace);

    // Record activity
    this.recordActivity({
      id: uuidv4(),
      workspaceId,
      timestamp: Date.now(),
      agentId: updatedBy,
      activityType: 'update',
      resourceType: 'workspace',
      resourceId: workspaceId,
      details: updates,
    });

    this.logger.info('Workspace updated', { workspaceId });

    // Emit event
    this.eventEmitter.emit('workspace.updated', updatedWorkspace);

    return updatedWorkspace;
  }

  /**
   * Create an artifact in a workspace
   */
  createArtifact(
    workspaceId: string,
    name: string,
    type: ArtifactType,
    content: any,
    format: string,
    createdBy: string,
    options?: Partial<
      Omit<
        WorkspaceArtifact,
        | 'id'
        | 'name'
        | 'type'
        | 'content'
        | 'format'
        | 'createdAt'
        | 'updatedAt'
        | 'createdBy'
        | 'updatedBy'
        | 'version'
      >
    >,
  ): WorkspaceArtifact {
    // Check workspace exists
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Check access
    if (
      !this.hasAccess(
        workspaceId,
        createdBy,
        WorkspaceAccessLevel.CREATE,
        'workspace',
      )
    ) {
      throw new Error(
        `Agent ${createdBy} does not have create access to workspace ${workspaceId}`,
      );
    }

    // Create artifact
    const artifact = createWorkspaceArtifact(
      name,
      type,
      content,
      format,
      createdBy,
      options,
    );

    // Store the artifact
    this.artifacts.set(artifact.id, artifact);

    // Initialize annotations for this artifact
    this.annotations.set(artifact.id, []);

    // Record activity
    this.recordActivity({
      id: uuidv4(),
      workspaceId,
      timestamp: Date.now(),
      agentId: createdBy,
      activityType: 'create',
      resourceType: 'artifact',
      resourceId: artifact.id,
      details: { name, type, format },
    });

    this.logger.info('Artifact created', {
      workspaceId,
      artifactId: artifact.id,
      name,
    });

    // Emit event
    this.eventEmitter.emit('artifact.created', {
      workspace,
      artifact,
    });

    return artifact;
  }

  /**
   * Get an artifact by ID
   */
  getArtifact(artifactId: string): WorkspaceArtifact | undefined {
    return this.artifacts.get(artifactId);
  }

  /**
   * Get all artifacts in a workspace
   */
  getWorkspaceArtifacts(workspaceId: string): WorkspaceArtifact[] {
    const artifacts: WorkspaceArtifact[] = [];

    for (const artifact of this.artifacts.values()) {
      // We'll need to add a reference to workspaceId in artifacts or track this separately
      // This is a simplified implementation
      if (artifact.metadata?.workspaceId === workspaceId) {
        artifacts.push(artifact);
      }
    }

    return artifacts;
  }

  /**
   * Update an artifact
   */
  updateArtifact(
    artifactId: string,
    updates: Partial<Omit<WorkspaceArtifact, 'id' | 'createdAt' | 'createdBy'>>,
    updatedBy: string,
  ): WorkspaceArtifact | undefined {
    const artifact = this.artifacts.get(artifactId);

    if (!artifact) {
      return undefined;
    }

    // Check access
    if (
      !this.hasAccess(
        artifactId,
        updatedBy,
        WorkspaceAccessLevel.WRITE,
        'artifact',
      )
    ) {
      throw new Error(
        `Agent ${updatedBy} does not have write access to artifact ${artifactId}`,
      );
    }

    // Get current version info for history
    const currentVersion = artifact.version;

    // Create version history if it doesn't exist
    if (!artifact.versionHistory) {
      artifact.versionHistory = [];
    }

    // Add current version to history
    artifact.versionHistory.push({
      version: currentVersion,
      timestamp: artifact.updatedAt,
      updatedBy: artifact.updatedBy,
    });

    // Update the artifact
    const updatedArtifact = {
      ...artifact,
      ...updates,
      updatedAt: Date.now(),
      updatedBy,
      version: currentVersion + 1,
    };

    // Store the updated artifact
    this.artifacts.set(artifactId, updatedArtifact);

    // Record activity
    this.recordActivity({
      id: uuidv4(),
      workspaceId: updatedArtifact.metadata?.workspaceId as string,
      timestamp: Date.now(),
      agentId: updatedBy,
      activityType: 'update',
      resourceType: 'artifact',
      resourceId: artifactId,
      details: { updates, previousVersion: currentVersion },
    });

    this.logger.info('Artifact updated', {
      artifactId,
      version: updatedArtifact.version,
    });

    // Emit event
    this.eventEmitter.emit('artifact.updated', {
      artifact: updatedArtifact,
      previousVersion: currentVersion,
    });

    return updatedArtifact;
  }

  /**
   * Add an annotation to an artifact
   */
  addAnnotation(
    artifactId: string,
    annotationType: ArtifactAnnotation['annotationType'],
    content: any,
    createdBy: string,
    position?: ArtifactAnnotation['position'],
  ): ArtifactAnnotation {
    const artifact = this.artifacts.get(artifactId);

    if (!artifact) {
      throw new Error(`Artifact ${artifactId} not found`);
    }

    // Check access
    if (
      !this.hasAccess(
        artifactId,
        createdBy,
        WorkspaceAccessLevel.COMMENT,
        'artifact',
      )
    ) {
      throw new Error(
        `Agent ${createdBy} does not have comment access to artifact ${artifactId}`,
      );
    }

    // Create annotation
    const annotation: ArtifactAnnotation = {
      id: uuidv4(),
      artifactId,
      annotationType,
      content,
      createdAt: Date.now(),
      createdBy,
      position,
      status: 'active',
    };

    // Get annotations for this artifact
    const artifactAnnotations = this.annotations.get(artifactId) || [];

    // Add the new annotation
    artifactAnnotations.push(annotation);

    // Store updated annotations
    this.annotations.set(artifactId, artifactAnnotations);

    // Record activity
    this.recordActivity({
      id: uuidv4(),
      workspaceId: artifact.metadata?.workspaceId as string,
      timestamp: annotation.createdAt,
      agentId: createdBy,
      activityType: 'comment',
      resourceType: 'annotation',
      resourceId: annotation.id,
      details: { annotationType, artifactId },
    });

    this.logger.info('Annotation added', {
      artifactId,
      annotationId: annotation.id,
      type: annotationType,
    });

    // Emit event
    this.eventEmitter.emit('annotation.created', {
      artifact,
      annotation,
    });

    return annotation;
  }

  /**
   * Get all annotations for an artifact
   */
  getArtifactAnnotations(artifactId: string): ArtifactAnnotation[] {
    return this.annotations.get(artifactId) || [];
  }

  /**
   * Acquire a lock on a resource
   */
  acquireLock(
    resourceId: string,
    resourceType: 'artifact' | 'annotation' | 'workspace',
    agentId: string,
    operationType: 'read' | 'write' | 'exclusive',
    durationMs = 30000, // Default 30 seconds
  ): WorkspaceLock {
    // Check if resource exists
    if (
      (resourceType === 'artifact' && !this.artifacts.get(resourceId)) ||
      (resourceType === 'workspace' && !this.workspaces.get(resourceId))
    ) {
      throw new Error(`Resource ${resourceId} not found`);
    }

    // Get existing locks for this resource
    const resourceLocks = this.locks.get(resourceId) || [];

    // Check for conflicting locks
    const conflictingLock = resourceLocks.find((lock) => {
      if (lock.status !== 'active') return false;

      // Read locks don't conflict with other read locks
      if (operationType === 'read' && lock.operationType === 'read')
        return false;

      // All other combinations conflict
      return true;
    });

    if (conflictingLock) {
      throw new Error(
        `Resource ${resourceId} is locked by agent ${conflictingLock.heldBy}`,
      );
    }

    // Create new lock
    const now = Date.now();
    const lock: WorkspaceLock = {
      id: uuidv4(),
      resourceId,
      resourceType,
      heldBy: agentId,
      acquiredAt: now,
      expiresAt: now + durationMs,
      operationType,
      status: 'active',
      releaseToken: uuidv4(), // Token for secure release
    };

    // Add to locks
    resourceLocks.push(lock);
    this.locks.set(resourceId, resourceLocks);

    this.logger.debug('Lock acquired', {
      resourceId,
      agentId,
      lockId: lock.id,
    });

    // Setup auto-expiry
    setTimeout(() => {
      this.expireLock(lock.id);
    }, durationMs);

    return lock;
  }

  /**
   * Release a lock
   */
  releaseLock(lockId: string, releaseToken: string, agentId: string): boolean {
    // Find the lock
    for (const [resourceId, locks] of this.locks.entries()) {
      const lockIndex = locks.findIndex((l) => l.id === lockId);

      if (lockIndex >= 0) {
        const lock = locks[lockIndex];

        // Verify token and ownership
        if (lock.releaseToken !== releaseToken || lock.heldBy !== agentId) {
          throw new Error(
            'Invalid lock token or agent does not hold this lock',
          );
        }

        // Update lock status
        lock.status = 'released';
        locks[lockIndex] = lock;
        this.locks.set(resourceId, locks);

        this.logger.debug('Lock released', { lockId });

        return true;
      }
    }

    return false;
  }

  /**
   * Check if an agent has the required access level
   */
  hasAccess(
    resourceId: string,
    agentId: string,
    requiredLevel: WorkspaceAccessLevel,
    resourceType: 'workspace' | 'artifact',
  ): boolean {
    // Implement access checking logic here
    // This is a placeholder implementation

    if (resourceType === 'workspace') {
      const workspace = this.workspaces.get(resourceId);

      if (!workspace) {
        return false;
      }

      // Creator always has admin access
      if (workspace.createdBy === agentId) {
        return true;
      }

      // Check default access
      return this.isAccessLevelSufficient(
        workspace.settings.defaultAccessLevel,
        requiredLevel,
      );
    } else if (resourceType === 'artifact') {
      const artifact = this.artifacts.get(resourceId);

      if (!artifact) {
        return false;
      }

      // Creator always has admin access
      if (artifact.createdBy === agentId) {
        return true;
      }

      // Check specific agent access
      if (
        artifact.accessControl.agentAccess &&
        artifact.accessControl.agentAccess[agentId]
      ) {
        return this.isAccessLevelSufficient(
          artifact.accessControl.agentAccess[agentId],
          requiredLevel,
        );
      }

      // Check default access
      return this.isAccessLevelSufficient(
        artifact.accessControl.defaultAccess,
        requiredLevel,
      );
    }

    return false;
  }

  /**
   * Grant access to a resource
   */
  grantAccess(
    resourceId: string,
    resourceType: 'workspace' | 'artifact',
    grantedTo: string,
    grantedBy: string,
    accessLevel: WorkspaceAccessLevel,
    expiresAt?: number,
  ): WorkspaceAccessGrant {
    // Check if grantor has admin access
    if (
      !this.hasAccess(
        resourceId,
        grantedBy,
        WorkspaceAccessLevel.ADMIN,
        resourceType,
      )
    ) {
      throw new Error(
        `Agent ${grantedBy} does not have admin access to grant permissions`,
      );
    }

    // Create grant
    const grant: WorkspaceAccessGrant = {
      id: uuidv4(),
      resourceId,
      resourceType,
      grantedTo,
      grantedBy,
      accessLevel,
      grantedAt: Date.now(),
      expiresAt,
      revoked: false,
    };

    // Store grant
    const resourceGrants = this.accessGrants.get(resourceId) || [];
    resourceGrants.push(grant);
    this.accessGrants.set(resourceId, resourceGrants);

    // Update resource access control
    if (resourceType === 'artifact') {
      const artifact = this.artifacts.get(resourceId);
      if (artifact) {
        artifact.accessControl.agentAccess =
          artifact.accessControl.agentAccess || {};
        artifact.accessControl.agentAccess[grantedTo] = accessLevel;
        this.artifacts.set(resourceId, artifact);
      }
    }

    this.logger.info('Access granted', {
      resourceId,
      grantedTo,
      accessLevel,
    });

    return grant;
  }

  // Helper methods

  /**
   * Record a workspace activity
   */
  private recordActivity(activity: WorkspaceActivity): void {
    const workspaceActivities = this.activities.get(activity.workspaceId) || [];
    workspaceActivities.push(activity);
    this.activities.set(activity.workspaceId, workspaceActivities);
  }

  /**
   * Check if granted access level is sufficient for required level
   */
  private isAccessLevelSufficient(
    granted: WorkspaceAccessLevel,
    required: WorkspaceAccessLevel,
  ): boolean {
    const levels = [
      WorkspaceAccessLevel.READ,
      WorkspaceAccessLevel.COMMENT,
      WorkspaceAccessLevel.WRITE,
      WorkspaceAccessLevel.CREATE,
      WorkspaceAccessLevel.DELETE,
      WorkspaceAccessLevel.ADMIN,
    ];

    const grantedIndex = levels.indexOf(granted);
    const requiredIndex = levels.indexOf(required);

    return grantedIndex >= requiredIndex;
  }

  /**
   * Expire a lock that has reached its time limit
   */
  private expireLock(lockId: string): void {
    for (const [resourceId, locks] of this.locks.entries()) {
      const lockIndex = locks.findIndex((l) => l.id === lockId);

      if (lockIndex >= 0) {
        const lock = locks[lockIndex];

        if (lock.status === 'active') {
          lock.status = 'expired';
          locks[lockIndex] = lock;
          this.locks.set(resourceId, locks);

          this.logger.debug('Lock expired', { lockId });
        }

        break;
      }
    }
  }

  /**
   * Search for artifacts in a workspace
   */
  searchArtifacts(query: WorkspaceSearchQuery): WorkspaceArtifact[] {
    const results: WorkspaceArtifact[] = [];

    for (const artifact of this.artifacts.values()) {
      // Check if artifact belongs to the specified workspace
      if (artifact.metadata?.workspaceId !== query.workspaceId) {
        continue;
      }

      // Apply filters
      if (
        (query.artifactTypes && !query.artifactTypes.includes(artifact.type)) ||
        (query.createdBy && !query.createdBy.includes(artifact.createdBy)) ||
        (query.status && !query.status.includes(artifact.status)) ||
        (query.tags && query.tags.some((tag) => !artifact.tags?.includes(tag)))
      ) {
        continue;
      }

      // Check date range
      if (query.dateRange) {
        if (
          (query.dateRange.start &&
            artifact.createdAt < query.dateRange.start) ||
          (query.dateRange.end && artifact.createdAt > query.dateRange.end)
        ) {
          continue;
        }
      }

      // Basic text search (could be enhanced to semantic search in a real implementation)
      if (query.searchText) {
        const searchText = query.searchText.toLowerCase();
        const artifactContent =
          artifact.content && typeof artifact.content === 'string'
            ? artifact.content.toLowerCase()
            : JSON.stringify(artifact.content).toLowerCase();

        if (
          !artifact.name.toLowerCase().includes(searchText) &&
          !artifactContent.includes(searchText) &&
          !(
            artifact.description &&
            artifact.description.toLowerCase().includes(searchText)
          )
        ) {
          continue;
        }
      }

      results.push(artifact);
    }

    // Sort results
    if (query.sortBy) {
      results.sort((a, b) => {
        let aValue, bValue;

        switch (query.sortBy) {
          case 'createdAt':
            aValue = a.createdAt;
            bValue = b.createdAt;
            break;
          case 'updatedAt':
            aValue = a.updatedAt;
            bValue = b.updatedAt;
            break;
          case 'name':
            aValue = a.name;
            bValue = b.name;
            break;
          case 'priority':
            aValue = this.priorityToNumber(a.priority);
            bValue = this.priorityToNumber(b.priority);
            break;
          default:
            aValue = a.createdAt;
            bValue = b.createdAt;
        }

        return query.sortDirection === 'desc'
          ? bValue > aValue
            ? 1
            : -1
          : aValue > bValue
            ? 1
            : -1;
      });
    }

    // Apply limit
    if (query.limit && results.length > query.limit) {
      return results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Convert priority to number for sorting
   */
  private priorityToNumber(
    priority?: 'low' | 'medium' | 'high' | 'critical',
  ): number {
    switch (priority) {
      case 'critical':
        return 4;
      case 'high':
        return 3;
      case 'medium':
        return 2;
      case 'low':
        return 1;
      default:
        return 0;
    }
  }
}
