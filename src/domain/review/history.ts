import type { AIArtifact, Goal, PressureHistoryRecord, Task } from '../../types/task.js';
import type { ReviewHistoryEvent, ReviewState } from './types.js';
import { isInsideReviewWindow } from './window.js';

export function reviewEventIdentity(event: ReviewHistoryEvent): string {
  if ((event.kind === 'task_completed' || event.kind === 'task_abandoned') && event.relatedTaskId) return `${event.kind}:${event.relatedTaskId}`;
  if (event.kind === 'milestone_completed' && event.relatedGoalId) { const legacyMilestoneId = event.id.startsWith('milestone:') ? event.id.split(':')[2] : undefined; return `${event.kind}:${event.relatedGoalId}:${event.relatedMilestoneId ?? legacyMilestoneId ?? event.id}`; }
  if ((event.kind === 'review_saved' || event.kind === 'ai_review_generated') && event.reviewId) return `${event.kind}:${event.reviewId}`;
  return event.id;
}

export function captureReviewHistoryEvents(input: { tasks: readonly Task[]; goals: readonly Goal[]; pressureHistory: readonly PressureHistoryRecord[]; aiArtifacts?: readonly AIArtifact[]; recordedAt: string }): ReviewHistoryEvent[] {
  const events: ReviewHistoryEvent[] = [];
  input.tasks.forEach((task) => {
    const facts = { recordedAt: input.recordedAt, entityTitle: task.title, description: task.reviewNote, relatedTaskId: task.id, deadline: task.deadline, importance: task.importance, activityType: task.activityType };
    if (task.completedAt) events.push({ ...facts, id: `task-completed:${task.id}`, timestamp: task.completedAt, kind: 'task_completed', title: `任务完成：${task.title}` });
    if (task.abandonedAt) events.push({ ...facts, id: `task-abandoned:${task.id}`, timestamp: task.abandonedAt, kind: 'task_abandoned', title: `任务放弃：${task.title}` });
  });
  input.goals.forEach((goal) => (goal.milestones ?? []).forEach((milestone) => { if (milestone.status === 'completed' && milestone.completedAt) events.push({ id: `milestone:${goal.id}:${milestone.id}`, timestamp: milestone.completedAt, recordedAt: input.recordedAt, kind: 'milestone_completed', title: `里程碑完成：${milestone.title}`, entityTitle: milestone.title, relatedGoalId: goal.id, relatedMilestoneId: milestone.id }); }));
  input.pressureHistory.forEach((record) => events.push({ id: `pressure:${record.id}`, timestamp: record.timestamp, recordedAt: input.recordedAt, kind: record.eventType === 'recalibration' ? 'pressure_recalibrated' : 'pressure_sample', title: record.eventType === 'recalibration' ? '压力重新校准' : '压力快照', description: record.note, pressure: record.pressure, activeTaskCount: record.activeTaskCount, pressureSource: record.source ?? 'unknown' }));
  (input.aiArtifacts ?? []).filter((artifact) => ['review', 'task-analysis', 'pressure-analysis'].includes(artifact.kind)).forEach((artifact) => events.push({ id: `legacy-ai:${artifact.id}`, timestamp: artifact.createdAt, recordedAt: input.recordedAt, kind: 'legacy_ai', title: `历史 AI 记录：${artifact.title}`, entityTitle: artifact.title, description: artifact.content }));
  return events;
}

export function synchronizeReviewHistory(state: ReviewState, input: { tasks: readonly Task[]; goals: readonly Goal[]; pressureHistory: readonly PressureHistoryRecord[]; aiArtifacts?: readonly AIArtifact[]; now: string }): ReviewState {
  const existing = new Set(state.events.map(reviewEventIdentity));
  const additions = captureReviewHistoryEvents({ ...input, recordedAt: input.now }).filter((event) => !existing.has(reviewEventIdentity(event)));
  return additions.length ? { ...state, events: [...state.events, ...additions], updatedAt: input.now } : state;
}

export function buildReviewHistoryEvents(input: { events: readonly ReviewHistoryEvent[]; window: { start: string; end: string } }): ReviewHistoryEvent[] {
  const events = input.events.filter((event) => isInsideReviewWindow(event.timestamp, input.window));
  return events.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp) || left.id.localeCompare(right.id));
}
