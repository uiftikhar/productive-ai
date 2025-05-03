/**
 * Represents a node in the dynamic graph
 */
export interface DynamicGraphNode<TState = any> {
  id: string;
  type: string;
  label?: string;
  handler?: (state: TState) => Promise<TState>;
  metadata?: Record<string, any>;
}

/**
 * Represents an edge in the dynamic graph
 */
export interface DynamicGraphEdge {
  id: string;
  source: string;
  target: string;
  condition?: (state: any) => boolean | Promise<boolean>;
  label?: string;
  metadata?: Record<string, any>;
}

/**
 * Types of graph modifications
 */
export enum GraphModificationType {
  ADD_NODE = 'add_node',
  REMOVE_NODE = 'remove_node',
  ADD_EDGE = 'add_edge',
  REMOVE_EDGE = 'remove_edge',
  UPDATE_NODE = 'update_node',
  UPDATE_EDGE = 'update_edge',
}

/**
 * Base interface for graph modifications
 */
export interface BaseGraphModification {
  id: string;
  type: GraphModificationType;
  timestamp: number;
  agentId?: string;
  reason?: string;
}

/**
 * Graph modification for adding a node
 */
export interface AddNodeModification<TState = any>
  extends BaseGraphModification {
  type: GraphModificationType.ADD_NODE;
  node: DynamicGraphNode<TState>;
}

/**
 * Graph modification for removing a node
 */
export interface RemoveNodeModification extends BaseGraphModification {
  type: GraphModificationType.REMOVE_NODE;
  nodeId: string;
}

/**
 * Graph modification for adding an edge
 */
export interface AddEdgeModification extends BaseGraphModification {
  type: GraphModificationType.ADD_EDGE;
  edge: DynamicGraphEdge;
}

/**
 * Graph modification for removing an edge
 */
export interface RemoveEdgeModification extends BaseGraphModification {
  type: GraphModificationType.REMOVE_EDGE;
  edgeId: string;
}

/**
 * Graph modification for updating a node
 */
export interface UpdateNodeModification<TState = any>
  extends BaseGraphModification {
  type: GraphModificationType.UPDATE_NODE;
  nodeId: string;
  updates: Partial<DynamicGraphNode<TState>>;
}

/**
 * Graph modification for updating an edge
 */
export interface UpdateEdgeModification extends BaseGraphModification {
  type: GraphModificationType.UPDATE_EDGE;
  edgeId: string;
  updates: Partial<DynamicGraphEdge>;
}

/**
 * Union type for all graph modifications
 */
export type GraphModification<TState = any> =
  | AddNodeModification<TState>
  | RemoveNodeModification
  | AddEdgeModification
  | RemoveEdgeModification
  | UpdateNodeModification<TState>
  | UpdateEdgeModification;

/**
 * Interface for objects that can apply graph modifications
 */
export interface GraphModifier<TState = any> {
  /**
   * Apply a modification to the graph
   */
  applyModification(modification: GraphModification<TState>): Promise<boolean>;

  /**
   * Apply multiple modifications to the graph
   */
  applyModifications(
    modifications: GraphModification<TState>[],
  ): Promise<boolean[]>;

  /**
   * Get the history of modifications applied to the graph
   */
  getModificationHistory(): GraphModification<TState>[];
}
