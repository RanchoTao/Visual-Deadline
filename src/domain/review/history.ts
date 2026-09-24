import type { AIArtifact, Goal, GoalMilestone, PressureHistoryRecord, Task } from '../../types/task.js';
import type { ReviewHistoryEvent, ReviewState } from './types.js';
import { isInsideReviewWindow } from './window.js';

export function reviewBackfillIdentity(event: ReviewHistoryEvent): string {
  if ((event.kind === 'task_completed' || event.kind === 'task_abandoned') && event.relatedTaskId) return `${event.kind}:${event.relatedTaskId}`;
  if (event.kind === 'milestone_completed' && event.relatedGoalId) { const legacyMilestoneId = event.id.startsWith('milestone:') ? event.id.split(':')[2] : undefined; return `${event.kind}:${event.relatedGoalId}:${event.relatedMilestoneId ?? legacyMilestoneId ?? event.id}`; }
  return event.id;
}

export function reviewEventIdentity(event: ReviewHistoryEvent): string {
  return event.evidenceSource === 'captured_live' ? event.id : reviewBackfillIdentity(event);
}

export function captureReviewHistoryEvents(input: { tasks: readonly Task[]; goals: readonly Goal[]; pressureHistory: readonly PressureHistoryRecord[]; aiArtifacts?: readonly AIArtifact[]; recordedAt: string }): ReviewHistoryEvent[] {
  const events: ReviewHistoryEvent[] = [];
  input.tasks.forEach((task) => {
    const facts = { recordedAt: input.recordedAt, evidenceSource: 'legacy_backfill' as const, entityTitle: task.title, description: task.reviewNote, relatedTaskId: task.id, deadline: task.deadline, importance: task.importance, activityType: task.activityType };
    if (task.completedAt) events.push({ ...facts, id: `task-completed:${task.id}`, timestamp: task.completedAt, kind: 'task_completed', title: `任务完成：${task.title}` });
    if (task.abandonedAt) events.push({ ...facts, id: `task-abandoned:${task.id}`, timestamp: task.abandonedAt, kind: 'task_abandoned', title: `任务放弃：${task.title}` });
  });
  input.goals.forEach((goal) => (goal.milestones ?? []).forEach((milestone) => { if (milestone.status === 'completed' && milestone.completedAt) events.push({ id: `milestone:${goal.id}:${milestone.id}`, timestamp: milestone.completedAt, recordedAt: input.recordedAt, evidenceSource: 'legacy_backfill', kind: 'milestone_completed', title: `里程碑完成：${milestone.title}`, entityTitle: milestone.title, relatedGoalId: goal.id, relatedMilestoneId: milestone.id }); }));
  input.pressureHistory.forEach((record) => {
    const pressureSource = record.source === 'task_derived' ? 'task_derived' : record.source === 'manual' ? 'manual' : 'unknown';
    const evidenceSource = pressureSource === 'task_derived' ? 'derived' : pressureSource === 'manual' ? 'captured_live' : 'legacy_backfill';
    events.push({ id: `pressure:${record.id}`, timestamp: record.timestamp, recordedAt: input.recordedAt, evidenceSource, kind: record.eventType === 'recalibration' ? 'pressure_recalibrated' : 'pressure_sample', title: record.eventType === 'recalibration' ? '压力重新校准' : '压力快照', description: record.note, pressure: record.pressure, activeTaskCount: record.activeTaskCount, pressureSource });
  });
  (input.aiArtifacts ?? []).filter((artifact) => ['review', 'task-analysis', 'pressure-analysis'].includes(artifact.kind)).forEach((artifact) => events.push({ id: `legacy-ai:${artifact.id}`, timestamp: artifact.createdAt, recordedAt: input.recordedAt, evidenceSource: 'legacy_backfill', kind: 'legacy_ai', title: `历史 AI 记录：${artifact.title}`, entityTitle: artifact.title, description: artifact.content }));
  return events;
}

export function captureTaskLifecycleTransition(state: ReviewState, input: { previous?: Task; next: Task; recordedAt: string; eventId?: string }): ReviewState {
  if (input.previous?.lifecycleStatus === input.next.lifecycleStatus || input.next.lifecycleStatus === 'active') return state;
  const completed = input.next.lifecycleStatus === 'completed'; const timestamp = completed ? input.next.completedAt : input.next.abandonedAt;
  if (!timestamp) return state;
  const event: ReviewHistoryEvent = { id: input.eventId ?? `task-lifecycle:${crypto.randomUUID()}`, timestamp, recordedAt: input.recordedAt, evidenceSource: 'captured_live', kind: completed ? 'task_completed' : 'task_abandoned', title: `${completed ? '任务完成' : '任务放弃'}：${input.next.title}`, entityTitle: input.next.title, description: input.next.reviewNote, relatedTaskId: input.next.id, deadline: input.next.deadline, importance: input.next.importance, activityType: input.next.activityType };
  return { ...state, events: [...state.events, event], updatedAt: input.recordedAt };
}

export function captureMilestoneLifecycleTransition(state: ReviewState, input: { goalId: string; previous?: GoalMilestone; next: GoalMilestone; recordedAt: string; eventId?: string }): ReviewState {
  if (input.previous?.status === input.next.status || input.next.status !== 'completed' || !input.next.completedAt) return state;
  const event: ReviewHistoryEvent = { id: input.eventId ?? `milestone-lifecycle:${crypto.randomUUID()}`, timestamp: input.next.completedAt, recordedAt: input.recordedAt, evidenceSource: 'captured_live', kind: 'milestone_completed', title: `里程碑完成：${input.next.title}`, entityTitle: input.next.title, relatedGoalId: input.goalId, relatedMilestoneId: input.next.id };
  return { ...state, events: [...state.events, event], updatedAt: input.recordedAt };
}

export function synchronizeReviewHistory(state: ReviewState, input: { tasks: readonly Task[]; goals: readonly Goal[]; pressureHistory: readonly PressureHistoryRecord[]; aiArtifacts?: readonly AIArtifact[]; now: string }): ReviewState {
  const existing = new Set(state.events.map(reviewBackfillIdentity));
  const additions = captureReviewHistoryEvents({ ...input, recordedAt: input.now }).filter((event) => !existing.has(reviewBackfillIdentity(event)));
  return additions.length ? { ...state, events: [...state.events, ...additions], updatedAt: input.now } : state;
}

export function buildReviewHistoryEvents(input: { events: readonly ReviewHistoryEvent[]; window: { start: string; end: string } }): ReviewHistoryEvent[] {
  const events = input.events.filter((event) => isInsideReviewWindow(event.timestamp, input.window));
  return events.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp) || left.id.localeCompare(right.id));
}
