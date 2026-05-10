import type { LifecycleStatus, Task } from '../types/task';
import { formatCountdown, formatDeadline } from '../utils/date';
import { getActivityTypeLabel } from '../utils/taskScoring';
import { ProgressBar } from './ProgressBar';

interface TaskListProps {
  tasks: Task[];
  onArchive: (task: Task, status: Exclude<LifecycleStatus, 'active'>) => void;
  onDelete: (taskId: string) => void;
  onEdit: (task: Task) => void;
}

export function TaskList({ tasks, onArchive, onDelete, onEdit }: TaskListProps) {
  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">活动列表</p>
          <h2 className="text-2xl font-semibold text-slate-950">进行中的项目</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">{tasks.length} 个</span>
      </div>

      {tasks.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-200 p-8 text-center text-slate-500">暂无进行中的项目。</div>
      ) : (
        <ul className="mt-5 space-y-3">
          {tasks.map((task) => (
            <li key={task.id} className="rounded-3xl border border-white/80 bg-slate-50/80 p-4 shadow-sm shadow-slate-100/70">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-950">{task.title}</h3>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500">{getActivityTypeLabel(task.activityType)}</span>
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
                  <button onClick={() => onArchive(task, 'completed')} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-emerald-600 shadow-sm hover:bg-emerald-50">
                    完成
                  </button>
                  <button onClick={() => onArchive(task, 'abandoned')} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm hover:bg-slate-100">
                    放弃
                  </button>
                  <button onClick={() => onEdit(task)} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-100">
                    编辑
                  </button>
                  <button onClick={() => onDelete(task.id)} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-rose-500 shadow-sm hover:bg-rose-50">
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
