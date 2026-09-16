import type { EntityId, EntityProvenance, EntityVersion, Importance, Timestamp, UserId } from './shared.js';

export type GoalStatus = 'draft' | 'active' | 'paused' | 'completed' | 'abandoned' | 'archived';
export type MilestoneStatus = 'planned' | 'ready' | 'in_progress' | 'completed' | 'skipped' | 'blocked' | 'archived';
export type TaskStatus = 'ready' | 'in_progress' | 'deferred' | 'done' | 'cancelled' | 'archived';

export interface LegacyGoalCompatibility {
  readonly sourceLinkedTaskIds: readonly string[];
  readonly sourcePlanningStatus?: string;
  readonly sourceCategory: string;
}

export interface LegacyTaskCompatibility {
  readonly sourceLifecycleStatus: 'active' | 'completed' | 'abandoned';
  readonly sourceLinkedGoalIds: readonly string[];
  readonly reconciledGoalIds: readonly string[];
  readonly sourceDependencyIds: readonly string[];
  readonly executionSource: string;
  readonly sourceCaptureId?: string;
  readonly sourceCreatedByAI: boolean;
  readonly sourceProjectId?: string;
  readonly sourceSchemaVersion: number;
}

export interface Goal {
  readonly id: EntityId;
  readonly userId: UserId;
  readonly parentGoalId?: EntityId;
  readonly title: string;
  readonly description?: string;
  readonly status: GoalStatus;
  readonly importance: Importance;
  readonly horizon?: string;
  readonly successCriteria?: string;
  readonly startAfter?: Timestamp;
  readonly targetDate?: Timestamp;
  readonly provenance: EntityProvenance;
  readonly compatibility?: LegacyGoalCompatibility;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly archivedAt?: Timestamp;
  readonly version: EntityVersion;
}

export interface Milestone {
  readonly id: EntityId;
  readonly userId: UserId;
  readonly goalId: EntityId;
  readonly title: string;
  readonly description?: string;
  readonly status: MilestoneStatus;
  readonly sequence: number;
  readonly targetDate?: Timestamp;
  readonly successCriteria?: string;
  readonly completionEvidence?: string;
  readonly provenance: EntityProvenance;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly completedAt?: Timestamp;
  readonly archivedAt?: Timestamp;
  readonly version: EntityVersion;
}

export interface Task {
  readonly id: EntityId;
  readonly userId: UserId;
  readonly title: string;
  readonly description?: string;
  readonly status: TaskStatus;
  readonly importance: Importance;
  readonly progress: number;
  readonly actionable: boolean;
  readonly goalId?: EntityId;
  readonly milestoneId?: EntityId;
  readonly parentTaskId?: EntityId;
  readonly deadline?: Timestamp;
  readonly startAfter?: Timestamp;
  readonly estimatedMinutes?: number;
  readonly completedMinutes?: number;
  readonly costMinor?: number;
  readonly nextAction?: string;
  readonly locked?: boolean;
  readonly provenance: EntityProvenance;
  readonly compatibility?: LegacyTaskCompatibility;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly completedAt?: Timestamp;
  readonly archivedAt?: Timestamp;
  readonly version: EntityVersion;
}

export interface TaskDependency {
  readonly id: EntityId;
  readonly userId: UserId;
  readonly predecessorTaskId: EntityId;
  readonly successorTaskId: EntityId;
  readonly type: 'blocks';
  readonly provenance: EntityProvenance;
  readonly createdAt: Timestamp;
  readonly version: EntityVersion;
}
