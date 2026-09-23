import type { PressureHistoryRecord, Task } from '../../types/task.js';
import type { OpsState } from '../ops/types.js';
import type { ReviewMetricsSnapshot } from './types.js';
import { isInsideReviewWindow } from './window.js';

const MAX_ITEMS = 50;
export const reviewAnalysisSystemPrompt = `你是 Visual Deadline 的复盘助手。用中文 Markdown 输出且严格分开事实与解释。不得编造事件、不得把相关性说成因果、不得进行心理健康诊断，也不得称用户懒惰、拖延或自律。数据稀少时必须说明。仅依据提供的任务、截止、压力样本与当前 OPS 摘要，给出具体的下一阶段调整，不要泛泛鼓励。使用章节：## 本期事实\n## 截止与执行偏差\n## 压力与节奏\n## 目标与结构\n## 下阶段调整\n## 数据局限。`;
export function buildReviewAnalysisInput(input: { window: { start: string; end: string; days: number }; metrics: ReviewMetricsSnapshot; tasks: readonly Task[]; pressureHistory: readonly PressureHistoryRecord[]; opsState: OpsState }) {
  const resolvedTasks = input.tasks.filter((task) => isInsideReviewWindow(task.completedAt, input.window) || isInsideReviewWindow(task.abandonedAt, input.window)).slice(0, MAX_ITEMS).map((task) => ({ id: task.id, title: task.title, importance: task.importance, deadline: task.deadline, completedAt: task.completedAt, abandonedAt: task.abandonedAt, activityType: task.activityType, reviewNote: task.reviewNote }));
  const currentActiveSummary = input.tasks.filter((task) => task.lifecycleStatus === 'active').slice(0, MAX_ITEMS).map((task) => ({ id: task.id, title: task.title, importance: task.importance, deadline: task.deadline, activityType: task.activityType }));
  const pressureSamples = input.pressureHistory.filter((sample) => isInsideReviewWindow(sample.timestamp, input.window)).slice(-MAX_ITEMS).map((sample) => ({ timestamp: sample.timestamp, pressure: sample.pressure, activeTaskCount: sample.activeTaskCount, eventType: sample.eventType }));
  const accepted = input.opsState.plans.find((plan) => plan.id === input.opsState.acceptedPlanId && plan.status === 'accepted');
  return { window: input.window, metrics: input.metrics, resolvedTasks, currentActiveSummary, pressureSamples, currentOpsSummary: { scheduledCount: accepted?.allocations.length ?? 0, unscheduledCount: accepted?.unscheduled.length ?? 0, conflictCount: input.metrics.currentConflictCount } };
}
