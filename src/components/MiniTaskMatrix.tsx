import { useEffect, useMemo, useState } from 'react';
import type { Task } from '../types/task';
import { formatCountdown } from '../utils/date';
import { getImportancePosition } from '../utils/taskScoring';

interface MiniTaskMatrixProps {
  tasks: Task[];
  onOpenTasks: () => void;
}

const MAX_VISIBLE_TASKS = 12;
const URGENT_THRESHOLD_MS = 72 * 60 * 60 * 1000;

function formatCurrentTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getDeadlineDiff(task: Task, now: Date): number | undefined {
  if (!task.deadline) return undefined;
  const deadlineTime = new Date(task.deadline).getTime();
  if (!Number.isFinite(deadlineTime)) return undefined;
  return deadlineTime - now.getTime();
}

function isUrgentTask(task: Task, now: Date): boolean {
  const diff = getDeadlineDiff(task, now);
  return diff !== undefined && diff <= URGENT_THRESHOLD_MS;
}

function getDeadlineTop(task: Task, now: Date): number {
  const diff = getDeadlineDiff(task, now);
  if (diff === undefined) return 16;
  if (diff <= 0) return 89;
  const progress = 1 - Math.min(URGENT_THRESHOLD_MS, diff) / URGENT_THRESHOLD_MS;
  return 28 + progress * 58;
}

function getDotTone(task: Task, now: Date): string {
  const diff = getDeadlineDiff(task, now);
  if (diff !== undefined && diff <= 0) return 'h-5 w-5 border-rose-100 bg-rose-600 shadow-rose-200 ring-4 ring-rose-100/80';
  if (task.importance >= 8) return 'h-4 w-4 border-white bg-rose-400 shadow-rose-100';
  return 'h-4 w-4 border-white bg-amber-400 shadow-amber-100';
}

export function MiniTaskMatrix({ tasks, onOpenTasks }: MiniTaskMatrixProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const urgentTasks = useMemo(() => {
    return [...tasks]
      .filter((task) => isUrgentTask(task, now))
      .sort((left, right) => {
        const leftDiff = getDeadlineDiff(left, now) ?? Number.POSITIVE_INFINITY;
        const rightDiff = getDeadlineDiff(right, now) ?? Number.POSITIVE_INFINITY;
        if (leftDiff !== rightDiff) return leftDiff - rightDiff;
        return right.importance - left.importance;
      });
  }, [now, tasks]);
  const visibleTasks = urgentTasks.slice(0, MAX_VISIBLE_TASKS);
  const hiddenCount = Math.max(0, urgentTasks.length - visibleTasks.length);

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-xl shadow-slate-200/60 backdrop-blur md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">当前任务热区</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">当前截止压力区</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">只显示 72 小时内或已逾期任务，完整矩阵保留在任务页。</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <div className="rounded-2xl bg-slate-50 px-4 py-2 text-right ring-1 ring-white/80">
            <p className="text-xs font-semibold tracking-[0.18em] text-slate-400">当前时间</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-700">{formatCurrentTime(now)}</p>
          </div>
          <button type="button" onClick={onOpenTasks} className="rounded-full bg-white/85 px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
            进入任务页
          </button>
        </div>
      </div>

      <button type="button" onClick={onOpenTasks} className="mt-4 block w-full text-left" aria-label="打开完整任务系统">
        <div className="relative h-72 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-gradient-to-b from-white via-amber-50/40 to-rose-50/80 p-4 shadow-inner">
          <div className="pointer-events-none absolute inset-x-8 bottom-12 top-12 border border-slate-300/80 bg-[linear-gradient(90deg,rgba(148,163,184,0.10)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,0.10)_1px,transparent_1px)] bg-[size:25%_25%]" />
          <div className="pointer-events-none absolute bottom-12 left-1/2 top-12 border-l border-slate-300/90" />
          <div className="pointer-events-none absolute bottom-12 left-8 right-8 border-t-2 border-rose-300/90" />
          <div className="pointer-events-none absolute left-10 top-12 rounded-full bg-amber-50/95 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">紧急但不重要</div>
          <div className="pointer-events-none absolute right-10 top-12 rounded-full bg-rose-50/95 px-2.5 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-100">紧急且重要</div>
          <div className="pointer-events-none absolute left-8 top-5 text-[11px] font-medium text-slate-400">较低重要性</div>
          <div className="pointer-events-none absolute right-8 top-5 text-[11px] font-medium text-slate-400">高重要性</div>
          <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 text-[11px] font-medium text-amber-500">接近截止线</div>
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-rose-100 px-3 py-1 text-[11px] font-semibold text-rose-700">截止死亡线</div>

          {visibleTasks.length === 0 ? (
            <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-[1.5rem] border border-dashed border-slate-200 bg-white/75 px-4 py-6 text-center text-sm font-medium text-slate-400 backdrop-blur">
              当前没有明显截止压力，适合推进长期任务或恢复精力。
            </div>
          ) : null}

          {visibleTasks.map((task, index) => {
            const left = Math.min(90, Math.max(10, getImportancePosition(task.importance) + ((index % 3) - 1) * 1.8));
            const top = Math.min(90, Math.max(22, getDeadlineTop(task, now) + ((Math.floor(index / 3) % 3) - 1) * 1.4));
            const overdue = (getDeadlineDiff(task, now) ?? 1) <= 0;
            return (
              <div key={task.id} className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: `${top}%` }}>
                <span className={`block rounded-full border-3 shadow-md ${getDotTone(task, now)}`} />
                <span className={`absolute top-1/2 max-w-28 -translate-y-1/2 truncate rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold shadow-sm ring-1 ring-white/80 ${left > 72 ? 'right-6 text-rose-700' : 'left-6 text-slate-600'}`}>
                  {overdue ? '逾期 · ' : ''}{task.title}
                </span>
              </div>
            );
          })}
        </div>
      </button>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{hiddenCount > 0 ? `仅显示最紧急的 ${MAX_VISIBLE_TASKS} 项，完整列表在任务页。` : `当前显示 ${visibleTasks.length} 项截止压力任务。`}</span>
        {visibleTasks[0] ? <span className="rounded-full bg-slate-50 px-2.5 py-1 ring-1 ring-white/80">最近截止：{visibleTasks[0].title} · {formatCountdown(visibleTasks[0].deadline)}</span> : null}
      </div>
    </section>
  );
}
