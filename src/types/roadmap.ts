export type RoadmapNodeType = 'ROOT' | 'STAGE' | 'MILESTONE' | 'TASK_GROUP' | 'KNOWLEDGE' | 'SKILL' | 'PROJECT' | 'GOAL';
export type RoadmapNodeStatus = 'LOCKED' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
export type RoadmapEdgeType = 'PREREQUISITE' | 'RECOMMENDED' | 'OPTIONAL' | 'PARALLEL';
export interface RoadmapNode { id: string; title: string; description?: string; type: RoadmapNodeType; status: RoadmapNodeStatus; importance?: number; estimatedDuration?: string; metadata?: Record<string, unknown>; positionX?: number; positionY?: number }
export interface RoadmapEdge { id: string; sourceNodeId: string; targetNodeId: string; type: RoadmapEdgeType }
export interface Roadmap { id: string; title: string; description?: string; domain?: string; goalId?: string; nodes: RoadmapNode[]; edges: RoadmapEdge[]; createdAt: string; updatedAt: string }
export interface RoadmapDraft { title: string; description?: string; domain?: string; goalId?: string; nodes: RoadmapNode[]; edges: RoadmapEdge[] }
