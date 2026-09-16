import type { EntityId } from './shared.js';

export interface TaskReference {
  readonly taskId: EntityId;
}

export interface NowProjectionReferences {
  readonly currentTaskId?: EntityId;
  readonly topTaskIds: readonly EntityId[];
  readonly heatZoneTaskIds: readonly EntityId[];
}

export interface TaskMatrixProjectionReferences {
  readonly urgentImportantTaskIds: readonly EntityId[];
  readonly importantNotUrgentTaskIds: readonly EntityId[];
  readonly urgentNotImportantTaskIds: readonly EntityId[];
  readonly neitherTaskIds: readonly EntityId[];
}

export interface PlanProjectionReferences {
  readonly goalIds: readonly EntityId[];
  readonly milestoneIds: readonly EntityId[];
  readonly taskIds: readonly EntityId[];
  readonly planVersionId?: EntityId;
}

export interface OpsProjectionReferences {
  readonly taskIds: readonly EntityId[];
  readonly operationsPlanVersionId?: EntityId;
  readonly resourceBudgetIds: readonly EntityId[];
  readonly resourceAllocationIds: readonly EntityId[];
  readonly executionWindowIds: readonly EntityId[];
}

export interface ReviewProjectionReferences {
  readonly goalIds: readonly EntityId[];
  readonly milestoneIds: readonly EntityId[];
  readonly taskIds: readonly EntityId[];
  readonly executionEventIds: readonly EntityId[];
  readonly reviewId?: EntityId;
  readonly reportIds: readonly EntityId[];
}
