import { useMemo, useState, type FormEvent } from 'react';
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
}

const categories = ['study', 'research', 'fitness', 'work', 'life', 'social', 'other'] as const;

export function GoalRoadmapPanel({ goals, tasks, onSaveGoal }: GoalRoadmapPanelProps) {
  const [storedSettings] = useLocalStorage<AISettings>(storageKeys.aiSettings, defaultAISettings);
  const settings = useMemo(() => normalizeAISettings(storedSettings), [storedSettings]);
  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [category, setCategory] = useState<GoalInput['category']>('research');
  const [priority, setPriority] = useState<GoalInput['priority']>(7);
  const [selectedGoalId, setSelectedGoalId] = useState<string | undefined>(goals[0]?.id);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const selectedGoal = goals.find((goal) => goal.id === selectedGoalId) ?? goals[0];

  function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onSaveGoal({ title: trimmedTitle, targetDate: targetDate || undefined, category, priority, linkedTaskIds: [] });
    setTitle('');
    setTargetDate('');
    setPriority(7);
  }

  async function generateRoadmap() {
    if (!selectedGoal) return;
    if (!settings.apiKey.trim()) {
      setState('error');
      setErrorMessage('请先配置 AI API Key，再生成目标路线图。');
      return;
    }
    setState('loading');
    setErrorMessage('');
    try {
      const content = await requestChatCompletion(settings, goalRoadmapSystemPrompt, buildGoalRoadmapUserPrompt(selectedGoal, tasks));
      const result = parseGoalRoadmapResponse(content);
      onSaveGoal({ ...selectedGoal, roadmapSuggestions: result.roadmapSuggestions }, selectedGoal.id);
      setState('idle');
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : '目标路线图生成失败。');
    }
  }

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">长期目标</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">长期目标 / 人生推进</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">记录非紧急但战略性的目标，并让 AI 只生成可编辑的结构建议，不自动创建计划。</p>
        </div>
        <span className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-white/80">{goals.length} 个目标</span>
      </div>

      <form onSubmit={submitGoal} className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.8fr_0.7fr_0.6fr_auto]">
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：ICML 2027 Paper / TOEFL 110" className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-3 text-sm outline-none focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70" />
        <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-3 text-sm outline-none" />
        <select value={category} onChange={(event) => setCategory(normalizeActivityType(event.target.value))} className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-3 text-sm outline-none">
          {categories.map((item) => <option key={item} value={item}>{getActivityTypeLabel(item)}</option>)}
        </select>
        <input type="number" min="1" max="10" value={priority} onChange={(event) => setPriority(clampImportance(Number(event.target.value)))} className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-3 text-sm outline-none" />
        <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700">添加目标</button>
      </form>

      {goals.length ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-2">
            {goals.map((goal) => (
              <button key={goal.id} type="button" onClick={() => setSelectedGoalId(goal.id)} className={`w-full rounded-2xl px-4 py-3 text-left ring-1 ring-white/80 ${selectedGoal?.id === goal.id ? 'bg-slate-950 text-white' : 'bg-slate-50/80 text-slate-700 hover:bg-white'}`}>
                <span className="block font-semibold">{goal.title}</span>
                <span className="mt-1 block text-xs opacity-70">{getActivityTypeLabel(goal.category)} · 重要性 {goal.priority}/10{goal.targetDate ? ` · ${goal.targetDate}` : ''}</span>
              </button>
            ))}
          </div>
          <div className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">{selectedGoal?.title ?? '选择一个目标'}</h3>
                <p className="mt-1 text-xs text-slate-500">AI 路线图只作为结构建议，确认前不会写入任务。</p>
              </div>
              <button type="button" onClick={generateRoadmap} disabled={!selectedGoal || state === 'loading'} className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">{state === 'loading' ? '生成中…' : '生成路线图'}</button>
            </div>
            {state === 'error' ? <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 ring-1 ring-rose-100">{errorMessage}</p> : null}
            {selectedGoal?.roadmapSuggestions?.length ? (
              <ol className="mt-4 space-y-2 text-sm text-slate-600">
                {selectedGoal.roadmapSuggestions.map((item, index) => <li key={`${item}-${index}`} className="rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-white/80">{index + 1}. {item}</li>)}
              </ol>
            ) : <p className="mt-4 rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-400">尚未生成路线图。</p>}
          </div>
        </div>
      ) : <div className="mt-4 rounded-3xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">添加一个长期目标，开始把任务系统连接到 人生推进。</div>}
    </section>
  );
}
