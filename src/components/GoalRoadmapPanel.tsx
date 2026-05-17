import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AIArtifactInput, Goal, GoalInput, Task } from '../types/task';
import { defaultAISettings, normalizeAISettings, requestChatCompletion, type AISettings } from '../services/aiClient';
import { buildGoalRoadmapUserPrompt, goalRoadmapSystemPrompt, parseGoalRoadmapResponse } from '../services/goals/roadmapPrompt';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { storageKeys } from '../storage';
import { clampImportance, getActivityTypeLabel, normalizeActivityType } from '../utils/taskScoring';

interface GoalRoadmapPanelProps {
  goals: Goal[];
  tasks: Task[];
  onSaveGoal: (input: GoalInput, goalId?: string) => void;
  onDeleteGoal: (goalId: string) => void;
  onRoadmapGenerated?: (artifact: AIArtifactInput) => void;
}

const categories = ['study', 'research', 'fitness', 'work', 'life', 'social', 'other'] as const;

const roadmapFacets = ['AI 路线图', '阶段拆解', '风险分析', '周期建议'] as const;

type RoadmapState = { loadingGoalId?: string; errorGoalId?: string; message?: string };

function createGoalInput(goal: Goal): GoalInput {
  return {
    title: goal.title,
    targetDate: goal.targetDate,
    category: goal.category,
    priority: goal.priority,
    linkedTaskIds: goal.linkedTaskIds,
    roadmapSuggestions: goal.roadmapSuggestions,
  };
}

function getPreviewItems(goal: Goal) {
  return goal.roadmapSuggestions?.slice(0, 2) ?? [];
}

export function GoalRoadmapPanel({ goals, tasks, onSaveGoal, onDeleteGoal, onRoadmapGenerated }: GoalRoadmapPanelProps) {
  const [storedSettings] = useLocalStorage<AISettings>(storageKeys.aiSettings, defaultAISettings);
  const settings = useMemo(() => normalizeAISettings(storedSettings), [storedSettings]);
  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [category, setCategory] = useState<GoalInput['category']>('research');
  const [priority, setPriority] = useState<GoalInput['priority']>(7);
  const [editingGoalId, setEditingGoalId] = useState<string | undefined>();
  const [expandedGoalId, setExpandedGoalId] = useState<string | undefined>();
  const [roadmapState, setRoadmapState] = useState<RoadmapState>({});
  const isEditing = Boolean(editingGoalId);

  useEffect(() => {
    if (expandedGoalId && !goals.some((goal) => goal.id === expandedGoalId)) setExpandedGoalId(undefined);
  }, [expandedGoalId, goals]);

  function resetForm() {
    setTitle('');
    setTargetDate('');
    setCategory('research');
    setPriority(7);
    setEditingGoalId(undefined);
  }

  function startEditing(goal: Goal) {
    setEditingGoalId(goal.id);
    setTitle(goal.title);
    setTargetDate(goal.targetDate ?? '');
    setCategory(goal.category);
    setPriority(goal.priority);
  }

  function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const existingGoal = goals.find((goal) => goal.id === editingGoalId);
    onSaveGoal(
      {
        title: trimmedTitle,
        targetDate: targetDate || undefined,
        category,
        priority,
        linkedTaskIds: existingGoal?.linkedTaskIds ?? [],
        roadmapSuggestions: existingGoal?.roadmapSuggestions,
      },
      editingGoalId,
    );
    resetForm();
  }

  function deleteGoal(goal: Goal) {
    const confirmed = window.confirm(`确定删除长期目标“${goal.title}”吗？已生成的路线图也会被删除，但不会删除任何任务。`);
    if (!confirmed) return;
    onDeleteGoal(goal.id);
    if (editingGoalId === goal.id) resetForm();
  }

  async function generateRoadmap(goal: Goal) {
    setExpandedGoalId(goal.id);
    setRoadmapState({ loadingGoalId: goal.id });
    try {
      const content = await requestChatCompletion(settings, goalRoadmapSystemPrompt, buildGoalRoadmapUserPrompt(goal, tasks), { mode: 'daily_plan', context: { goals: [goal], tasks } });
      const result = parseGoalRoadmapResponse(content);
      onSaveGoal({ ...createGoalInput(goal), roadmapSuggestions: result.roadmapSuggestions }, goal.id);
      onRoadmapGenerated?.({
        kind: 'goal-roadmap',
        title: `路线图：${goal.title}`,
        content: result.roadmapSuggestions.join('\n'),
        relatedTaskIds: tasks.filter((task) => goal.linkedTaskIds.includes(task.id) || task.linkedGoalIds?.includes(goal.id)).map((task) => task.id),
        relatedGoalIds: [goal.id],
        model: settings.model,
        metadata: { provider: settings.provider, goalTitle: goal.title, notes: result.notes },
      });
      setRoadmapState({});
    } catch (error) {
      setRoadmapState({ errorGoalId: goal.id, message: error instanceof Error ? error.message : '目标导航失败。' });
    }
  }

  function clearRoadmap(goal: Goal) {
    onSaveGoal({ ...createGoalInput(goal), roadmapSuggestions: [] }, goal.id);
    setRoadmapState((current) => (current.errorGoalId === goal.id || current.loadingGoalId === goal.id ? {} : current));
  }

  return (
    <section className="rounded-[2.25rem] border border-white/70 bg-white/70 p-5 shadow-xl shadow-slate-200/50 backdrop-blur md:p-7" aria-labelledby="long-term-goals-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-[0.18em] text-slate-400">人生系统</p>
          <h2 id="long-term-goals-heading" className="mt-1 text-2xl font-semibold text-slate-950">长期目标 / 人生推进</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">战略层只保留方向、阶段与风险；路线图默认收起，避免日常视图变重。</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
          <span className="rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-white/80">{goals.length} 个目标</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-100">路线图默认折叠</span>
        </div>
      </div>

      <form onSubmit={submitGoal} className="mt-6 grid gap-3 rounded-[1.5rem] bg-slate-50/70 p-3 ring-1 ring-white/80 md:grid-cols-[1.4fr_0.8fr_0.8fr_1fr_auto]">
        <label className="space-y-2 text-xs font-semibold text-slate-400">
          目标标题
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：完成研究方向转型" className="w-full rounded-2xl border border-transparent bg-white/85 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-100 focus:ring-4 focus:ring-sky-100/60" />
        </label>
        <label className="space-y-2 text-xs font-semibold text-slate-400">
          时间跨度
          <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className="w-full rounded-2xl border border-transparent bg-white/85 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-100 focus:ring-4 focus:ring-sky-100/60" />
        </label>
        <label className="space-y-2 text-xs font-semibold text-slate-400">
          领域
          <select value={category} onChange={(event) => setCategory(normalizeActivityType(event.target.value))} className="w-full rounded-2xl border border-transparent bg-white/85 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-100 focus:ring-4 focus:ring-sky-100/60">
            {categories.map((item) => <option key={item} value={item}>{getActivityTypeLabel(item)}</option>)}
          </select>
        </label>
        <label className="space-y-2 rounded-2xl bg-white/75 px-4 py-2.5 text-xs font-semibold text-slate-400">
          重要性 · {priority}/10
          <input type="range" min="1" max="10" value={priority} onChange={(event) => setPriority(clampImportance(Number(event.target.value)))} className="w-full accent-slate-500" />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">{isEditing ? '保存' : '创建目标'}</button>
          {isEditing ? <button type="button" onClick={resetForm} className="rounded-2xl px-4 py-3 text-sm font-semibold text-slate-500 hover:bg-white/70">取消</button> : null}
        </div>
      </form>

      {goals.length ? (
        <div className="mt-6 grid gap-3">
          {goals.map((goal) => {
            const isExpanded = expandedGoalId === goal.id;
            const isLoading = roadmapState.loadingGoalId === goal.id;
            const previewItems = getPreviewItems(goal);
            return (
              <article key={goal.id} className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4 shadow-sm ring-1 ring-white/80">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button type="button" onClick={() => setExpandedGoalId(isExpanded ? undefined : goal.id)} className="min-w-0 flex-1 text-left">
                    <span className="block text-base font-semibold text-slate-950">{goal.title}</span>
                    <span className="mt-1 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
                      <span>{getActivityTypeLabel(goal.category)}</span>
                      <span>重要性 {goal.priority}/10</span>
                      <span>{goal.targetDate ? `截至 ${goal.targetDate}` : '长期推进'}</span>
                    </span>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => generateRoadmap(goal)} disabled={isLoading} className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200">{goal.roadmapSuggestions?.length ? '重新生成' : isLoading ? '生成中…' : '生成路线图'}</button>
                    <button type="button" onClick={() => startEditing(goal)} className="rounded-full bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">编辑</button>
                    {goal.roadmapSuggestions?.length ? <button type="button" onClick={() => clearRoadmap(goal)} className="rounded-full bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">清空路线图</button> : null}
                    <button type="button" onClick={() => deleteGoal(goal)} className="rounded-full bg-white/85 px-3 py-1.5 text-xs font-semibold text-rose-500 shadow-sm ring-1 ring-rose-100 hover:bg-rose-50">删除</button>
                    <button type="button" onClick={() => setExpandedGoalId(isExpanded ? undefined : goal.id)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">{isExpanded ? '收起' : '展开'}</button>
                  </div>
                </div>

                {roadmapState.errorGoalId === goal.id && roadmapState.message ? <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 ring-1 ring-rose-100">{roadmapState.message}</p> : null}
                {isLoading ? <p className="mt-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 ring-1 ring-sky-100">正在生成路线图建议……</p> : null}

                {!isExpanded && previewItems.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {previewItems.map((item, index) => <span key={`${item}-${index}`} className="max-w-full truncate rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-500 ring-1 ring-slate-100">{item}</span>)}
                  </div>
                ) : null}

                {isExpanded ? (
                  <div className="mt-4 rounded-[1.25rem] bg-slate-50/80 p-4 ring-1 ring-white/80">
                    <div className="grid gap-2 md:grid-cols-4">
                      {roadmapFacets.map((facet) => <div key={facet} className="rounded-2xl bg-white/80 px-3 py-2 text-xs font-semibold text-slate-500 ring-1 ring-white/80">{facet}</div>)}
                    </div>
                    {goal.roadmapSuggestions?.length ? (
                      <ol className="mt-4 space-y-2 text-sm text-slate-600">
                        {goal.roadmapSuggestions.map((item, index) => <li key={`${item}-${index}`} className="rounded-2xl bg-white/85 px-4 py-3 leading-6 ring-1 ring-white/80"><span className="mr-2 font-semibold text-slate-400">{index + 1}.</span>{item}</li>)}
                      </ol>
                    ) : <p className="mt-4 rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-400">尚未生成路线图。生成后将保存阶段拆解、风险与周期建议，但不会自动创建任务。</p>}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : <div className="mt-6 rounded-3xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">添加一个长期目标，开始把任务系统连接到人生推进。</div>}
    </section>
  );
}
