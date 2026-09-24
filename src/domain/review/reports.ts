import type { Task } from '../../types/task.js';
import type { OpsState } from '../ops/types.js';
import type { ReviewHistoryEvent, ReviewMetricsSnapshot, ReviewWindow } from './types.js';
import { isInsideReviewWindow } from './window.js';

const MAX_ITEMS = 50;
export const reviewAnalysisSystemPrompt = `你是 Visual Deadline 的复盘助手。用中文 Markdown 输出且严格分开事实与解释。不得编造事件、不得把相关性说成因果、不得进行心理健康诊断，也不得称用户懒惰、拖延或自律。数据稀少时必须说明。仅依据提供的任务、截止、压力样本与当前 OPS 摘要，给出具体的下一阶段调整，不要泛泛鼓励。使用章节：## 本期事实\n## 截止与执行偏差\n## 压力与节奏\n## 目标与结构\n## 下阶段调整\n## 数据局限。`;

export function buildReviewAnalysisInput(input: { window: ReviewWindow; metrics: ReviewMetricsSnapshot; tasks: readonly Task[]; events: readonly ReviewHistoryEvent[]; opsState: OpsState }) {
  const resolvedTasks = input.events.filter((event) => (event.kind === 'task_completed' || event.kind === 'task_abandoned') && isInsideReviewWindow(event.timestamp, input.window)).slice(0, MAX_ITEMS).map((event) => ({ id: event.relatedTaskId, title: event.entityTitle, importance: event.importance, deadline: event.deadline, completedAt: event.kind === 'task_completed' ? event.timestamp : undefined, abandonedAt: event.kind === 'task_abandoned' ? event.timestamp : undefined, activityType: event.activityType, reviewNote: event.description }));
  const currentActiveSummary = input.tasks.filter((task) => task.lifecycleStatus === 'active').slice(0, MAX_ITEMS).map((task) => ({ id: task.id, title: task.title, importance: task.importance, deadline: task.deadline, activityType: task.activityType }));
  const pressureSamples = input.events.filter((event) => (event.kind === 'pressure_sample' || event.kind === 'pressure_recalibrated') && isInsideReviewWindow(event.timestamp, input.window)).slice(-MAX_ITEMS).map((event) => ({ timestamp: event.timestamp, pressure: event.pressure, activeTaskCount: event.activeTaskCount, eventType: event.kind, source: event.pressureSource }));
  const accepted = input.opsState.plans.find((plan) => plan.id === input.opsState.acceptedPlanId && plan.status === 'accepted');
  return { window: input.window, metrics: input.metrics, resolvedTasks, currentActiveSummary, pressureSamples, currentOpsSummary: { scheduledCount: accepted?.allocations.length ?? 0, unscheduledCount: accepted?.unscheduled.length ?? 0, conflictCount: input.metrics.currentConflictCount } };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function reviewAnalysisInputIdentity(value: unknown): string { return canonicalJson(value); }

export async function fingerprintReviewAnalysisInput(value: unknown): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)));
  return `sha256-${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
