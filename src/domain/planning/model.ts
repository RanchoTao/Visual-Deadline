import type { Goal, Task } from '../../types/task.js';

/**
 * Canonical planning vocabulary. These records are deliberately independent of
 * persistence: localStorage and Supabase continue to store the existing Goal and
 * Task shapes until a separately reviewed data migration is available.
 */
export type PlanningStatus = 'pending' | 'active' | 'blocked' | 'completed' | 'cancelled';

export interface Deadline {
  at: string;
  kind: 'hard' | 'target';
}

export interface PlanningGoal {
  id: string;
  title: string;
  deadline?: Deadline;
  importance: number;
  status: PlanningStatus;
}

export interface Milestone {
  id: string;
  goalId: string;
  title: string;
  deadline?: Deadline;
  status: PlanningStatus;
  order: number;
}

export interface ExecutionTask {
  id: string;
  goalIds: string[];
  milestoneId?: string;
  title: string;
  nextAction: string;
  deadline?: Deadline;
  importance: number;
  progress: number;
  estimatedMinutes?: number;
  status: PlanningStatus;
}

export interface Dependency {
  id: string;
  prerequisiteTaskId: string;
  dependentTaskId: string;
}

export interface ExecutionPath {
  id: string;
  goalId: string;
  title: string;
  taskIds: string[];
  status: 'active' | 'paused' | 'completed' | 'abandoned';
}

export interface PlanningModel {
  goals: PlanningGoal[];
  milestones: Milestone[];
  tasks: ExecutionTask[];
  dependencies: Dependency[];
  paths: ExecutionPath[];
}

function taskStatus(task: Task): PlanningStatus {
  if (task.lifecycleStatus === 'completed') return 'completed';
  if (task.lifecycleStatus === 'abandoned') return 'cancelled';
  return 'active';
}

/** Projects existing user records without mutating or replacing stored data. */
export function projectLegacyPlanningModel(goals: Goal[], tasks: Task[]): PlanningModel {
  const canonicalGoals = goals.map((goal): PlanningGoal => ({
    id: goal.id,
    title: goal.title,
    deadline: goal.targetDate ? { at: goal.targetDate, kind: 'target' } : undefined,
    importance: goal.priority,
    status: goal.planningStatus === 'completed' ? 'completed' : goal.planningStatus === 'blocked' ? 'blocked' : goal.planningStatus === 'archived' ? 'cancelled' : 'active',
  }));
  const canonicalTasks = tasks.map((task): ExecutionTask => ({
    id: task.id,
    goalIds: task.linkedGoalIds ?? [],
    title: task.title,
    nextAction: task.nextAction?.trim() || task.title,
    deadline: task.deadline ? { at: task.deadline, kind: 'hard' } : undefined,
    importance: task.importance,
    progress: Math.max(0, Math.min(100, task.progress)),
    estimatedMinutes: task.estimatedDuration,
    status: taskStatus(task),
  }));
  const taskIds = new Set(canonicalTasks.map((task) => task.id));
  const dependencies = tasks.flatMap((task) => (task.dependencyIds ?? [])
    .filter((prerequisiteTaskId) => taskIds.has(prerequisiteTaskId) && prerequisiteTaskId !== task.id)
    .map((prerequisiteTaskId): Dependency => ({
      id: `${prerequisiteTaskId}->${task.id}`,
      prerequisiteTaskId,
      dependentTaskId: task.id,
    })));
  const paths = canonicalGoals.map((goal): ExecutionPath => ({
    id: `goal:${goal.id}:default`,
    goalId: goal.id,
    title: goal.title,
    taskIds: canonicalTasks.filter((task) => task.goalIds.includes(goal.id)).map((task) => task.id),
    status: goal.status === 'completed' ? 'completed' : goal.status === 'cancelled' ? 'abandoned' : 'active',
  }));
  return { goals: canonicalGoals, milestones: [], tasks: canonicalTasks, dependencies, paths };
}
