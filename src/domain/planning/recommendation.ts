import type { ExecutionTask, PlanningModel } from './model.js';

export type DeadlineRisk = 'none' | 'low' | 'medium' | 'high' | 'overdue';
export interface CurrentActionRecommendation {
  task: ExecutionTask;
  action: string;
  risk: DeadlineRisk;
  reason: string;
}

function timestamp(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function deadlineRisk(task: ExecutionTask, now = new Date()): DeadlineRisk {
  const due = timestamp(task.deadline?.at);
  if (due === undefined) return 'none';
  const days = (due - now.getTime()) / 86_400_000;
  if (days < 0) return 'overdue';
  if (days <= 2) return 'high';
  if (days <= 7) return 'medium';
  return 'low';
}

const riskWeight: Record<DeadlineRisk, number> = { none: 0, low: 1, medium: 3, high: 6, overdue: 8 };

/** Returns one executable action and never recommends a dependency-blocked task. */
export function recommendCurrentAction(model: PlanningModel, now = new Date()): CurrentActionRecommendation | undefined {
  const complete = new Set(model.tasks.filter((task) => task.status === 'completed').map((task) => task.id));
  const blocked = new Set(model.dependencies
    .filter((dependency) => !complete.has(dependency.prerequisiteTaskId))
    .map((dependency) => dependency.dependentTaskId));
  const candidates = model.tasks.filter((task) => task.status === 'active' && !blocked.has(task.id));
  candidates.sort((left, right) => {
    const score = (task: ExecutionTask) => riskWeight[deadlineRisk(task, now)] * 100 + task.importance * 10 + task.progress;
    return score(right) - score(left) || (timestamp(left.deadline?.at) ?? Infinity) - (timestamp(right.deadline?.at) ?? Infinity) || left.id.localeCompare(right.id);
  });
  const task = candidates[0];
  if (!task) return undefined;
  const risk = deadlineRisk(task, now);
  const reason = risk === 'overdue'
    ? 'This executable task is overdue and has the highest combined deadline and importance signal.'
    : risk === 'high'
      ? 'This executable task is due within two days and has the highest combined deadline and importance signal.'
      : 'This is the highest-ranked executable task after dependency checks.';
  return { task, action: task.nextAction, risk, reason };
}
