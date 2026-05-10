import { FormEvent, useEffect, useState } from 'react';
import type { Task, TaskInput } from '../types/task';
import { toDatetimeLocalValue } from '../utils/date';
import { clampProgress } from '../utils/taskScoring';

interface TaskFormProps {
  task?: Task;
  onCancel: () => void;
  onSubmit: (task: TaskInput) => void;
}

const defaultValues: TaskInput = {
  title: '',
  description: '',
  importance: 6,
  deadline: toDatetimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  progress: 0,
};

export function TaskForm({ task, onCancel, onSubmit }: TaskFormProps) {
  const [values, setValues] = useState<TaskInput>(task ?? defaultValues);

  useEffect(() => {
    setValues(task ?? defaultValues);
  }, [task]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      ...values,
      title: values.title.trim(),
      description: values.description?.trim() || undefined,
      deadline: values.deadline || undefined,
      progress: clampProgress(values.progress),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <label className="text-sm font-medium text-slate-700" htmlFor="title">
          任务标题
        </label>
        <input
          id="title"
          required
          value={values.title}
          onChange={(event) => setValues({ ...values, title: event.target.value })}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          placeholder="例如：完成项目方案"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700" htmlFor="description">
          描述（可选）
        </label>
        <textarea
          id="description"
          value={values.description ?? ''}
          onChange={(event) => setValues({ ...values, description: event.target.value })}
          className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          placeholder="只写必要信息，别给大脑增加负担"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="importance">
            重要性（1-10）
          </label>
          <input
            id="importance"
            type="number"
            min="1"
            max="10"
            value={values.importance}
            onChange={(event) => setValues({ ...values, importance: Number(event.target.value) as TaskInput['importance'] })}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="deadline">
            截止时间
          </label>
          <input
            id="deadline"
            type="datetime-local"
            value={values.deadline ?? ''}
            onChange={(event) => setValues({ ...values, deadline: event.target.value })}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="progress">
            当前进度（0-100）
          </label>
          <input
            id="progress"
            type="number"
            min="0"
            max="100"
            value={values.progress}
            onChange={(event) => setValues({ ...values, progress: clampProgress(Number(event.target.value)) })}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          />
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onCancel} className="rounded-full px-5 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100">
          取消
        </button>
        <button type="submit" className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-700">
          保存任务
        </button>
      </div>
    </form>
  );
}
