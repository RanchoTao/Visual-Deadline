import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Goal, GoalInput, Task } from '../types/task';
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

export function GoalRoadmapPanel({ goals, tasks, onSaveGoal, onDeleteGoal }: GoalRoadmapPanelProps) {
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
    if (!settings.apiKey.trim()) {
      setRoadmapState({ errorGoalId: goal.id, message: '请先配置 AI API Key，再生成目标路线图。' });
      return;
    }
    setSelectedGoalId(goal.id);
    setRoadmapState({ loadingGoalId: goal.id });
    try {
      const content = await requestChatCompletion(settings, goalRoadmapSystemPrompt, buildGoalRoadmapUserPrompt(goal, tasks));
      const result = parseGoalRoadmapResponse(content);
      onSaveGoal({ ...createGoalInput(goal), roadmapSuggestions: result.roadmapSuggestions }, goal.id);
      setRoadmapState({});
    } catch (error) {
      setRoadmapState({ errorGoalId: goal.id, message: error instanceof Error ? error.message : '目标路线图生成失败。' });
    }
  }

  function clearRoadmap(goal: Goal) {
    onSaveGoal({ ...createGoalInput(goal), roadmapSuggestions: [] }, goal.id);
    setRoadmapState((current) => (current.errorGoalId === goal.id || current.loadingGoalId === goal.id ? {} : current));
  }

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">长期目标</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">长期目标 / 人生推进</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">记录非紧急但战略性的目标，并让 AI 生成可编辑的路线图建议，不自动创建任务。</p>
        </div>
        <span className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-white/80">{goals.length} 个目标</span>
      </div>

      <form onSubmit={submitGoal} className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.8fr_0.7fr_1fr_auto]">
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：2027 年完成论文投稿 / 语言考试 110 分" className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-3 text-sm outline-none focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70" />
        <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-3 text-sm outline-none" />
        <select value={category} onChange={(event) => setCategory(normalizeActivityType(event.target.value))} className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-3 text-sm outline-none">
          {categories.map((item) => <option key={item} value={item}>{getActivityTypeLabel(item)}</option>)}
        </select>
        <label className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-2 text-xs font-semibold text-slate-500">
          重要性：{priority}/10
          <input type="range" min="1" max="10" value={priority} onChange={(event) => setPriority(clampImportance(Number(event.target.value)))} className="mt-2 w-full accent-slate-500" />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="rounded-2xl bg-white/85 px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">{isEditing ? '保存目标' : '添加目标'}</button>
          {isEditing ? <button type="button" onClick={resetForm} className="rounded-2xl px-4 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-100">取消</button> : null}
        </div>
      </form>

      {goals.length ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-2">
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
      ) : <div className="mt-4 rounded-3xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">添加一个长期目标，开始把任务系统连接到人生推进。</div>}
    </section>
  );
}
