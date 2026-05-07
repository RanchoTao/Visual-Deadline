import { FormEvent, useEffect, useState } from 'react';
import type { Task, TaskInput, TaskStatus } from '../types/task';
import { toDatetimeLocalValue } from '../utils/date';

interface TaskFormProps {
  task?: Task;
  onCancel: () => void;
  onSubmit: (task: TaskInput) => void;
}

const defaultValues: TaskInput = {
  title: '',
  description: '',
  importance: 3,
  deadline: toDatetimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  estimatedMinutes: undefined,
  status: 'todo',
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
      estimatedMinutes: values.estimatedMinutes || undefined,
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
            重要性
          </label>
          <select
            id="importance"
            value={values.importance}
            onChange={(event) => setValues({ ...values, importance: Number(event.target.value) as TaskInput['importance'] })}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          >
            {[1, 2, 3, 4, 5].map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
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
          <label className="text-sm font-medium text-slate-700" htmlFor="estimatedMinutes">
            预计耗时（分钟）
          </label>
          <input
            id="estimatedMinutes"
            type="number"
            min="1"
            value={values.estimatedMinutes ?? ''}
            onChange={(event) =>
              setValues({
                ...values,
                estimatedMinutes: event.target.value ? Number(event.target.value) : undefined,
              })
            }
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
            placeholder="30"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700" htmlFor="status">
          状态
        </label>
        <select
          id="status"
          value={values.status}
          onChange={(event) => setValues({ ...values, status: event.target.value as TaskStatus })}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
        >
          <option value="todo">todo</option>
          <option value="doing">doing</option>
          <option value="done">done</option>
        </select>
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
