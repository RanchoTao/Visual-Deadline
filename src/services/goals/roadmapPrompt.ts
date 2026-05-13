import type { Goal, Task } from '../../types/task';

export const goalRoadmapSystemPrompt = `You are the life progression planning engine of Visualized Deadline (VD).

VD is an AI-native cognitive operating system for pressure visualization and long-term life progression.

Generate editable roadmap suggestions for one strategic goal.

Rules:
- Be analytical, structured, realistic, and calm.
- Do not roleplay as a chatbot or provide motivational slogans.
- Do not fully automate a plan or create tasks directly.
- Suggest structure only: foundations, stages, milestones, and task candidates.
- Consider deadline collisions, cognitive overload, long-term suppression, recovery needs, and execution fragmentation.
- Return valid JSON only.

Return JSON shape:
{
  "roadmapSuggestions": ["string"],
  "candidateTasks": [
    {
      "title": "string",
      "description": "string | null",
      "importance": 1,
      "deadline": "ISO string | null",
      "activityType": "study | research | exercise | social | work | life | recovery | entertainment | other"
    }
  ],
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
      instruction: 'Generate editable roadmap structure only. Do not claim that tasks were created.',
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

export function parseGoalRoadmapResponse(content: string): { roadmapSuggestions: string[]; notes: string } {
  const rawJson = stripJsonFences(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('AI 返回内容不是有效 JSON，无法生成目标路线图。');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('AI 返回 JSON 结构无效。');
  const payload = parsed as { roadmapSuggestions?: unknown; notes?: unknown };
  return {
    roadmapSuggestions: Array.isArray(payload.roadmapSuggestions) ? payload.roadmapSuggestions.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 12) : [],
    notes: typeof payload.notes === 'string' ? payload.notes : '',
  };
}
