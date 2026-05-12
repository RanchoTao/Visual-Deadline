import type { Task } from '../types/task';
import { formatCountdown } from '../utils/date';
import { getTaskScore, getUrgencyScore } from '../utils/taskScoring';

interface MiniTaskMatrixProps {
  tasks: Task[];
  onOpenTasks: () => void;
}

const MAX_VISIBLE_TASKS = 12;

function isDeadlinePressureTask(task: Task): boolean {
  return getUrgencyScore(task.deadline) >= 30;
}

function taskTone(task: Task): string {
  if (task.importance >= 8) return 'border-rose-100 bg-rose-50 text-rose-700';
  return 'border-amber-100 bg-amber-50 text-amber-700';
}

function DeadlineTaskItem({ task }: { task: Task }) {
  return (
    <li className={`rounded-2xl border px-3 py-2 ${taskTone(task)}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold">{task.title}</p>
        <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold">{task.importance}/10</span>
      </div>
      <p className="mt-1 text-xs opacity-80">{formatCountdown(task.deadline)}</p>
    </li>
  );
}

export function MiniTaskMatrix({ tasks, onOpenTasks }: MiniTaskMatrixProps) {
  const urgentTasks = [...tasks]
    .filter(isDeadlinePressureTask)
    .sort((a, b) => getTaskScore(b) - getTaskScore(a));
  const visibleTasks = urgentTasks.slice(0, MAX_VISIBLE_TASKS);
  const importantUrgentTasks = visibleTasks.filter((task) => task.importance >= 8);
  const normalUrgentTasks = visibleTasks.filter((task) => task.importance < 8);
  const hiddenCount = Math.max(0, urgentTasks.length - visibleTasks.length);

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-xl shadow-slate-200/60 backdrop-blur md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">当前任务热区</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">当前截止压力区</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">只显示接近截止线的任务，长期任务留到任务页完整规划。</p>
        </div>
        <button type="button" onClick={onOpenTasks} className="rounded-full bg-white/85 px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
          进入任务页
        </button>
      </div>

      {visibleTasks.length === 0 ? (
        <div className="mt-4 rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm font-medium text-slate-400">
          当前没有明显截止压力，适合推进长期任务或恢复精力。
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <section className="rounded-[1.5rem] bg-rose-50/45 p-3 ring-1 ring-rose-100/70">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-rose-700">紧急且重要</h3>
              <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-rose-500">{importantUrgentTasks.length} 项</span>
            </div>
            {importantUrgentTasks.length === 0 ? <p className="mt-3 text-xs text-rose-300">暂无高重要性截止压力。</p> : <ul className="mt-3 space-y-2">{importantUrgentTasks.map((task) => <DeadlineTaskItem key={task.id} task={task} />)}</ul>}
          </section>

          <section className="rounded-[1.5rem] bg-amber-50/45 p-3 ring-1 ring-amber-100/70">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-amber-700">紧急但不重要</h3>
              <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-amber-500">{normalUrgentTasks.length} 项</span>
            </div>
            {normalUrgentTasks.length === 0 ? <p className="mt-3 text-xs text-amber-300">暂无低重要性截止压力。</p> : <ul className="mt-3 space-y-2">{normalUrgentTasks.map((task) => <DeadlineTaskItem key={task.id} task={task} />)}</ul>}
          </section>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{hiddenCount > 0 ? `还有 ${hiddenCount} 项截止压力任务，请到任务页查看完整列表。` : '首页只保留截止压力提醒；完整矩阵与操作在任务页。'}</span>
        <button type="button" onClick={onOpenTasks} className="font-semibold text-slate-700 hover:text-slate-950">查看完整任务系统 →</button>
      </div>
    </section>
  );
}
