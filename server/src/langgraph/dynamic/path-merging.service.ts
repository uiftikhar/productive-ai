import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
// Note: Future implementation will likely incorporate LLM-based reasoning
// for intelligent conflict resolution during path merging operations
// using imports like ChatOpenAI, BaseMessage, SystemMessage, JsonOutputParser.

import {
  DynamicGraphService,
  DynamicGraphState,
} from './dynamic-graph.service';
import {
  ParallelExecutionState,
  ExecutionBranch,
  BranchStatus,
  ParallelExplorationService,
} from './parallel-exploration.service';
import { PathEvaluationService } from './path-evaluation.service';
import {
  GraphModification,
  GraphModificationType,
} from './interfaces/graph-modification.interface';

/**
 * Result of a merge operation
 */
export interface MergeResult {
  id: string;
  timestamp: number;
  success: boolean;
  sourceBranchId: string;
  targetBranchId: string;
  mergedNodes: string[];
  mergedEdges: string[];
  conflicts: Array<{
    nodeId?: string;
    edgeId?: string;
    type: string;
    resolution: 'source' | 'target' | 'manual' | 'combine';
    description: string;
  }>;
  error?: string;
}

/**
 * Configuration for merge operations
 */
export interface MergeConfig {
  conflictResolutionStrategy?:
    | 'prefer-source'
    | 'prefer-target'
    | 'prefer-higher-score'
    | 'manual';
  minBranchScoreForAutoMerge?: number;
  requireCompletedBranches?: boolean;
  maxAllowedConflicts?: number;
  attemptPartialMerge?: boolean;
  verifyStateAfterMerge?: boolean;
}

/**
 * Service that handles merging parallel execution paths
 */
export class PathMergingService {
  private readonly logger: Logger;
  private readonly graphService: DynamicGraphService<ParallelExecutionState>;
  private readonly explorationService: ParallelExplorationService;
  private readonly evaluationService: PathEvaluationService;
  private readonly config: MergeConfig;
  private readonly mergeHistory: MergeResult[] = [];

  /**
   * Create a new path merging service
   */
  constructor(
    graphService: DynamicGraphService<ParallelExecutionState>,
    explorationService: ParallelExplorationService,
    evaluationService: PathEvaluationService,
    options: {
      config?: MergeConfig;
      logger?: Logger;
    } = {},
  ) {
    this.graphService = graphService;
    this.explorationService = explorationService;
    this.evaluationService = evaluationService;
    this.logger = options.logger || new ConsoleLogger();

    // Set default configuration
    this.config = {
      conflictResolutionStrategy: 'prefer-higher-score',
      minBranchScoreForAutoMerge: 0.7,
      requireCompletedBranches: false,
      maxAllowedConflicts: 5,
      attemptPartialMerge: true,
      verifyStateAfterMerge: true,
      ...options.config,
    };
  }

  /**
   * Merge two branches together
   */
  public async mergeBranches(
    state: ParallelExecutionState,
    sourceBranchId: string,
    targetBranchId: string,
  ): Promise<MergeResult> {
    const sourceBranch = state.branches[sourceBranchId];
    const targetBranch = state.branches[targetBranchId];

    if (!sourceBranch) {
      return this.createErrorResult(
        'Source branch not found',
        sourceBranchId,
        targetBranchId,
      );
    }

    if (!targetBranch) {
      return this.createErrorResult(
        'Target branch not found',
        sourceBranchId,
        targetBranchId,
      );
    }

    // Check if branches are eligible for merging
    if (
      this.config.requireCompletedBranches &&
      sourceBranch.status !== BranchStatus.COMPLETED
    ) {
      return this.createErrorResult(
        'Source branch is not completed',
        sourceBranchId,
        targetBranchId,
      );
    }

    this.logger.info('Starting branch merge', {
      sourceBranchId,
      targetBranchId,
      sourceStatus: sourceBranch.status,
      targetStatus: targetBranch.status,
    });

    try {
      // Evaluate both branches
      const sourceEval = this.evaluationService.evaluateBranch(sourceBranch);

      // Check if source branch meets score threshold
      if (
        sourceEval.overallScore <
        (this.config.minBranchScoreForAutoMerge || 0.7)
      ) {
        return this.createErrorResult(
          `Source branch score ${sourceEval.overallScore.toFixed(2)} below threshold ${this.config.minBranchScoreForAutoMerge}`,
          sourceBranchId,
          targetBranchId,
        );
      }

      // Prepare merge result
      const mergeResult: MergeResult = {
        id: uuidv4(),
        timestamp: Date.now(),
        success: false,
        sourceBranchId,
        targetBranchId,
        mergedNodes: [],
        mergedEdges: [],
        conflicts: [],
      };

      // Identify modifications to merge
      const sourceModifications = this.extractModifications(sourceBranch);
      const targetModifications = this.extractModifications(targetBranch);

      // Find conflicts
      const conflicts = this.findConflicts(
        sourceModifications,
        targetModifications,
      );

      // Abort if too many conflicts
      if (conflicts.length > (this.config.maxAllowedConflicts || 5)) {
        return this.createErrorResult(
          `Too many conflicts (${conflicts.length}) to auto-merge`,
          sourceBranchId,
          targetBranchId,
        );
      }

      // Resolve conflicts
      const resolvedConflicts = this.resolveConflicts(
        conflicts,
        sourceEval,
        sourceBranch,
        targetBranch,
      );

      mergeResult.conflicts = resolvedConflicts;

      // Apply merged modifications
      const modificationsToApply = this.getMergedModifications(
        sourceModifications,
        targetModifications,
        resolvedConflicts,
      );

      // Perform the merge
      for (const mod of modificationsToApply) {
        await this.graphService.applyModification(mod);

        // Record merged items
        if (
          mod.type === GraphModificationType.ADD_NODE ||
          mod.type === GraphModificationType.UPDATE_NODE
        ) {
          const nodeId =
            'nodeId' in mod ? mod.nodeId : 'node' in mod ? mod.node.id : '';
          if (nodeId && !mergeResult.mergedNodes.includes(nodeId)) {
            mergeResult.mergedNodes.push(nodeId);
          }
        } else if (
          mod.type === GraphModificationType.ADD_EDGE ||
          mod.type === GraphModificationType.UPDATE_EDGE
        ) {
          const edgeId =
            'edgeId' in mod ? mod.edgeId : 'edge' in mod ? mod.edge.id : '';
          if (edgeId && !mergeResult.mergedEdges.includes(edgeId)) {
            mergeResult.mergedEdges.push(edgeId);
          }
        }
      }

      // Update branch status
      sourceBranch.status = BranchStatus.MERGED;
      sourceBranch.updatedAt = Date.now();

      // Update merge history in state
      state.mergeHistory.push({
        timestamp: Date.now(),
        sourceBranchId,
        targetBranchId,
        result: 'success',
        reason: `Merged ${mergeResult.mergedNodes.length} nodes and ${mergeResult.mergedEdges.length} edges`,
      });

      // Record successful merge
      mergeResult.success = true;
      this.mergeHistory.push(mergeResult);

      this.logger.info('Branch merge completed successfully', {
        sourceBranchId,
        targetBranchId,
        mergedNodes: mergeResult.mergedNodes.length,
        mergedEdges: mergeResult.mergedEdges.length,
        conflicts: mergeResult.conflicts.length,
      });

      return mergeResult;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Error merging branches', {
        sourceBranchId,
        targetBranchId,
        error: errorMessage,
      });

      // Update merge history in state
      state.mergeHistory.push({
        timestamp: Date.now(),
        sourceBranchId,
        targetBranchId,
        result: 'failure',
        reason: errorMessage,
      });

      return this.createErrorResult(
        errorMessage,
        sourceBranchId,
        targetBranchId,
      );
    }
  }

  /**
   * Find potential merge candidates
   */
  public findMergeCandidates(state: ParallelExecutionState): Array<{
    sourceBranchId: string;
    targetBranchId: string;
    compatibility: number;
    recommendation: string;
  }> {
    const candidates: Array<{
      sourceBranchId: string;
      targetBranchId: string;
      compatibility: number;
      recommendation: string;
    }> = [];

    // Get all completed branches
    const completedBranches = Object.entries(state.branches)
      .filter(
        ([_, branch]) =>
          branch.status === BranchStatus.COMPLETED &&
          branch.id !== state.primaryBranchId,
      )
      .map(([id, _]) => id);

    if (completedBranches.length === 0) {
      return candidates;
    }

    // Evaluate compatibility with primary branch
    for (const branchId of completedBranches) {
      const compatibility = this.evaluateBranchCompatibility(
        state,
        branchId,
        state.primaryBranchId,
      );

      candidates.push({
        sourceBranchId: branchId,
        targetBranchId: state.primaryBranchId,
        compatibility,
        recommendation: this.getMergeRecommendation(compatibility),
      });
    }

    // Sort by compatibility
    return candidates.sort((a, b) => b.compatibility - a.compatibility);
  }

  /**
   * Get a recommendation based on compatibility score
   */
  private getMergeRecommendation(compatibility: number): string {
    if (compatibility > 0.8) {
      return 'Highly recommended - very compatible branches';
    } else if (compatibility > 0.6) {
      return 'Recommended - good compatibility';
    } else if (compatibility > 0.4) {
      return 'Consider merging - moderate compatibility';
    } else if (compatibility > 0.2) {
      return 'Use caution - low compatibility';
    } else {
      return 'Not recommended - very low compatibility';
    }
  }

  /**
   * Evaluate the compatibility of two branches for merging
   */
  private evaluateBranchCompatibility(
    state: ParallelExecutionState,
    sourceBranchId: string,
    targetBranchId: string,
  ): number {
    const sourceBranch = state.branches[sourceBranchId];
    const targetBranch = state.branches[targetBranchId];

    if (!sourceBranch || !targetBranch) {
      return 0;
    }

    // Simple compatibility metrics:

    // 1. Common ancestor - branches with same parent are more compatible
    const commonAncestor =
      sourceBranch.parentBranchId === targetBranch.id ||
      targetBranch.parentBranchId === sourceBranch.id ||
      sourceBranch.parentBranchId === targetBranch.parentBranchId;

    // 2. Path overlap - branches with similar execution paths are more compatible
    const sourceSet = new Set(sourceBranch.state.executionPath);
    const targetSet = new Set(targetBranch.state.executionPath);
    const overlapCount = [...sourceSet].filter((nodeId) =>
      targetSet.has(nodeId),
    ).length;
    const overlapRatio =
      overlapCount / Math.max(sourceSet.size, targetSet.size);

    // 3. Modification overlap - branches modifying the same areas may have conflicts
    const sourceModifications = this.extractModifications(sourceBranch);
    const targetModifications = this.extractModifications(targetBranch);
    const conflicts = this.findConflicts(
      sourceModifications,
      targetModifications,
    );
    const conflictRatio =
      conflicts.length /
      Math.max(1, sourceModifications.length + targetModifications.length);

    // Calculate combined compatibility score
    const score =
      (commonAncestor ? 0.3 : 0) +
      overlapRatio * 0.4 +
      (1 - conflictRatio) * 0.3;

    return Math.min(1, Math.max(0, score));
  }

  /**
   * Extract all modifications from a branch's history
   */
  private extractModifications(
    branch: ExecutionBranch<ParallelExecutionState>,
  ): GraphModification[] {
    return branch.state.modificationHistory || [];
  }

  /**
   * Find conflicts between two sets of modifications
   */
  private findConflicts(
    sourceModifications: GraphModification[],
    targetModifications: GraphModification[],
  ): Array<{
    sourceModification?: GraphModification;
    targetModification?: GraphModification;
    type: string;
    description: string;
  }> {
    const conflicts: Array<{
      sourceModification?: GraphModification;
      targetModification?: GraphModification;
      type: string;
      description: string;
    }> = [];

    // Map modifications by affected node/edge
    const sourceNodeMods = new Map<string, GraphModification[]>();
    const sourceEdgeMods = new Map<string, GraphModification[]>();
    const targetNodeMods = new Map<string, GraphModification[]>();
    const targetEdgeMods = new Map<string, GraphModification[]>();

    // Organize source modifications
    for (const mod of sourceModifications) {
      if (
        mod.type === GraphModificationType.ADD_NODE ||
        mod.type === GraphModificationType.UPDATE_NODE ||
        mod.type === GraphModificationType.REMOVE_NODE
      ) {
        const nodeId =
          'nodeId' in mod ? mod.nodeId : 'node' in mod ? mod.node.id : '';
        if (nodeId) {
          const mods = sourceNodeMods.get(nodeId) || [];
          mods.push(mod);
          sourceNodeMods.set(nodeId, mods);
        }
      } else if (
        mod.type === GraphModificationType.ADD_EDGE ||
        mod.type === GraphModificationType.UPDATE_EDGE ||
        mod.type === GraphModificationType.REMOVE_EDGE
      ) {
        const edgeId =
          'edgeId' in mod ? mod.edgeId : 'edge' in mod ? mod.edge.id : '';
        if (edgeId) {
          const mods = sourceEdgeMods.get(edgeId) || [];
          mods.push(mod);
          sourceEdgeMods.set(edgeId, mods);
        }
      }
    }

    // Organize target modifications
    for (const mod of targetModifications) {
      if (
        mod.type === GraphModificationType.ADD_NODE ||
        mod.type === GraphModificationType.UPDATE_NODE ||
        mod.type === GraphModificationType.REMOVE_NODE
      ) {
        const nodeId =
          'nodeId' in mod ? mod.nodeId : 'node' in mod ? mod.node.id : '';
        if (nodeId) {
          const mods = targetNodeMods.get(nodeId) || [];
          mods.push(mod);
          targetNodeMods.set(nodeId, mods);
        }
      } else if (
        mod.type === GraphModificationType.ADD_EDGE ||
        mod.type === GraphModificationType.UPDATE_EDGE ||
        mod.type === GraphModificationType.REMOVE_EDGE
      ) {
        const edgeId =
          'edgeId' in mod ? mod.edgeId : 'edge' in mod ? mod.edge.id : '';
        if (edgeId) {
          const mods = targetEdgeMods.get(edgeId) || [];
          mods.push(mod);
          targetEdgeMods.set(edgeId, mods);
        }
      }
    }

    // Find node conflicts
    for (const [nodeId, sourceMods] of sourceNodeMods.entries()) {
      const targetMods = targetNodeMods.get(nodeId);

      if (targetMods) {
        // Both branches modify the same node
        const sourceLastMod = sourceMods[sourceMods.length - 1];
        const targetLastMod = targetMods[targetMods.length - 1];

        // Check for conflicting modifications
        if (sourceLastMod.type !== targetLastMod.type) {
          conflicts.push({
            sourceModification: sourceLastMod,
            targetModification: targetLastMod,
            type: 'node_operation_conflict',
            description: `Conflicting operations on node ${nodeId}: ${sourceLastMod.type} vs ${targetLastMod.type}`,
          });
        } else if (
          sourceLastMod.type === GraphModificationType.UPDATE_NODE &&
          targetLastMod.type === GraphModificationType.UPDATE_NODE
        ) {
          // Check for property conflicts in updates
          const sourceUpdates =
            'updates' in sourceLastMod ? sourceLastMod.updates : {};
          const targetUpdates =
            'updates' in targetLastMod ? targetLastMod.updates : {};

          const conflictingProps = this.findConflictingProperties(
            sourceUpdates,
            targetUpdates,
          );

          if (conflictingProps.length > 0) {
            conflicts.push({
              sourceModification: sourceLastMod,
              targetModification: targetLastMod,
              type: 'node_property_conflict',
              description: `Conflicting property updates on node ${nodeId}: ${conflictingProps.join(', ')}`,
            });
          }
        }
      }
    }

    // Find edge conflicts (similar approach as node conflicts)
    for (const [edgeId, sourceMods] of sourceEdgeMods.entries()) {
      const targetMods = targetEdgeMods.get(edgeId);

      if (targetMods) {
        // Both branches modify the same edge
        const sourceLastMod = sourceMods[sourceMods.length - 1];
        const targetLastMod = targetMods[targetMods.length - 1];

        // Check for conflicting modifications
        if (sourceLastMod.type !== targetLastMod.type) {
          conflicts.push({
            sourceModification: sourceLastMod,
            targetModification: targetLastMod,
            type: 'edge_operation_conflict',
            description: `Conflicting operations on edge ${edgeId}: ${sourceLastMod.type} vs ${targetLastMod.type}`,
          });
        } else if (
          sourceLastMod.type === GraphModificationType.UPDATE_EDGE &&
          targetLastMod.type === GraphModificationType.UPDATE_EDGE
        ) {
          // Check for property conflicts in updates
          const sourceUpdates =
            'updates' in sourceLastMod ? sourceLastMod.updates : {};
          const targetUpdates =
            'updates' in targetLastMod ? targetLastMod.updates : {};

          const conflictingProps = this.findConflictingProperties(
            sourceUpdates,
            targetUpdates,
          );

          if (conflictingProps.length > 0) {
            conflicts.push({
              sourceModification: sourceLastMod,
              targetModification: targetLastMod,
              type: 'edge_property_conflict',
              description: `Conflicting property updates on edge ${edgeId}: ${conflictingProps.join(', ')}`,
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Find conflicting properties between two object updates
   */
  private findConflictingProperties(
    sourceUpdates: Record<string, any>,
    targetUpdates: Record<string, any>,
  ): string[] {
    const conflicts: string[] = [];

    for (const [key, sourceValue] of Object.entries(sourceUpdates)) {
      if (key in targetUpdates) {
        const targetValue = targetUpdates[key];

        // Check if values are different
        if (JSON.stringify(sourceValue) !== JSON.stringify(targetValue)) {
          conflicts.push(key);
        }
      }
    }

    return conflicts;
  }

  /**
   * Resolve conflicts between modifications
   */
  private resolveConflicts(
    conflicts: Array<{
      sourceModification?: GraphModification;
      targetModification?: GraphModification;
      type: string;
      description: string;
    }>,
    sourceEval: any,
    sourceBranch: ExecutionBranch<ParallelExecutionState>,
    targetBranch: ExecutionBranch<ParallelExecutionState>,
  ): Array<{
    nodeId?: string;
    edgeId?: string;
    type: string;
    resolution: 'source' | 'target' | 'manual' | 'combine';
    description: string;
  }> {
    const resolvedConflicts: Array<{
      nodeId?: string;
      edgeId?: string;
      type: string;
      resolution: 'source' | 'target' | 'manual' | 'combine';
      description: string;
    }> = [];

    // Use the configured conflict resolution strategy
    const strategy =
      this.config.conflictResolutionStrategy || 'prefer-higher-score';

    for (const conflict of conflicts) {
      const sourceMod = conflict.sourceModification;
      const targetMod = conflict.targetModification;

      if (!sourceMod || !targetMod) {
        continue;
      }

      // Get node or edge ID from the modifications
      const nodeId =
        'nodeId' in sourceMod
          ? sourceMod.nodeId
          : 'node' in sourceMod
            ? sourceMod.node.id
            : undefined;

      const edgeId =
        'edgeId' in sourceMod
          ? sourceMod.edgeId
          : 'edge' in sourceMod
            ? sourceMod.edge.id
            : undefined;

      // Apply resolution strategy
      let resolution: 'source' | 'target' | 'manual' | 'combine' = 'manual';

      switch (strategy) {
        case 'prefer-source':
          resolution = 'source';
          break;

        case 'prefer-target':
          resolution = 'target';
          break;

        case 'prefer-higher-score':
          // Compare branch scores
          const sourceScore = sourceEval.overallScore || 0;
          const targetScore = 0.5; // Default score for target branch

          resolution = sourceScore > targetScore ? 'source' : 'target';
          break;

        case 'manual':
          resolution = 'manual';
          break;
      }

      // For property conflicts, try to combine when possible
      if (
        conflict.type === 'node_property_conflict' ||
        conflict.type === 'edge_property_conflict'
      ) {
        if (strategy !== 'manual') {
          resolution = 'combine';
        }
      }

      // Record the resolved conflict
      resolvedConflicts.push({
        nodeId,
        edgeId,
        type: conflict.type,
        resolution,
        description: `${conflict.description} - resolved using ${resolution}`,
      });
    }

    return resolvedConflicts;
  }

  /**
   * Get merged modifications after conflict resolution
   */
  private getMergedModifications(
    sourceModifications: GraphModification[],
    targetModifications: GraphModification[],
    resolvedConflicts: Array<{
      nodeId?: string;
      edgeId?: string;
      type: string;
      resolution: 'source' | 'target' | 'manual' | 'combine';
      description: string;
    }>,
  ): GraphModification[] {
    // Start with all non-conflicting modifications
    const mergedModifications: GraphModification[] = [];

    // Track which modifications have been handled
    const handledSourceMods = new Set<string>();
    const handledTargetMods = new Set<string>();

    // First, apply all resolved conflicts
    for (const conflict of resolvedConflicts) {
      const { nodeId, edgeId, resolution } = conflict;

      // Find the relevant modifications
      const sourceMod = sourceModifications.find((mod) => {
        const hasNodeId = nodeId && 'nodeId' in mod && mod.nodeId === nodeId;
        const hasNodeInNode =
          nodeId && 'node' in mod && (mod as any).node?.id === nodeId;
        const hasEdgeId = edgeId && 'edgeId' in mod && mod.edgeId === edgeId;
        const hasEdgeInEdge =
          edgeId && 'edge' in mod && (mod as any).edge?.id === edgeId;

        return hasNodeId || hasNodeInNode || hasEdgeId || hasEdgeInEdge;
      });

      const targetMod = targetModifications.find((mod) => {
        const hasNodeId = nodeId && 'nodeId' in mod && mod.nodeId === nodeId;
        const hasNodeInNode =
          nodeId && 'node' in mod && (mod as any).node?.id === nodeId;
        const hasEdgeId = edgeId && 'edgeId' in mod && mod.edgeId === edgeId;
        const hasEdgeInEdge =
          edgeId && 'edge' in mod && (mod as any).edge?.id === edgeId;

        return hasNodeId || hasNodeInNode || hasEdgeId || hasEdgeInEdge;
      });

      // Skip if we can't find the modifications
      if (!sourceMod && !targetMod) {
        continue;
      }

      if (sourceMod) handledSourceMods.add(sourceMod.id);
      if (targetMod) handledTargetMods.add(targetMod.id);

      // Apply resolution
      switch (resolution) {
        case 'source':
          if (sourceMod) mergedModifications.push(sourceMod);
          break;

        case 'target':
          if (targetMod) mergedModifications.push(targetMod);
          break;

        case 'combine':
          if (sourceMod && targetMod) {
            const combinedMod = this.combineModifications(sourceMod, targetMod);
            mergedModifications.push(combinedMod);
          } else if (sourceMod) {
            mergedModifications.push(sourceMod);
          } else if (targetMod) {
            mergedModifications.push(targetMod);
          }
          break;

        case 'manual':
          // Manual resolution would require user input
          // For now, prefer source
          if (sourceMod) mergedModifications.push(sourceMod);
          break;
      }
    }

    // Add all non-conflicting source modifications
    for (const mod of sourceModifications) {
      if (!handledSourceMods.has(mod.id)) {
        mergedModifications.push(mod);
      }
    }

    // Add all non-conflicting target modifications
    for (const mod of targetModifications) {
      if (!handledTargetMods.has(mod.id)) {
        mergedModifications.push(mod);
      }
    }

    return mergedModifications;
  }

  /**
   * Combine two update modifications
   */
  private combineModifications(
    sourceMod: GraphModification,
    targetMod: GraphModification,
  ): GraphModification {
    // Create a copy of the target modification
    const combinedMod = { ...targetMod };

    // Check if both are update modifications with updates property
    if ('updates' in sourceMod && 'updates' in combinedMod) {
      // Combine updates, preferring source values for conflicts
      combinedMod.updates = {
        ...combinedMod.updates,
        ...sourceMod.updates,
      };
    }

    return combinedMod;
  }

  /**
   * Create an error result for failed merges
   */
  private createErrorResult(
    error: string,
    sourceBranchId: string,
    targetBranchId: string,
  ): MergeResult {
    const result: MergeResult = {
      id: uuidv4(),
      timestamp: Date.now(),
      success: false,
      sourceBranchId,
      targetBranchId,
      mergedNodes: [],
      mergedEdges: [],
      conflicts: [],
      error,
    };

    this.mergeHistory.push(result);
    return result;
  }

  /**
   * Get the merge history
   */
  public getMergeHistory(): MergeResult[] {
    return [...this.mergeHistory];
  }
}
