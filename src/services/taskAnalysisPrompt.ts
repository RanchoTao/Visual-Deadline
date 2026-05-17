import type { PressureBreakdown, Task } from '../types/task';
import { getDisplayProgress, getTaskProgress, getTimeProgress, isProgressAuto } from '../utils/taskScoring';

export interface TaskAnalysisPayload {
  currentTime: string;
  pressure?: PressureBreakdown;
  tasks: Array<Pick<Task, 'id' | 'title' | 'description' | 'importance' | 'deadline' | 'progress' | 'activityType' | 'lifecycleStatus' | 'createdAt' | 'updatedAt'> & { taskProgress: number; displayProgress: number; progressMode: 'manual' | 'auto'; timeProgress: number; estimatedDuration?: number; decomposition?: string[]; stages?: string[]; milestoneSuggestions?: string[] }>;
}

export const taskAnalysisSystemPrompt = `你是 Visual Deadline（VD）的认知分析引擎。VD 是以 AI 为核心的任务与人生结构管理系统。

VD 不是通用待办应用。
VD 会把任务建模为压力、价值、时间风险、执行负载与长期成长对齐度。

你的任务是分析用户当前的任务系统，并返回实用、结构化的洞察。

请分析：
- 高压力任务集群
- 低价值但紧急的忙碌事项
- 被短期紧急事项压制的长期重要任务
- 过载日程
- 重复目标
- 需要拆分的模糊或过大任务
- 只有在任务数据能支持时才指出回避模式
- 优先级调整
- 只有在可能过载时才提出恢复或休息需求

规则：
- 只使用提供的任务数据。
- 不要编造事实。
- 证据不足时要明确说明。
- 不做心理诊断。
- 不输出泛泛的激励话术。
- 保持简洁、结构化、分析性、现实且面向执行。
- 不要声称可以直接修改任务。
- 每个任务包含原始进度、任务进度、展示进度、进度模式与时间进度。
- 自动进度表示距离截止时间的已流逝比例，不代表用户确认完成度。
- 不要把自动展示进度当作实际完成证据；只能把它作为截止压力或时间消耗信号。

请用中文输出分析。

输出格式：

## 总体状态
一段简短总结。

## 关键发现
3-5 条要点。

## 优先行动
3-5 个具体行动。
每个行动需要包含：
- 任务或任务集群名称
- 建议动作：立即处理 / 拆分 / 推迟 / 放弃 / 合并 / 复盘
- 原因

## 压力风险
列出主要压力来源。

## 长期价值对齐
说明当前任务是否与长期成长一致。

## 建议调整
紧凑的 Markdown 表格：
| 任务 | 问题 | 建议 |`;

export function createTaskAnalysisPayload(tasks: Task[], pressure?: PressureBreakdown): TaskAnalysisPayload {
  return {
    currentTime: new Date().toISOString(),
    pressure,
    tasks: tasks.map((task) => ({
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
    })),
  };
}

export function buildTaskAnalysisUserPrompt(payload: TaskAnalysisPayload): string {
  return `请分析以下 VD 任务状态。

当前时间：
${payload.currentTime}

压力：
${payload.pressure ? JSON.stringify(payload.pressure, null, 2) : '未提供'}

任务：
${JSON.stringify(payload.tasks, null, 2)}

进度说明：
- progress 是旧版原始进度。
- taskProgress 是手动已知的实际执行进度。
- displayProgress 是 VD 界面展示的进度。
- progressMode 为 "auto" 时，displayProgress/timeProgress 表示距离截止时间的已流逝比例，不代表确认完成度。

请按要求输出结构化中文报告。

如果任务数据为空，请明确说明无法进行任务分析。`;
}
