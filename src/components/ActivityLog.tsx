import type { Task } from '../types/task';
import { getActivityTypeLabel, getLifecycleStatusLabel } from '../utils/taskScoring';

interface ActivityLogProps {
  tasks: Task[];
  limit?: number;
  title?: string;
}

function formatLogTime(value?: string): string {
  if (!value) return '未记录时间';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function ActivityLog({ tasks, limit = 8, title = '最近归档' }: ActivityLogProps) {
  const archivedTasks = tasks
    .filter((task) => task.lifecycleStatus === 'completed' || task.lifecycleStatus === 'abandoned')
    .sort((a, b) => new Date(b.completedAt ?? b.abandonedAt ?? b.updatedAt).getTime() - new Date(a.completedAt ?? a.abandonedAt ?? a.updatedAt).getTime());
  const logTasks = Number.isFinite(limit) ? archivedTasks.slice(0, limit) : archivedTasks;

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">生命日志 / Activity Log</p>
          <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-500">{archivedTasks.length} 条</span>
      </div>

      {logTasks.length === 0 ? (
        <p className="mt-5 rounded-3xl bg-slate-50/80 p-5 text-sm text-slate-400">完成或放弃的项目会安静地留在这里，成为之后复盘的材料。</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {logTasks.map((task) => {
            const time = task.lifecycleStatus === 'completed' ? task.completedAt : task.abandonedAt;
            return (
              <li key={task.id} className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-medium text-slate-900">{task.title}</h3>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500">{getLifecycleStatusLabel(task.lifecycleStatus)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-white px-2.5 py-1">{getActivityTypeLabel(task.activityType)}</span>
                  <span className="rounded-full bg-white px-2.5 py-1">{formatLogTime(time)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
