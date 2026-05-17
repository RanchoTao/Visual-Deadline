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

export function GoalRoadmapPanel({ goals, tasks, onSaveGoal, onDeleteGoal, onRoadmapGenerated }: GoalRoadmapPanelProps) {
  const [storedSettings] = useLocalStorage<AISettings>(storageKeys.aiSettings, defaultAISettings);
  const settings = useMemo(() => normalizeAISettings(storedSettings), [storedSettings]);
  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [category, setCategory] = useState<GoalInput['category']>('research');
  const [priority, setPriority] = useState<GoalInput['priority']>(7);
  const [editingGoalId, setEditingGoalId] = useState<string | undefined>();
  const [selectedGoalId, setSelectedGoalId] = useState<string | undefined>(goals[0]?.id);
  const [roadmapState, setRoadmapState] = useState<RoadmapState>({});
  const selectedGoal = goals.find((goal) => goal.id === selectedGoalId) ?? goals[0];
  const isEditing = Boolean(editingGoalId);

  useEffect(() => {
    if (goals.length === 0) {
      setSelectedGoalId(undefined);
      return;
    }
    if (!selectedGoalId || !goals.some((goal) => goal.id === selectedGoalId)) setSelectedGoalId(goals[0].id);
  }, [goals, selectedGoalId]);

  function resetForm() {
    setTitle('');
    setTargetDate('');
    setCategory('research');
    setPriority(7);
    setEditingGoalId(undefined);
  }

  function startEditing(goal: Goal) {
    setEditingGoalId(goal.id);
    setSelectedGoalId(goal.id);
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
    setSelectedGoalId(goal.id);
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
    <section className="rounded-[2.25rem] border border-white/70 bg-white/70 p-6 shadow-xl shadow-slate-200/50 backdrop-blur md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">长期目标</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">长期目标 / 人生推进</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">把长期方向安静地放进系统：少一点表格感，多一点未来生活规划。</p>
        </div>
        <span className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-white/80">{goals.length} 个目标</span>
      </div>

      <form onSubmit={submitGoal} className="mt-8 grid gap-4 rounded-[1.75rem] bg-slate-50/55 p-4 ring-1 ring-white/80 lg:grid-cols-[1.1fr_0.7fr_0.65fr_0.85fr_auto] md:p-5">
        <label className="space-y-2 text-xs font-semibold text-slate-400">
          未来方向
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="" className="w-full rounded-2xl border border-transparent bg-white/85 px-4 py-3.5 text-sm text-slate-800 outline-none transition focus:border-sky-100 focus:ring-4 focus:ring-sky-100/60" />
        </label>
        <label className="space-y-2 text-xs font-semibold text-slate-400">
          时间锚点
          <input type="text" inputMode="numeric" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} placeholder="" className="w-full rounded-2xl border border-transparent bg-white/85 px-4 py-3.5 text-sm text-slate-800 outline-none transition focus:border-sky-100 focus:ring-4 focus:ring-sky-100/60" />
        </label>
        <label className="space-y-2 text-xs font-semibold text-slate-400">
          领域
          <select value={category} onChange={(event) => setCategory(normalizeActivityType(event.target.value))} className="w-full rounded-2xl border border-transparent bg-white/85 px-4 py-3.5 text-sm text-slate-700 outline-none transition focus:border-sky-100 focus:ring-4 focus:ring-sky-100/60">
            {categories.map((item) => <option key={item} value={item}>{getActivityTypeLabel(item)}</option>)}
          </select>
        </label>
        <label className="space-y-2 rounded-2xl bg-white/75 px-4 py-3 text-xs font-semibold text-slate-400">
          重要性 · {priority}/10
          <input type="range" min="1" max="10" value={priority} onChange={(event) => setPriority(clampImportance(Number(event.target.value)))} className="w-full accent-slate-500" />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">{isEditing ? '保存' : '添加'}</button>
          {isEditing ? <button type="button" onClick={resetForm} className="rounded-2xl px-4 py-3.5 text-sm font-semibold text-slate-500 hover:bg-white/70">取消</button> : null}
        </div>
      </form>

      {goals.length ? (
        <div className="mt-7 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-3">
            {goals.map((goal) => {
              const isSelected = selectedGoal?.id === goal.id;
              const isLoading = roadmapState.loadingGoalId === goal.id;
              return (
                <article key={goal.id} className={`rounded-2xl border border-white/80 p-4 shadow-sm ring-1 ${isSelected ? 'bg-white/95 ring-slate-200' : 'bg-slate-50/80 ring-white/80'}`}>
                  <button type="button" onClick={() => setSelectedGoalId(goal.id)} className="block w-full text-left">
                    <span className="block font-semibold text-slate-950">{goal.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">{getActivityTypeLabel(goal.category)} · 重要性 {goal.priority}/10{goal.targetDate ? ` · ${goal.targetDate}` : ''}</span>
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => generateRoadmap(goal)} disabled={isLoading} className="rounded-full bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">{goal.roadmapSuggestions?.length ? '重新生成路线图' : isLoading ? '生成中…' : '生成路线图'}</button>
                    <button type="button" onClick={() => startEditing(goal)} className="rounded-full bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">编辑</button>
                    <button type="button" onClick={() => deleteGoal(goal)} className="rounded-full bg-white/85 px-3 py-1.5 text-xs font-semibold text-rose-500 shadow-sm ring-1 ring-rose-100 hover:bg-rose-50">删除</button>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">{selectedGoal?.title ?? '选择一个目标'}</h3>
                <p className="mt-1 text-xs text-slate-500">路线图包含阶段、里程碑、周/月方向、风险和第一步行动；不会自动创建任务。</p>
              </div>
              {selectedGoal ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => generateRoadmap(selectedGoal)} disabled={roadmapState.loadingGoalId === selectedGoal.id} className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">{selectedGoal.roadmapSuggestions?.length ? '重新生成路线图' : '生成路线图'}</button>
                  {selectedGoal.roadmapSuggestions?.length ? <button type="button" onClick={() => clearRoadmap(selectedGoal)} className="rounded-full px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">清空路线图</button> : null}
                </div>
              ) : null}
            </div>
            {selectedGoal && roadmapState.errorGoalId === selectedGoal.id && roadmapState.message ? <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 ring-1 ring-rose-100">{roadmapState.message}</p> : null}
            {selectedGoal && roadmapState.loadingGoalId === selectedGoal.id ? <p className="mt-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 ring-1 ring-sky-100">正在生成路线图建议……</p> : null}
            {selectedGoal?.roadmapSuggestions?.length ? (
              <ol className="mt-4 space-y-2 text-sm text-slate-600">
                {selectedGoal.roadmapSuggestions.map((item, index) => <li key={`${item}-${index}`} className="rounded-2xl bg-white/80 px-4 py-3 leading-6 ring-1 ring-white/80">{index + 1}. {item}</li>)}
              </ol>
            ) : <p className="mt-4 rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-400">尚未生成路线图。点击“生成路线图”后，只会保存结构建议，不会自动创建任务。</p>}
          </div>
        </div>
      ) : <div className="mt-7 rounded-3xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">添加一个长期目标，开始把任务系统连接到人生推进。</div>}
    </section>
  );
}
