import { useState } from 'react';
import type { LifecycleStatus, Task } from '../types/task';
import { formatCountdown, formatDeadline } from '../utils/date';
import { getActivityTypeLabel, getDisplayProgress, getTaskProgress, getTimeProgress, isProgressAuto } from '../utils/taskScoring';
import { ProgressBar } from './ProgressBar';

interface TaskListProps {
  tasks: Task[];
  onArchive: (task: Task, status: Exclude<LifecycleStatus, 'active'>) => void;
  onDelete: (taskId: string) => void;
  onEdit: (task: Task) => void;
}

export function TaskList({ tasks, onArchive, onDelete, onEdit }: TaskListProps) {
  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | undefined>();

  function runAction(action: () => void) {
    action();
    setOpenMenuTaskId(undefined);
  }

  return (
    <section className={`relative overflow-visible rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur ${openMenuTaskId ? 'z-40' : 'z-10'}`}>
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
        <ul className="mt-5 grid overflow-visible gap-3 lg:grid-cols-2">
          {tasks.map((task) => {
            const isMenuOpen = openMenuTaskId === task.id;
            const displayProgress = getDisplayProgress(task);
            const taskProgress = getTaskProgress(task);
            const timeProgress = getTimeProgress(task);
            const progressIsAuto = isProgressAuto(task);

            return (
              <li key={task.id} className={`relative overflow-visible rounded-3xl border border-white/80 bg-slate-50/80 p-4 shadow-sm shadow-slate-100/70 ${isMenuOpen ? 'z-50' : 'z-0'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-950">{task.title}</h3>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500">{getActivityTypeLabel(task.activityType)}</span>
                    </div>
                    {task.description ? <p className="mt-2 line-clamp-2 text-sm text-slate-600">{task.description}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-white px-2.5 py-1">重要性 {task.importance}/10</span>
                      <span className="rounded-full bg-white px-2.5 py-1">{formatCountdown(task.deadline)}</span>
                      <span className="rounded-full bg-white px-2.5 py-1">截止 {formatDeadline(task.deadline)}</span>
                    </div>
                    <div className="mt-3 max-w-sm">
                      <ProgressBar progress={displayProgress} compact />
                      <p className="mt-1 text-xs text-slate-400">Task Progress {taskProgress}% · Time Progress {timeProgress}%{progressIsAuto ? ' · 自动估算' : ''}</p>
                    </div>
                  </div>

                  <div className="relative z-50 shrink-0 overflow-visible">
                    <button
                      type="button"
                      onClick={() => setOpenMenuTaskId(isMenuOpen ? undefined : task.id)}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl font-semibold leading-none text-slate-500 shadow-sm hover:bg-slate-100"
                      aria-label={`打开 ${task.title} 的操作菜单`}
                      aria-expanded={isMenuOpen}
                    >
                      ⋯
                    </button>
                    {isMenuOpen ? (
                      <div className="absolute right-0 top-12 z-[120] w-32 rounded-2xl border border-white/80 bg-white/95 p-1.5 shadow-2xl shadow-slate-300/70 backdrop-blur">
                        <button type="button" onClick={() => runAction(() => onArchive(task, 'completed'))} className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-emerald-600 hover:bg-emerald-50">
                          完成
                        </button>
                        <button type="button" onClick={() => runAction(() => onArchive(task, 'abandoned'))} className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-50">
                          放弃
                        </button>
                        <button type="button" onClick={() => runAction(() => onEdit(task))} className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-50">
                          编辑
                        </button>
                        <button type="button" onClick={() => runAction(() => onDelete(task.id))} className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-500 hover:bg-rose-50">
                          删除
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
