import type { Goal, Task } from '../../types/task.js';
import type { CaptureInterpretation, CaptureMaterializationPlan } from './types.js';
import { validateCaptureReview } from './review.js';

export function buildCaptureMaterializationPlan(interpretation: CaptureInterpretation, existingTasks: Task[], existingGoals: Goal[], _now = new Date()): CaptureMaterializationPlan {
  const errors = validateCaptureReview(interpretation); if (errors.length) throw new Error(errors.join(' '));
  const goalTitles = new Set(existingGoals.map((goal) => goal.title.trim().toLocaleLowerCase()));
  const taskTitles = new Set(existingTasks.map((task) => task.title.trim().toLocaleLowerCase()));
  const duplicateWarnings: string[] = [];
  const goals = interpretation.goals.filter((draft) => draft.included).map((draft) => { if (goalTitles.has(draft.title.toLocaleLowerCase())) duplicateWarnings.push(`已存在相似目标：${draft.title}`); return { draftId: draft.id, input: { title: draft.title, targetDate: draft.targetDate, category: draft.category, priority: draft.priority, linkedTaskIds: [] } }; });
  const includedGoals = new Set(goals.map((goal) => goal.draftId));
  const includedTasks = interpretation.tasks.filter((draft) => draft.included);
  const includedTaskIds = new Set(includedTasks.map((task) => task.id));
  const tasks = includedTasks.map((draft) => { if (taskTitles.has(draft.title.toLocaleLowerCase())) duplicateWarnings.push(`已存在相似任务：${draft.title}`); return { draftId: draft.id, input: { title: draft.title, description: draft.description, importance: draft.importance, deadline: draft.deadline, dependencyIds: [], progress: 0, estimatedDuration: draft.estimatedDuration, linkedGoalIds: draft.goalDraftId && includedGoals.has(draft.goalDraftId) ? [draft.goalDraftId] : [], activityType: draft.category, lifecycleStatus: 'active' as const }, dependencyDraftIds: draft.dependencyDraftIds.filter((id) => includedTaskIds.has(id)) }; });
  return { goals, tasks, skippedCommitments: interpretation.commitments.filter((commitment) => commitment.included), duplicateWarnings };
}
