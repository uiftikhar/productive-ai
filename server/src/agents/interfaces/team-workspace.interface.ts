/**
 * Team Workspace Interface
 *
 * Defines standard interfaces for collaborative workspaces that enable
 * agents to share artifacts, collaborate on problem-solving, and maintain
 * shared context during complex tasks.
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Types of artifacts that can be stored in a team workspace
 */
export enum ArtifactType {
  DOCUMENT = 'document',
  CODE = 'code',
  PLAN = 'plan',
  DIAGRAM = 'diagram',
  DATASET = 'dataset',
  RESULT = 'result',
  HYPOTHESIS = 'hypothesis',
  DECISION = 'decision',
  ANALYSIS = 'analysis',
  OTHER = 'other',
}

/**
 * Access levels for workspace artifacts and resources
 */
export enum WorkspaceAccessLevel {
  READ = 'read', // Can view but not modify
  WRITE = 'write', // Can modify existing artifacts
  CREATE = 'create', // Can create new artifacts
  DELETE = 'delete', // Can delete artifacts
  ADMIN = 'admin', // Full control including access management
  COMMENT = 'comment', // Can only comment on artifacts
}

/**
 * Represents the current workspace configuration
 */
export interface WorkspaceConfiguration {
  id: string;
  name: string;
  description?: string;
  teamId: string;
  taskId: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  settings: {
    defaultAccessLevel: WorkspaceAccessLevel;
    enableVersioning: boolean;
    autoBackup: boolean;
    backupInterval?: number;
    maxArtifactSize?: number;
    allowedArtifactTypes?: ArtifactType[];
    enforceStructuredArtifacts?: boolean;
    collaborationMode: 'synchronous' | 'asynchronous';
    retentionPolicy?: {
      retentionDuration: number;
      archiveDeleted: boolean;
    };
  };
  metadata?: Record<string, any>;
}

/**
 * Workspace artifact representing a shared resource
 */
export interface WorkspaceArtifact {
  id: string;
  name: string;
  description?: string;
  type: ArtifactType;
  content: any;
  format: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  updatedBy: string;
  version: number;
  versionHistory?: Array<{
    version: number;
    timestamp: number;
    updatedBy: string;
    comment?: string;
  }>;
  status: 'draft' | 'review' | 'approved' | 'archived' | 'active';
  accessControl: {
    defaultAccess: WorkspaceAccessLevel;
    agentAccess?: Record<string, WorkspaceAccessLevel>;
    teamAccess?: Record<string, WorkspaceAccessLevel>;
  };
  tags?: string[];
  priority?: 'low' | 'medium' | 'high' | 'critical';
  dependencies?: string[]; // IDs of other artifacts this one depends on
  metadata?: Record<string, any>;
}

/**
 * Annotation attached to a workspace artifact
 */
export interface ArtifactAnnotation {
  id: string;
  artifactId: string;
  annotationType:
    | 'comment'
    | 'highlight'
    | 'suggestion'
    | 'question'
    | 'resolution';
  content: any;
  createdAt: number;
  createdBy: string;
  position?: {
    startIndex?: number;
    endIndex?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  status: 'active' | 'resolved' | 'archived';
  resolvedAt?: number;
  resolvedBy?: string;
  referencedAnnotations?: string[];
  metadata?: Record<string, any>;
}

/**
 * Workspace activity event
 */
export interface WorkspaceActivity {
  id: string;
  workspaceId: string;
  timestamp: number;
  agentId: string;
  activityType:
    | 'create'
    | 'update'
    | 'delete'
    | 'view'
    | 'comment'
    | 'share'
    | 'access_change';
  resourceType: 'artifact' | 'annotation' | 'workspace' | 'access_control';
  resourceId: string;
  details: any;
  metadata?: Record<string, any>;
}

/**
 * Collaboration session for synchronous work
 */
export interface CollaborationSession {
  id: string;
  workspaceId: string;
  startTime: number;
  endTime?: number;
  status: 'active' | 'paused' | 'completed';
  participants: string[];
  focusedArtifactId?: string;
  activeAgents: Record<
    string,
    {
      status: 'active' | 'idle' | 'observing';
      lastActivity: number;
      currentOperation?: string;
    }
  >;
  sessionGoal?: string;
  metadata?: Record<string, any>;
}

/**
 * Lock for managing concurrent access
 */
export interface WorkspaceLock {
  id: string;
  resourceId: string;
  resourceType: 'artifact' | 'annotation' | 'workspace';
  heldBy: string;
  acquiredAt: number;
  expiresAt: number;
  renewedAt?: number;
  operationType: 'read' | 'write' | 'exclusive';
  status: 'active' | 'released' | 'expired' | 'broken';
  releaseToken?: string;
}

/**
 * Access grant to a workspace or artifact
 */
export interface WorkspaceAccessGrant {
  id: string;
  resourceId: string;
  resourceType: 'workspace' | 'artifact';
  grantedTo: string;
  grantedBy: string;
  accessLevel: WorkspaceAccessLevel;
  grantedAt: number;
  expiresAt?: number;
  revoked: boolean;
  revokedAt?: number;
  revokedBy?: string;
  conditions?: {
    timeRestrictions?: {
      allowedHours?: number[][]; // [[start hour, end hour]]
      allowedDays?: number[]; // 0-6 for days of week
    };
    maxUses?: number;
    remainingUses?: number;
    requireApproval?: boolean;
  };
}

/**
 * Workspace notification for important events
 */
export interface WorkspaceNotification {
  id: string;
  workspaceId: string;
  timestamp: number;
  notificationType:
    | 'update'
    | 'mention'
    | 'comment'
    | 'access_change'
    | 'deadline'
    | 'conflict';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  resourceType?: 'artifact' | 'annotation' | 'workspace';
  resourceId?: string;
  recipients: string[];
  read: Record<string, number>; // agentId -> timestamp when read
  actions?: Array<{
    name: string;
    description: string;
    actionType: 'view' | 'approve' | 'comment' | 'resolve';
    resourceId?: string;
  }>;
}

/**
 * Conflict detected during concurrent modifications
 */
export interface WorkspaceConflict {
  id: string;
  workspaceId: string;
  artifactId: string;
  detectedAt: number;
  conflictType: 'content' | 'metadata' | 'access_control' | 'dependency';
  parties: string[];
  status: 'detected' | 'resolving' | 'resolved' | 'escalated';
  resolution?: {
    resolvedAt: number;
    resolvedBy: string;
    resolutionMethod:
      | 'merge'
      | 'override'
      | 'revert'
      | 'create_branch'
      | 'manual';
    description: string;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedResources: string[];
  metadata?: Record<string, any>;
}

/**
 * Interface for workspace search queries
 */
export interface WorkspaceSearchQuery {
  workspaceId: string;
  searchText?: string;
  artifactTypes?: ArtifactType[];
  createdBy?: string[];
  dateRange?: {
    start?: number;
    end?: number;
  };
  tags?: string[];
  status?: ('draft' | 'review' | 'approved' | 'archived' | 'active')[];
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'priority';
  sortDirection?: 'asc' | 'desc';
  semanticSearch?: boolean;
  includeAnnotations?: boolean;
  includeVersionHistory?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Helpers for creating workspace objects
 */
export function createWorkspaceConfiguration(
  name: string,
  teamId: string,
  taskId: string,
  createdBy: string,
  settings?: Partial<WorkspaceConfiguration['settings']>,
): WorkspaceConfiguration {
  const now = Date.now();

  return {
    id: uuidv4(),
    name,
    teamId,
    taskId,
    createdAt: now,
    updatedAt: now,
    createdBy,
    settings: {
      defaultAccessLevel: WorkspaceAccessLevel.READ,
      enableVersioning: true,
      autoBackup: false,
      collaborationMode: 'asynchronous',
      ...settings,
    },
  };
}

export function createWorkspaceArtifact(
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
  const now = Date.now();

  return {
    id: uuidv4(),
    name,
    type,
    content,
    format,
    createdAt: now,
    updatedAt: now,
    createdBy,
    updatedBy: createdBy,
    version: 1,
    status: 'draft',
    accessControl: {
      defaultAccess: WorkspaceAccessLevel.READ,
    },
    ...options,
  };
}
