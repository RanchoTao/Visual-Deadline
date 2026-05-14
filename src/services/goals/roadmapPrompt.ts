import type { Goal, Task } from '../../types/task';

export const goalRoadmapSystemPrompt = `You are the long-term goal roadmap engine of Visual Deadline (VD).

Generate editable roadmap suggestions for one strategic goal.

Rules:
- Be analytical, structured, realistic, and calm.
- Do not roleplay as a chatbot or provide motivational slogans.
- Do not fully automate a plan or create tasks directly.
- Suggest structure only; never claim that tasks were created.
- Consider deadline collisions, cognitive overload, long-term suppression, recovery needs, and execution fragmentation.
- Return Simplified Chinese content in valid JSON only.

Return JSON shape:
{
  "stages": ["阶段建议，含阶段目标与顺序"],
  "milestones": ["关键里程碑，含可验证结果"],
  "weeklyMonthlyDirection": ["每周或每月推进方向"],
  "risks": ["风险与规避建议"],
  "firstActions": ["最先开始的具体行动"],
  "roadmapSuggestions": ["optional fallback string"],
  "notes": "string"
}`;

export function buildGoalRoadmapUserPrompt(goal: Goal, tasks: Task[]): string {
  return JSON.stringify(
    {
      currentTime: new Date().toISOString(),
      goal: {
        id: goal.id,
        title: goal.title,
        targetDate: goal.targetDate,
        category: goal.category,
        priority: goal.priority,
        linkedTaskIds: goal.linkedTaskIds,
        existingRoadmapSuggestions: goal.roadmapSuggestions ?? [],
      },
      linkedTasks: tasks
        .filter((task) => goal.linkedTaskIds.includes(task.id) || task.linkedGoalIds?.includes(goal.id))
        .map((task) => ({ id: task.id, title: task.title, deadline: task.deadline, importance: task.importance, lifecycleStatus: task.lifecycleStatus })),
      activeTaskTitles: tasks.filter((task) => task.lifecycleStatus === 'active').slice(0, 20).map((task) => task.title),
      instruction: '请生成长期目标路线图结构，必须覆盖阶段、里程碑、每周/月推进方向、风险、第一步行动。只提供建议，不创建任务。',
    },
    null,
    2,
  );
}

function stripJsonFences(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  return trimmed;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim());
}

function addSection(items: string[], title: string, values: string[]): void {
  values.slice(0, 6).forEach((value) => items.push(`${title}：${value}`));
}

export function parseGoalRoadmapResponse(content: string): { roadmapSuggestions: string[]; notes: string } {
  const rawJson = stripJsonFences(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('AI 返回内容不是有效 JSON，无法生成目标路线图。');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('AI 返回 JSON 结构无效。');
  const payload = parsed as { stages?: unknown; milestones?: unknown; weeklyMonthlyDirection?: unknown; risks?: unknown; firstActions?: unknown; roadmapSuggestions?: unknown; notes?: unknown };
  const roadmapSuggestions: string[] = [];
  addSection(roadmapSuggestions, '阶段', toStringList(payload.stages));
  addSection(roadmapSuggestions, '里程碑', toStringList(payload.milestones));
  addSection(roadmapSuggestions, '周/月方向', toStringList(payload.weeklyMonthlyDirection));
  addSection(roadmapSuggestions, '风险', toStringList(payload.risks));
  addSection(roadmapSuggestions, '第一步行动', toStringList(payload.firstActions));
  if (roadmapSuggestions.length === 0) roadmapSuggestions.push(...toStringList(payload.roadmapSuggestions).slice(0, 12));
  return {
    roadmapSuggestions: roadmapSuggestions.slice(0, 24),
    notes: typeof payload.notes === 'string' ? payload.notes : '',
  };
}
