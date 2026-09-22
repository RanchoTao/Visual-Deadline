import { FormEvent, useEffect, useState } from 'react';
import { validateTaskDraft } from '../domain/tasks/operations';
import type { ActivityType, Goal, LifecycleStatus, Task, TaskInput } from '../types/task';
import { toDatetimeLocalValue } from '../utils/date';
import { clampImportance, clampProgress, getActivityTypeLabel } from '../utils/taskScoring';

interface TaskFormProps { task?: Task; tasks: Task[]; goals: Goal[]; onCancel: () => void; onSubmit: (task: TaskInput) => void; }
const activityTypes: ActivityType[] = ['task', 'schedule', 'study', 'research', 'fitness', 'exercise', 'work', 'life', 'social', 'recovery', 'entertainment', 'other'];
const defaultValues: TaskInput = { title: '', description: undefined, importance: 5, deadline: undefined, progress: 0, progressMode: 'manual', activityType: 'task', lifecycleStatus: 'active', estimatedDuration: undefined, linkedGoalIds: [], dependencyIds: [], nextAction: undefined };
function toOptionalDatetimeLocalValue(value?: string): string | undefined { if (!value) return undefined; const date = new Date(value); return Number.isNaN(date.getTime()) ? undefined : toDatetimeLocalValue(date); }
function selected(values: string[] | undefined, id: string) { return values?.includes(id) ?? false; }
function toggle(values: string[] | undefined, id: string) { return selected(values, id) ? (values ?? []).filter((value) => value !== id) : [...(values ?? []), id]; }

export function TaskForm({ task, tasks, goals, onCancel, onSubmit }: TaskFormProps) {
  const [values, setValues] = useState<TaskInput>(task ? { ...task, deadline: toOptionalDatetimeLocalValue(task.deadline), completedAt: toOptionalDatetimeLocalValue(task.completedAt) } : defaultValues);
  const [error, setError] = useState<string>();
  useEffect(() => { setValues(task ? { ...task, deadline: toOptionalDatetimeLocalValue(task.deadline), completedAt: toOptionalDatetimeLocalValue(task.completedAt) } : defaultValues); setError(undefined); }, [task]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateTaskDraft(values, tasks, goals, task?.id);
    if (validation.errors.length) { setError(validation.errors[0]); return; }
    onSubmit({ ...values, title: values.title.trim(), description: values.description?.trim() || undefined, deadline: values.deadline || undefined, estimatedDuration: values.estimatedDuration === undefined || values.estimatedDuration === null ? undefined : Math.round(values.estimatedDuration), nextAction: values.nextAction?.trim() || undefined, dependencyIds: validation.dependencyIds, linkedGoalIds: validation.linkedGoalIds, completedAt: values.lifecycleStatus === 'completed' ? values.completedAt || new Date().toISOString() : undefined, importance: clampImportance(values.importance), progress: clampProgress(values.progress) });
  }

  return <form onSubmit={handleSubmit} className="space-y-4 rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
    <div><label className="text-sm font-medium text-slate-600" htmlFor="title">任务标题</label><input id="title" required value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 outline-none" placeholder="例如：完成研究方案" /></div>
    <div><label className="text-sm font-medium text-slate-600" htmlFor="description">描述（可选）</label><textarea id="description" value={values.description ?? ''} onChange={(event) => setValues({ ...values, description: event.target.value })} className="mt-2 min-h-20 w-full rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 outline-none" /></div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <label className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">重要性 {values.importance}/10<input aria-label="重要性" type="range" min="1" max="10" value={values.importance} onChange={(event) => setValues({ ...values, importance: clampImportance(Number(event.target.value)) })} className="mt-2 w-full" /></label>
      <label className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">截止时间（可选）<input id="deadline" type="datetime-local" value={values.deadline ?? ''} onChange={(event) => setValues({ ...values, deadline: event.target.value || undefined })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" /></label>
      <label className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">进度 {values.progress}%<input aria-label="进度" type="range" min="0" max="100" value={values.progress} onChange={(event) => setValues({ ...values, progress: clampProgress(Number(event.target.value)), progressMode: 'manual' })} className="mt-2 w-full" /></label>
      <label className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">进度模式<select value={values.progressMode ?? 'manual'} onChange={(event) => setValues({ ...values, progressMode: event.target.value as 'manual' | 'auto' })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"><option value="manual">手动进度</option><option value="auto" disabled={!values.deadline}>按截止时间估算</option></select><span className="mt-1 block text-xs text-slate-400">无截止时间时只能使用手动进度。</span></label>
      <label className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">分类<select value={values.activityType} onChange={(event) => setValues({ ...values, activityType: event.target.value as ActivityType })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2">{activityTypes.map((type) => <option key={type} value={type}>{getActivityTypeLabel(type)}</option>)}</select></label>
      <label className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">预计时长（分钟）<input aria-label="预计时长（分钟）" type="number" min="1" value={values.estimatedDuration ?? ''} onChange={(event) => setValues({ ...values, estimatedDuration: event.target.value ? Number(event.target.value) : undefined })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" /></label>
      <label className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 md:col-span-2">下一步行动（可选）<input aria-label="下一步行动" value={values.nextAction ?? ''} onChange={(event) => setValues({ ...values, nextAction: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" placeholder="例如：整理三条要点" /></label>
    </div>
    <fieldset className="rounded-2xl border border-slate-200 p-3"><legend className="px-1 text-sm font-medium text-slate-600">关联目标（可留空）</legend>{goals.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{goals.map((goal) => <label key={goal.id} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={selected(values.linkedGoalIds, goal.id)} onChange={() => setValues({ ...values, linkedGoalIds: toggle(values.linkedGoalIds, goal.id) })} />{goal.title}</label>)}</div> : <p className="text-sm text-slate-400">暂无目标；任务可保持独立。</p>}</fieldset>
    <fieldset className="rounded-2xl border border-slate-200 p-3"><legend className="px-1 text-sm font-medium text-slate-600">前置任务 / Blocked by</legend>{tasks.filter((candidate) => candidate.id !== task?.id).length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{tasks.filter((candidate) => candidate.id !== task?.id).map((candidate) => <label key={candidate.id} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={selected(values.dependencyIds, candidate.id)} onChange={() => setValues({ ...values, dependencyIds: toggle(values.dependencyIds, candidate.id) })} />{candidate.title}</label>)}</div> : <p className="text-sm text-slate-400">暂无可选前置任务。</p>}</fieldset>
    {task ? <label className="block text-sm font-medium text-slate-600">状态<select value={values.lifecycleStatus} onChange={(event) => setValues({ ...values, lifecycleStatus: event.target.value as LifecycleStatus })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"><option value="active">进行中</option><option value="completed">已完成</option><option value="abandoned">已放弃</option></select></label> : null}
    {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
    <div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={onCancel} className="rounded-full px-5 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100">取消</button><button type="submit" className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">保存任务</button></div>
  </form>;
}
