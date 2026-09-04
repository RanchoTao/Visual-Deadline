import type { ActivityType, Importance } from './task';

export type GoalLayer = 'direction' | 'long_term' | 'stage' | 'phase' | 'milestone' | 'task';
export type GoalStatus = 'focus' | 'secondary' | 'maintenance' | 'waiting' | 'blocked' | 'opportunity' | 'completed' | 'archived';
export type DependencyType = 'requires' | 'supports' | 'blocks' | 'conflicts_with' | 'synergy';
export type ReplanScope = 'small' | 'weekly' | 'major';

export interface LifeNode {
  id: string; layer: GoalLayer; title: string; description?: string; parentId?: string;
  status: GoalStatus; domain: ActivityType; importance: Importance; deadline?: string;
  startDate?: string; expectedEndDate?: string; focusLevel?: number; successCriteria?: string;
  resourceBudget?: { minutesPerWeek?: number; money?: number }; nextAction?: string; locked?: boolean;
  /** Path semantics are optional so existing saved nodes remain valid. */
  pathId?: string; pathName?: string; pathStatus?: 'active' | 'paused' | 'abandoned' | 'completed' | 'future';
  predecessorId?: string; mergeTargetId?: string; displayOrder?: number; current?: boolean; sourceGoalId?: string;
}
export interface GoalDependency { id: string; sourceId: string; targetId: string; type: DependencyType; critical?: boolean }
export interface Commitment { id: string; title: string; start: string; end: string; locked: boolean }
export interface ResourceSnapshot { date: string; availableMinutes: number; attentionCapacity?: number; energyLevel?: number; discretionaryBudget?: number; fixedCommitments?: Commitment[]; source: 'manual' | 'estimated' | 'imported' }
export type ExecutionEventType = 'task_created' | 'task_started' | 'task_completed' | 'task_skipped' | 'task_postponed' | 'task_failed' | 'task_estimate_changed' | 'goal_created' | 'goal_status_changed' | 'phase_started' | 'phase_completed' | 'plan_generated' | 'plan_accepted' | 'plan_overridden';
export interface ExecutionEvent { id: string; timestamp: string; type: ExecutionEventType; entityId?: string; plannedDuration?: number; actualDuration?: number; attentionBefore?: number; attentionAfter?: number; energyBefore?: number; energyAfter?: number; result?: string; note?: string }
export interface PlannedTask { id: string; sourceTaskId?: string; goalId: string; title: string; nextAction: string; date: string; estimatedMinutes: number; importance: Importance; deadline?: string; locked?: boolean; cost?: number; reason: string }
export interface PlanningResult { generatedAt: string; horizon: { start: string; end: string }; activeGoals: { goalId: string; recommendedStatus: Extract<GoalStatus, 'focus' | 'secondary' | 'maintenance' | 'waiting' | 'blocked'>; reason: string }[]; taskSequence: PlannedTask[]; deferredGoals: { goalId: string; reason: string; reconsiderAt?: string }[]; warnings: string[]; assumptions: string[]; confidence: number }
export interface PlanVersion { id: string; version: number; scope: ReplanScope; status: 'proposed' | 'accepted' | 'rejected' | 'overridden'; result: PlanningResult; createdAt: string; changeReason: string }
export interface PlannerContext { nodes: LifeNode[]; dependencies: GoalDependency[]; resource: ResourceSnapshot; recentEvents: ExecutionEvent[]; lockedTasks: PlannedTask[] }
export interface PlannerProvider { generatePlan(context: PlannerContext): Promise<PlanningResult> }
