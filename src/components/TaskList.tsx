import type { Task } from '../types/task';
import { formatCountdown, formatDeadline } from '../utils/date';
import { isTaskComplete } from '../utils/taskScoring';
import { ProgressBar } from './ProgressBar';

interface TaskListProps {
  tasks: Task[];
  onDelete: (taskId: string) => void;
  onEdit: (task: Task) => void;
}

export function TaskList({ tasks, onDelete, onEdit }: TaskListProps) {
  return (
    <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">任务列表</p>
          <h2 className="text-2xl font-bold text-slate-950">所有任务</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">{tasks.length} 个</span>
      </div>

      {tasks.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-200 p-8 text-center text-slate-500">暂无任务。</div>
      ) : (
        <ul className="mt-5 space-y-3">
          {tasks.map((task) => (
            <li key={task.id} className={`rounded-3xl border p-4 ${isTaskComplete(task) ? 'border-emerald-100 bg-emerald-50/60' : 'border-slate-100 bg-slate-50/80'}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-950">{task.title}</h3>
                    {isTaskComplete(task) ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">已完成</span> : null}
                  </div>
                  {task.description ? <p className="mt-2 text-sm text-slate-600">{task.description}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-white px-2.5 py-1">重要性 {task.importance}/10</span>
                    <span className="rounded-full bg-white px-2.5 py-1">{formatCountdown(task.deadline)}</span>
                    <span className="rounded-full bg-white px-2.5 py-1">截止 {formatDeadline(task.deadline)}</span>
                  </div>
                  <div className="mt-3 max-w-sm">
                    <ProgressBar progress={task.progress} compact />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={() => onEdit(task)} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-100">
                    编辑
                  </button>
                  <button onClick={() => onDelete(task.id)} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-rose-600 shadow-sm hover:bg-rose-50">
                    删除
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
