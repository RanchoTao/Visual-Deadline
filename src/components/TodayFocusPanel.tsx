import type { Task } from '../types/task';
import { formatCountdown } from '../utils/date';
import { getDisplayProgress, getTaskScore, getUrgencyScore, isProgressAuto } from '../utils/taskScoring';

interface TodayFocusPanelProps {
  tasks: Task[];
  onOpenTasks: () => void;
}

function isTodayFocusTask(task: Task): boolean {
  if (task.lifecycleStatus !== 'active') return false;
  return getUrgencyScore(task.deadline) >= 30 || task.importance >= 8;
}

export function TodayFocusPanel({ tasks, onOpenTasks }: TodayFocusPanelProps) {
  const focusTasks = [...tasks]
    .filter(isTodayFocusTask)
    .sort((left, right) => getTaskScore(right) - getTaskScore(left))
    .slice(0, 5);
  const overdueCount = tasks.filter((task) => task.lifecycleStatus === 'active' && task.deadline && new Date(task.deadline).getTime() < Date.now()).length;

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">今日推进界面</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">今日推进界面</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">自动收束逾期、临近截止和高压力事项，减少每日选择成本。</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
          <span className="rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-white/80">候选 {focusTasks.length}</span>
          <span className="rounded-full bg-rose-50 px-3 py-1.5 text-rose-600 ring-1 ring-rose-100">逾期 {overdueCount}</span>
        </div>
      </div>

      {focusTasks.length === 0 ? (
        <div className="mt-4 rounded-3xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-sm text-slate-400">今天没有明显高压事项，可以推进长期目标或恢复精力。</div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {focusTasks.map((task) => {
            const displayProgress = getDisplayProgress(task);
            return (
              <article key={task.id} className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-slate-950">{task.title}</h3>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">重要性 {task.importance}/10</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{formatCountdown(task.deadline)}</p>
                <p className="mt-3 text-xs text-slate-400">任务进度 {task.taskProgress ?? task.progress}% · 时间进度 {displayProgress}%{isProgressAuto(task) ? ' · 自动估算' : ''}</p>
              </article>
            );
          })}
        </div>
      )}

      <button type="button" onClick={onOpenTasks} className="mt-4 rounded-full bg-white/85 px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">进入任务系统 →</button>
    </section>
  );
}
