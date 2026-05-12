import type { Task } from '../types/task';
import { formatCountdown } from '../utils/date';
import { getImportancePosition, getTaskScore, getUrgencyPosition } from '../utils/taskScoring';

interface MiniTaskMatrixProps {
  tasks: Task[];
  onOpenTasks: () => void;
}

function pointTone(task: Task): string {
  const urgent = getUrgencyPosition(task.deadline) >= 66;
  if (task.importance >= 8 && urgent) return 'bg-rose-400 shadow-rose-100';
  if (task.importance >= 8) return 'bg-amber-400 shadow-amber-100';
  if (urgent) return 'bg-sky-400 shadow-sky-100';
  return 'bg-slate-400 shadow-slate-100';
}

export function MiniTaskMatrix({ tasks, onOpenTasks }: MiniTaskMatrixProps) {
  const visibleTasks = [...tasks]
    .sort((a, b) => getTaskScore(b) - getTaskScore(a))
    .slice(0, 6);

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-xl shadow-slate-200/60 backdrop-blur md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">当前任务热区</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">重要性 × 截止压力</h2>
        </div>
        <button type="button" onClick={onOpenTasks} className="rounded-full bg-white/85 px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
          进入任务页
        </button>
      </div>

      <button type="button" onClick={onOpenTasks} className="mt-4 block w-full text-left" aria-label="打开完整任务系统">
        <div className="relative h-56 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50/70 p-4 shadow-inner">
          <div className="pointer-events-none absolute inset-8 border border-slate-300/80 bg-[linear-gradient(90deg,rgba(148,163,184,0.10)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,0.10)_1px,transparent_1px)] bg-[size:25%_25%]" />
          <div className="pointer-events-none absolute left-8 right-8 top-1/2 border-t border-slate-300/90" />
          <div className="pointer-events-none absolute bottom-8 left-1/2 top-8 border-l border-slate-300/90" />
          <div className="pointer-events-none absolute right-10 top-9 rounded-full bg-rose-50/90 px-2.5 py-1 text-[11px] font-semibold text-rose-600">紧急且重要</div>
          <div className="pointer-events-none absolute left-10 top-9 rounded-full bg-sky-50/90 px-2.5 py-1 text-[11px] font-semibold text-sky-600">重要不紧急</div>
          <div className="pointer-events-none absolute bottom-9 right-10 rounded-full bg-amber-50/90 px-2.5 py-1 text-[11px] font-semibold text-amber-600">截止压力</div>
          <div className="pointer-events-none absolute bottom-9 left-10 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-400">低负荷</div>

          {visibleTasks.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-slate-400">添加任务后，这里会显示今日热区。</div>
          ) : null}

          {visibleTasks.map((task) => {
            const left = Math.min(88, Math.max(12, getUrgencyPosition(task.deadline)));
            const bottom = Math.min(86, Math.max(14, getImportancePosition(task.importance)));
            return (
              <div key={task.id} className="absolute -translate-x-1/2 translate-y-1/2" style={{ left: `${left}%`, bottom: `${bottom}%` }}>
                <span className={`block h-4 w-4 rounded-full border-2 border-white shadow-md ${pointTone(task)}`} />
                <span className={`absolute top-1/2 max-w-24 -translate-y-1/2 truncate rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm ring-1 ring-white/80 ${left > 68 ? 'right-5' : 'left-5'}`}>
                  {task.title}
                </span>
              </div>
            );
          })}
        </div>
      </button>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>只展示最相关的 {visibleTasks.length} 项；完整象限、详情与操作在任务页。</span>
        {visibleTasks[0] ? <span className="rounded-full bg-slate-50 px-2.5 py-1 ring-1 ring-white/80">最高优先：{visibleTasks[0].title} · {formatCountdown(visibleTasks[0].deadline)}</span> : null}
      </div>
    </section>
  );
}
