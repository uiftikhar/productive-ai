/**
 * Shared Context Interface
 *
 * Defines interfaces for team-wide context management, synchronization,
 * and versioning to maintain consistent shared understanding between agents.
 */

import { ConversationContext } from './message-protocol.interface';

/**
 * Types of context objects that can be shared
 */
export enum SharedContextType {
  KNOWLEDGE = 'knowledge',
  TASK = 'task',
  CONVERSATION = 'conversation',
  DECISION = 'decision',
  ARTIFACT = 'artifact',
  PLAN = 'plan',
  RESOURCE = 'resource',
  RELATIONSHIP = 'relationship',
  ENVIRONMENT = 'environment',
  META = 'meta',
}

/**
 * Access levels for shared context objects
 */
export enum ContextAccessLevel {
  READ_ONLY = 'read_only',
  COMMENT = 'comment',
  SUGGEST = 'suggest',
  EDIT = 'edit',
  ADMIN = 'admin',
}

/**
 * Change type for context versioning
 */
export enum ContextChangeType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  MERGE = 'merge',
}

/**
 * Base shared context object
 */
export interface SharedContextObject {
  id: string;
  type: SharedContextType;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: number;
  updatedBy: string;
  updatedAt: number;
  version: number;
  accessControl: {
    defaultAccess: ContextAccessLevel;
    agentAccess?: Record<string, ContextAccessLevel>;
    teamAccess?: Record<string, ContextAccessLevel>;
  };
  metadata?: Record<string, any>;
}

/**
 * Knowledge context containing shared information
 */
export interface KnowledgeContext extends SharedContextObject {
  type: SharedContextType.KNOWLEDGE;
  content: any;
  sources?: string[];
  confidence?: number;
  tags?: string[];
  relatedContextIds?: string[];
}

/**
 * Task context containing shared task information
 */
export interface TaskContext extends SharedContextObject {
  type: SharedContextType.TASK;
  taskId: string;
  status: 'not_started' | 'in_progress' | 'blocked' | 'completed' | 'failed';
  assignees: string[];
  deadline?: number;
  progress?: number;
  subTasks?: string[];
  parentTaskId?: string;
  requirements?: string[];
  artifacts?: string[];
  blockers?: {
    description: string;
    severity: 'low' | 'medium' | 'high';
    reportedBy: string;
    reportedAt: number;
    resolvedAt?: number;
  }[];
}

/**
 * Conversation context containing shared conversation
 */
export interface ConversationContextObject extends SharedContextObject {
  type: SharedContextType.CONVERSATION;
  conversation: ConversationContext;
  summary?: string;
  keyPoints?: string[];
  decisions?: string[];
  actionItems?: string[];
}

/**
 * Decision context for shared decision-making
 */
export interface DecisionContext extends SharedContextObject {
  type: SharedContextType.DECISION;
  topic: string;
  options: Array<{
    id: string;
    description: string;
    pros: string[];
    cons: string[];
    proposedBy: string;
  }>;
  criteria: Array<{
    name: string;
    weight: number;
    description: string;
  }>;
  votes?: Record<string, string>; // agent ID to option ID
  selectedOption?: string;
  justification?: string;
  status: 'open' | 'voting' | 'decided' | 'implemented' | 'evaluated';
}

/**
 * Artifact context for shared work products
 */
export interface ArtifactContext extends SharedContextObject {
  type: SharedContextType.ARTIFACT;
  artifactType: string;
  content: any;
  format: string;
  versionLabel: string;
  status: 'draft' | 'review' | 'approved' | 'published';
  contributors: string[];
  dependencies?: string[];
  derivedFrom?: string[];
}

/**
 * Plan context for shared planning
 */
export interface PlanContext extends SharedContextObject {
  type: SharedContextType.PLAN;
  goal: string;
  steps: Array<{
    id: string;
    description: string;
    assignedTo?: string[];
    dependencies?: string[];
    status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
    estimatedDuration?: number;
    actualDuration?: number;
  }>;
  startDate?: number;
  endDate?: number;
  status: 'draft' | 'active' | 'completed' | 'abandoned';
  contingencies?: Array<{
    trigger: string;
    response: string;
  }>;
}

/**
 * Context change record for versioning
 */
export interface ContextChangeRecord {
  id: string;
  contextId: string;
  changeType: ContextChangeType;
  changedBy: string;
  changedAt: number;
  version: {
    from: number;
    to: number;
  };
  changes: {
    path: string;
    previousValue: any;
    newValue: any;
  }[];
  reason?: string;
  conflictResolution?: {
    conflictWith: string;
    resolutionStrategy: 'override' | 'merge' | 'keep_both';
    resolutionDetails?: string;
  };
}

/**
 * Context subscription options
 */
export interface ContextSubscriptionOptions {
  contextType?: SharedContextType | SharedContextType[];
  changeTypes?: ContextChangeType[];
  properties?: string[];
  notifyOnCreate?: boolean;
  notifyOnUpdate?: boolean;
  notifyOnDelete?: boolean;
  throttleMs?: number;
}

/**
 * Context subscription notification
 */
export interface ContextChangeNotification {
  subscriptionId: string;
  agentId: string;
  change: ContextChangeRecord;
  timestamp: number;
  context: {
    before?: SharedContextObject;
    after?: SharedContextObject;
  };
}

/**
 * Context conflict detection result
 */
export interface ContextConflict {
  id: string;
  contextId: string;
  conflictingChanges: ContextChangeRecord[];
  detectedAt: number;
  status: 'detected' | 'resolving' | 'resolved' | 'escalated';
  resolution?: {
    strategy: 'manual' | 'rule_based' | 'voting' | 'priority_based';
    resolvedBy: string;
    resolvedAt: number;
    selectedChange?: string;
    mergedResult?: any;
  };
  severity: 'low' | 'medium' | 'high';
  affectedAgents: string[];
}

/**
 * Conflict resolution strategy
 */
export enum ConflictResolutionStrategy {
  LAST_WRITE_WINS = 'last_write_wins',
  PRIORITY_AGENT = 'priority_agent',
  MERGE_CHANGES = 'merge_changes',
  CONSENSUS_VOTING = 'consensus_voting',
  ESCALATE_TO_HUMAN = 'escalate_to_human',
}

/**
 * Context synchronization status
 */
export interface ContextSyncStatus {
  contextId: string;
  agentId: string;
  lastSyncedVersion: number;
  lastSyncedAt: number;
  pendingChanges: boolean;
  syncErrors?: string[];
  syncAttempts: number;
}

/**
 * Context access grant
 */
export interface ContextAccessGrant {
  id: string;
  contextId: string;
  grantedTo: string;
  grantedBy: string;
  accessLevel: ContextAccessLevel;
  grantedAt: number;
  expiresAt?: number;
  revoked?: boolean;
  revokedAt?: number;
  revokedBy?: string;
}

/**
 * Team-wide context settings
 */
export interface TeamContextSettings {
  teamId: string;
  defaultAccessLevel: ContextAccessLevel;
  autoSync: boolean;
  syncIntervalMs: number;
  conflictResolution: {
    defaultStrategy: ConflictResolutionStrategy;
    strategyByContextType?: Record<
      SharedContextType,
      ConflictResolutionStrategy
    >;
    escalationThreshold?: number;
  };
  retentionPolicy?: {
    maxAge?: number;
    maxVersions?: number;
    archiveOldVersions?: boolean;
  };
}
