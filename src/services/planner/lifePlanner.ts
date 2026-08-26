import type { GoalDependency, LifeNode, PlannedTask, PlannerContext, PlanningResult, ResourceSnapshot } from '../../types/lifePlanning';
import type { AISettings } from '../aiClient';
import { requestChatCompletion } from '../aiClient';

export const LIFE_PLANNER_SYSTEM_PROMPT = `You are the planning engine of VisualDeadline. Minimize decision burden, not maximize active goals. Keep 2–4 focus goals, explicitly defer the rest, never schedule blocked dependencies, respect locked tasks and fixed commitments, and preserve the urgent/important model. Use execution history to calibrate estimates. Return structured JSON only with reasons, assumptions, warnings and confidence. Never imply false precision.`;

function dateAt(offset: number) { const date = new Date(); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10); }
function unmetRequires(nodeId: string, nodes: LifeNode[], dependencies: GoalDependency[]) { return dependencies.some((edge) => edge.targetId === nodeId && edge.type === 'requires' && nodes.find((node) => node.id === edge.sourceId)?.status !== 'completed'); }
function postponementFactor(nodeId: string, context: PlannerContext) { const count = context.recentEvents.filter((event) => event.entityId === nodeId && event.type === 'task_postponed').length; return count >= 3 ? 1.5 : 1; }

export function createDeterministicProposal(context: PlannerContext): PlanningResult {
  const candidates = context.nodes.filter((node) => ['focus', 'secondary', 'maintenance'].includes(node.status) && node.layer !== 'direction' && !unmetRequires(node.id, context.nodes, context.dependencies));
  const focus = candidates.filter((node) => node.status === 'focus').sort((a, b) => b.importance - a.importance).slice(0, 4);
  const taskNodes = candidates.filter((node) => node.layer === 'task' && node.nextAction);
  const lockedIds = new Set(context.lockedTasks.map((task) => task.sourceTaskId || task.id));
  const sequence: PlannedTask[] = taskNodes.map((node, index) => ({ id: crypto.randomUUID(), sourceTaskId: node.id, goalId: node.parentId || node.id, title: node.title, nextAction: node.nextAction || node.title, date: dateAt(index % 7), estimatedMinutes: Math.round((node.resourceBudget?.minutesPerWeek || 60) * postponementFactor(node.id, context)), importance: node.importance, deadline: node.deadline, locked: node.locked || lockedIds.has(node.id), reason: node.status === 'focus' ? '当前 Focus，且下一步可直接执行。' : '以最低投入维持该方向，避免退步。' }));
  return { generatedAt: new Date().toISOString(), horizon: { start: dateAt(0), end: dateAt(6) }, activeGoals: focus.map((node) => ({ goalId: node.id, recommendedStatus: 'focus', reason: '重要度高，属于当前阶段且依赖已满足。' })), taskSequence: [...context.lockedTasks, ...sequence.filter((task) => !task.locked)].filter((task, index, all) => all.findIndex((item) => item.sourceTaskId === task.sourceTaskId) === index), deferredGoals: context.nodes.filter((node) => ['waiting', 'blocked', 'opportunity'].includes(node.status)).map((node) => ({ goalId: node.id, reason: node.status === 'blocked' ? '前置依赖尚未完成。' : '主动留在 Goal Space，不占用本周 Execution Window。' })), warnings: [], assumptions: ['可用时间由用户资源快照提供。', '未提供实际耗时时使用任务预算估计。'], confidence: context.recentEvents.length >= 3 ? 0.78 : 0.62 };
}

export function validatePlan(proposal: PlanningResult, context: PlannerContext): PlanningResult {
  const warnings = [...proposal.warnings]; const nodeById = new Map(context.nodes.map((node) => [node.id, node])); let minutes = 0; let money = 0;
  const taskSequence = proposal.taskSequence.filter((task) => {
    const node = task.sourceTaskId ? nodeById.get(task.sourceTaskId) : undefined;
    if (node?.status === 'completed') { warnings.push(`已移除已完成任务：${task.title}`); return false; }
    if (task.sourceTaskId && unmetRequires(task.sourceTaskId, context.nodes, context.dependencies)) { warnings.push(`依赖未满足，已延期：${task.title}`); return false; }
    if (minutes + task.estimatedMinutes > context.resource.availableMinutes && !task.locked) { warnings.push(`可用时间不足，已延期：${task.title}`); return false; }
    if (money + (task.cost || 0) > (context.resource.discretionaryBudget ?? Infinity) && !task.locked) { warnings.push(`预算不足，已延期：${task.title}`); return false; }
    minutes += task.estimatedMinutes; money += task.cost || 0; return true;
  });
  const activeGoals = proposal.activeGoals.filter((goal, index) => goal.recommendedStatus !== 'focus' || proposal.activeGoals.filter((item) => item.recommendedStatus === 'focus').indexOf(goal) < 4 || index < 4);
  if (proposal.activeGoals.filter((goal) => goal.recommendedStatus === 'focus').length > 4) warnings.push('Focus Goal 已限制为最多 4 个。');
  return { ...proposal, activeGoals, taskSequence, warnings };
}

export function planSevenDays(context: PlannerContext) { return validatePlan(createDeterministicProposal(context), context); }
export function defaultResource(): ResourceSnapshot { return { date: dateAt(0), availableMinutes: 180, attentionCapacity: 72, energyLevel: 68, discretionaryBudget: 200, source: 'manual' }; }

function parsePlanningResult(raw: string): PlanningResult {
  const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const value = JSON.parse(json) as Partial<PlanningResult>;
  if (!value.horizon || !Array.isArray(value.activeGoals) || !Array.isArray(value.taskSequence) || !Array.isArray(value.deferredGoals) || !Array.isArray(value.warnings) || !Array.isArray(value.assumptions) || typeof value.confidence !== 'number') throw new Error('Planner 返回不符合 PlanningResult Schema。');
  return { ...value, generatedAt: value.generatedAt || new Date().toISOString() } as PlanningResult;
}

export class ConfiguredPlannerProvider {
  constructor(private readonly settings: AISettings) {}
  async generatePlan(context: PlannerContext): Promise<PlanningResult> {
    const compactContext = { nodes: context.nodes.filter((node) => !['archived', 'completed'].includes(node.status)), dependencies: context.dependencies, resource: context.resource, recentEvents: context.recentEvents.slice(0, 30), lockedTasks: context.lockedTasks };
    const raw = await requestChatCompletion(this.settings, LIFE_PLANNER_SYSTEM_PROMPT, `Generate a 7-day PlanningResult JSON. Context:\n${JSON.stringify(compactContext)}`);
    return validatePlan(parsePlanningResult(raw), context);
  }
}
