import type { CSSProperties, MouseEvent, ReactNode } from 'react';

export interface Node<Data = object> {
  id: string;
  position: { x: number; y: number };
  data?: Data;
  type?: string;
  style?: CSSProperties;
}

export interface Edge<Data = object> {
  id: string;
  source: string;
  target: string;
  data?: Data;
  animated?: boolean;
}

export type NodeChange<NodeType extends Node = Node> = { id: string; type: string; position?: NodeType['position'] };
export type EdgeChange<EdgeType extends Edge = Edge> = { id: string; type: string };

export interface ReactFlowProps<NodeType extends Node = Node, EdgeType extends Edge = Edge> {
  nodes?: NodeType[];
  edges?: EdgeType[];
  onNodesChange?: (changes: NodeChange<NodeType>[]) => void;
  onEdgesChange?: (changes: EdgeChange<EdgeType>[]) => void;
  onNodeClick?: (event: MouseEvent, node: NodeType) => void;
  className?: string;
  fitView?: boolean;
  selectedNodeId?: string;
  children?: ReactNode;
}

export function ReactFlow<NodeType extends Node = Node, EdgeType extends Edge = Edge>(props: ReactFlowProps<NodeType, EdgeType>): JSX.Element;
export function Background(): JSX.Element;
export function Controls(): JSX.Element;
export function applyNodeChanges<NodeType extends Node = Node>(changes: NodeChange<NodeType>[], nodes: NodeType[]): NodeType[];
export function applyEdgeChanges<EdgeType extends Edge = Edge>(changes: EdgeChange<EdgeType>[], edges: EdgeType[]): EdgeType[];
