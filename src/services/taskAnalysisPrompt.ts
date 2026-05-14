import type { PressureBreakdown, Task } from '../types/task';
import { getDisplayProgress, getTaskProgress, getTimeProgress, isProgressAuto } from '../utils/taskScoring';

export interface TaskAnalysisPayload {
  currentTime: string;
  pressure?: PressureBreakdown;
  tasks: Array<Pick<Task, 'id' | 'title' | 'description' | 'importance' | 'deadline' | 'progress' | 'activityType' | 'lifecycleStatus' | 'createdAt' | 'updatedAt'> & { taskProgress: number; displayProgress: number; progressMode: 'manual' | 'auto'; timeProgress: number; estimatedDuration?: number; decomposition?: string[]; stages?: string[]; milestoneSuggestions?: string[] }>;
}

export const taskAnalysisSystemPrompt = `You are the cognitive analysis engine of Visual Deadline (VD), an AI-native task and life-structure management system.

VD is not a generic todo app.
VD models tasks as pressure, value, time risk, execution load, and long-term growth alignment.

Your job is to analyze the user's current task system and return practical, structured insights.

Analyze:
- high-pressure task clusters
- low-value urgent busywork
- long-term important tasks suppressed by short-term urgency
- overloaded schedules
- duplicated objectives
- vague or oversized tasks that need decomposition
- possible avoidance patterns only when visible from task data
- prioritization adjustments
- recovery/rest needs only when overload is likely

Rules:
- Use only the provided task data.
- Do not invent facts.
- If evidence is weak, say so.
- Do not diagnose psychology.
- Do not give generic motivational advice.
- Be concise, structured, analytical, realistic, and execution-oriented.
- Do not modify tasks directly.
- Each task includes raw progress, taskProgress, displayProgress, progressMode, and timeProgress.
- auto progress means time elapsed toward deadline, not confirmed user completion.
- Do not treat automatic displayProgress as proof that work was actually completed; use it as a deadline pressure / time consumption signal.

Return the analysis in Chinese.

Output format:

## 总体状态
One short paragraph.

## 关键发现
3-5 bullet points.

## 优先行动
3-5 concrete actions.
Each action should include:
- task or cluster name
- recommended action: 立即处理 / 拆分 / 推迟 / 放弃 / 合并 / 复盘
- reason

## 压力风险
List major pressure sources.

## 长期价值对齐
Explain whether current tasks align with long-term growth.

## 建议调整
A compact markdown table:
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
  return `Analyze the following VD task state.

Current time:
${payload.currentTime}

Pressure:
${payload.pressure ? JSON.stringify(payload.pressure, null, 2) : 'Not provided'}

Tasks:
${JSON.stringify(payload.tasks, null, 2)}

Progress note:
- progress is legacy raw progress.
- taskProgress is actual execution progress when manually known.
- displayProgress is what VD shows in the UI.
- progressMode "auto" means displayProgress/timeProgress is elapsed time toward the deadline, not confirmed completion.

Return the structured Chinese report using the required format.

If task data is empty, say clearly that no task analysis can be performed.`;
}
