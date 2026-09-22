import type { Goal, Task } from '../../types/task.js';
import { requestChatCompletion, type AISettings } from '../../services/aiClient.js';
import { parseCaptureInterpretation } from './parser.js';
import type { CaptureInput, CaptureInterpretation } from './types.js';

export const captureInterpretSystemPrompt = `You turn a capture into editable planning drafts. Return valid JSON only with goals, tasks, commitments, context, ambiguities, notes. One capture may contain independent streams: never invent a root goal. Goals are outcomes; tasks are actionable; fixed external commitments are commitments; completed/background facts are context. Infer dates only from evidence and the supplied clock. Dependencies are genuine blockers only, never sequence. Avoid microtasks, motivational prose, and fabricated estimates. IDs must be stable draft IDs. Assets without semantic extraction are metadata only.`;
export function buildCaptureInterpretUserPrompt(capture: CaptureInput, tasks: Task[], goals: Goal[], now: Date, timezone: string): string {
  return JSON.stringify({ capture: { text: capture.text, links: capture.links, assets: capture.assets.map(({ id, kind, name, mimeType, size, durationSeconds, status }) => ({ id, kind, name, mimeType, size, durationSeconds, status })) }, activeTasks: tasks.slice(0, 40).map(({ id, title, deadline }) => ({ id, title, deadline })), activeGoals: goals.slice(0, 30).map(({ id, title }) => ({ id, title })), currentDateTime: now.toISOString(), timezone }, null, 2);
}
export async function interpretCapture(settings: AISettings, capture: CaptureInput, tasks: Task[], goals: Goal[], now: Date, timezone: string): Promise<{ interpretation: CaptureInterpretation; model?: string }> {
  const content = await requestChatCompletion(settings, captureInterpretSystemPrompt, buildCaptureInterpretUserPrompt(capture, tasks, goals, now, timezone), { mode: 'capture_interpret', context: { tasks: tasks.slice(0, 40), goals: goals.slice(0, 30) } });
  return { interpretation: parseCaptureInterpretation(content), model: settings.model };
}
