import type { Goal, GoalStatus, Milestone, MilestoneStatus, Task, TaskDependency, TaskStatus } from './entities.js';
import type { EntityId, UserId } from './shared.js';

export interface VersionedWriteOptions {
  readonly expectedVersion?: number;
}

export interface GoalQuery {
  readonly userId: UserId;
  readonly statuses?: readonly GoalStatus[];
}

export interface MilestoneQuery {
  readonly userId: UserId;
  readonly goalId?: EntityId;
  readonly statuses?: readonly MilestoneStatus[];
}

export interface TaskQuery {
  readonly userId: UserId;
  readonly goalId?: EntityId;
  readonly milestoneId?: EntityId;
  readonly parentTaskId?: EntityId;
  readonly statuses?: readonly TaskStatus[];
  readonly actionable?: boolean;
}

export interface GoalRepository {
  getById(userId: UserId, id: EntityId): Promise<Goal | null>;
  list(query: GoalQuery): Promise<readonly Goal[]>;
  save(goal: Goal, options?: VersionedWriteOptions): Promise<Goal>;
  archive(userId: UserId, id: EntityId, options?: VersionedWriteOptions): Promise<Goal>;
}

export interface MilestoneRepository {
  getById(userId: UserId, id: EntityId): Promise<Milestone | null>;
  list(query: MilestoneQuery): Promise<readonly Milestone[]>;
  save(milestone: Milestone, options?: VersionedWriteOptions): Promise<Milestone>;
  archive(userId: UserId, id: EntityId, options?: VersionedWriteOptions): Promise<Milestone>;
}

export interface TaskRepository {
  getById(userId: UserId, id: EntityId): Promise<Task | null>;
  list(query: TaskQuery): Promise<readonly Task[]>;
  save(task: Task, options?: VersionedWriteOptions): Promise<Task>;
  archive(userId: UserId, id: EntityId, options?: VersionedWriteOptions): Promise<Task>;
}

export interface TaskDependencyRepository {
  getById(userId: UserId, id: EntityId): Promise<TaskDependency | null>;
  listForTask(userId: UserId, taskId: EntityId): Promise<readonly TaskDependency[]>;
  save(dependency: TaskDependency, options?: VersionedWriteOptions): Promise<TaskDependency>;
  remove(userId: UserId, id: EntityId, options?: VersionedWriteOptions): Promise<void>;
}
