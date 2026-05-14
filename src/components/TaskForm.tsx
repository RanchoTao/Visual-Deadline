import { FormEvent, useEffect, useState } from 'react';
import type { ActivityType, LifecycleStatus, Task, TaskInput } from '../types/task';
import { toDatetimeLocalValue } from '../utils/date';
import { clampImportance, clampProgress, getActivityTypeLabel } from '../utils/taskScoring';

interface TaskFormProps {
  task?: Task;
  onCancel: () => void;
  onSubmit: (task: TaskInput) => void;
}

const activityTypes: ActivityType[] = ['task', 'schedule', 'study', 'research', 'fitness', 'exercise', 'work', 'life', 'social', 'recovery', 'entertainment', 'other'];

const defaultValues: TaskInput = {
  title: '',
  description: '',
  importance: 6,
  deadline: toDatetimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  progress: 0,
  progressMode: 'auto',
  activityType: 'task',
  lifecycleStatus: 'active',
};

export function TaskForm({ task, onCancel, onSubmit }: TaskFormProps) {
  const [values, setValues] = useState<TaskInput>(task ?? defaultValues);

  useEffect(() => {
    setValues(task ?? defaultValues);
  }, [task]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lifecycleStatus: LifecycleStatus = values.progress >= 100 ? 'completed' : values.lifecycleStatus;

    onSubmit({
      ...values,
      lifecycleStatus,
      title: values.title.trim(),
      description: values.description?.trim() || undefined,
      deadline: values.deadline || undefined,
      importance: clampImportance(values.importance),
      progress: clampProgress(values.progress),
      progressMode: values.progressMode,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div>
        <label className="text-sm font-medium text-slate-600" htmlFor="title">任务标题</label>
        <input id="title" required value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 outline-none transition focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70" placeholder="例如：完成项目方案" />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_1.1fr_1.1fr_1fr]">
        <div className="rounded-3xl bg-slate-50/70 p-3 ring-1 ring-white/80">
          <div className="flex items-center justify-between gap-3"><label className="text-sm font-medium text-slate-600" htmlFor="importance">你有多在意这件事？</label><span className="text-lg font-semibold text-slate-900">{values.importance}</span></div>
          <input id="importance" type="range" min="1" max="10" value={values.importance} onChange={(event) => setValues({ ...values, importance: clampImportance(Number(event.target.value)) })} className="mt-3 w-full accent-slate-800" />
          <div className="mt-2 flex justify-between text-xs text-slate-400"><span>无所谓</span><span>非常重要</span></div>
        </div>

        <div className="rounded-3xl bg-slate-50/70 p-3 ring-1 ring-white/80">
          <label className="text-sm font-medium text-slate-600" htmlFor="deadline">截止时间</label>
          <input id="deadline" type="datetime-local" value={values.deadline ?? ''} onChange={(event) => setValues({ ...values, deadline: event.target.value })} className="mt-3 w-full rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm outline-none" />
        </div>

        <div className="rounded-3xl bg-slate-50/70 p-3 ring-1 ring-white/80">
          <div className="flex items-center justify-between gap-3"><label className="text-sm font-medium text-slate-600" htmlFor="progress">当前进度</label><span className="text-lg font-semibold text-slate-900">{values.progress}%</span></div>
          <input id="progress" type="range" min="0" max="100" value={values.progress} onChange={(event) => setValues({ ...values, progress: clampProgress(Number(event.target.value)), progressMode: 'manual' })} className="mt-3 w-full accent-slate-800" />
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-slate-800 transition-all" style={{ width: `${values.progress}%` }} /></div>
        </div>

        <div className="rounded-3xl bg-slate-50/70 p-3 ring-1 ring-white/80">
          <label className="text-sm font-medium text-slate-600" htmlFor="activityType">活动类型</label>
          <select id="activityType" value={values.activityType} onChange={(event) => setValues({ ...values, activityType: event.target.value as ActivityType })} className="mt-3 w-full rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm outline-none">
            {activityTypes.map((activityType) => <option key={activityType} value={activityType}>{getActivityTypeLabel(activityType)}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600" htmlFor="description">描述（可选）</label>
        <textarea id="description" value={values.description ?? ''} onChange={(event) => setValues({ ...values, description: event.target.value })} className="mt-2 min-h-20 w-full rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 outline-none transition focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70" placeholder="只写必要信息，别给大脑增加负担。" />
      </div>

      {task ? (
        <div>
          <label className="text-sm font-medium text-slate-600" htmlFor="lifecycleStatus">状态</label>
          <select id="lifecycleStatus" value={values.lifecycleStatus} onChange={(event) => setValues({ ...values, lifecycleStatus: event.target.value as LifecycleStatus })} className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 outline-none transition focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70">
            <option value="active">进行中</option><option value="completed">已完成</option><option value="abandoned">已放弃</option>
          </select>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="rounded-full px-5 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100">取消</button>
        <button type="submit" className="rounded-full bg-white/85 px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">保存项目</button>
      </div>
    </form>
  );
}
