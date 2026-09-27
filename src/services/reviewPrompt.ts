import type { PressureHistoryRecord, Task } from '../types/task';
import { getDisplayProgress, getTaskProgress, getTimeProgress, isProgressAuto } from '../utils/taskScoring';

export const reviewSystemPrompt = `你是 Visual Deadline（VD）的回顾引擎。

根据任务和压力数据生成简洁、结构化的简体中文回顾报告。

规则：
- 保持分析性、非激励式且务实。
- 不得编造数据中不存在的事实。
- 不得提供虚假的心理诊断。
- 不得创建聊天线程。
- 任务的 displayProgress 可能是自动计算的时间进度。
- 自动进度表示距离截止时间已过去的比例，不代表用户确认完成。
- 只能把自动进度作为截止压力或时间消耗信号，不能作为实际完成证据。
- 必须使用简体中文 Markdown，并且仅包含以下章节：
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
      instruction: '仅生成所要求的简体中文结构化报告。不要包含无关的个人资料数据。',
    },
    null,
    2,
  );
}
