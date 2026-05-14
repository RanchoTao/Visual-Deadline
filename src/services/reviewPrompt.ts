import type { PressureHistoryRecord, Task } from '../types/task';
import { getDisplayProgress, getTaskProgress, getTimeProgress, isProgressAuto } from '../utils/taskScoring';

export const reviewSystemPrompt = `You are the review engine of Visual Deadline (VD).

Generate a concise Chinese structured review report from task and pressure data.

Rules:
- Be analytical, non-motivational, and practical.
- Do not invent facts not present in the data.
- Do not provide fake psychological diagnosis.
- Do not create a chat thread.
- Task displayProgress may be automatic time-based progress.
- auto progress means time elapsed toward deadline, not confirmed user completion.
- Use auto progress as deadline pressure / time consumption signal, not proof of actual completion.
- Return a report in Chinese Markdown with exactly these sections:
## 近期状态
## 已完成事项
## 压力来源
## 节奏问题
## 下阶段建议
## 可以减少或放弃的事项`;

function taskSummary(task: Task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    importance: task.importance,
    deadline: task.deadline,
    progress: task.progress,
    taskProgress: getTaskProgress(task),
    displayProgress: getDisplayProgress(task),
    progressMode: isProgressAuto(task) ? 'auto' : 'manual',
    timeProgress: getTimeProgress(task),
    estimatedDuration: task.estimatedDuration,
    decomposition: task.decomposition,
    stages: task.stages,
    milestoneSuggestions: task.milestoneSuggestions,
    activityType: task.activityType,
    lifecycleStatus: task.lifecycleStatus,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
    abandonedAt: task.abandonedAt,
    reviewNote: task.reviewNote,
  };
}

export function buildReviewUserPrompt(tasks: Task[], pressureHistory: PressureHistoryRecord[] = []): string {
  const sortedTasks = [...tasks].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const activeTasks = sortedTasks.filter((task) => task.lifecycleStatus === 'active').map(taskSummary);
  const completedTasks = sortedTasks.filter((task) => task.lifecycleStatus === 'completed').slice(0, 30).map(taskSummary);
  const abandonedTasks = sortedTasks.filter((task) => task.lifecycleStatus === 'abandoned').slice(0, 30).map(taskSummary);
  const recentPressureHistory = pressureHistory.slice(-30).map((record) => ({
    timestamp: record.timestamp,
    pressure: record.pressure,
    currentTaskLoad: record.currentTaskLoad,
    activeTaskCount: record.activeTaskCount,
    completedToday: record.completedToday,
    abandonedToday: record.abandonedToday,
    recoveryRelief: record.recoveryRelief,
    eventType: record.eventType,
    note: record.note,
  }));

  return JSON.stringify(
    {
      currentTime: new Date().toISOString(),
      activeTasks,
      completedTasks,
      abandonedTasks,
      pressureHistory: recentPressureHistory,
      instruction: 'Generate the requested Chinese structured report only. Do not include unrelated personal/profile data.',
    },
    null,
    2,
  );
}
