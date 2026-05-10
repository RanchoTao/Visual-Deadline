import { type CSSProperties, useMemo, useState } from 'react';
import type { Task } from '../types/task';
import { formatCountdown, formatDeadline } from '../utils/date';
import { getImportancePosition, getRecommendationReason, getUrgencyPosition, getUrgencyScore, isTaskComplete } from '../utils/taskScoring';
import { ProgressBar } from './ProgressBar';

interface PriorityMapProps {
  tasks: Task[];
}

interface PositionedTask {
  task: Task;
  left: number;
  bottom: number;
}

const MIN_POINT_POSITION = 7;
const MAX_POINT_POSITION = 93;

function clampPosition(value: number): number {
  return Math.min(MAX_POINT_POSITION, Math.max(MIN_POINT_POSITION, value));
}

function getStableHash(value: string): number {
  return Array.from(value).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 9973, 17);
}

function getPointOffset(task: Task): { x: number; y: number } {
  const hash = getStableHash(`${task.id}-${task.title}`);
  return {
    x: ((hash % 5) - 2) * 1.4,
    y: ((Math.floor(hash / 5) % 5) - 2) * 1.2,
  };
}

function getPositionedTask(task: Task): PositionedTask {
  const offset = getPointOffset(task);

  return {
    task,
    left: clampPosition(getUrgencyPosition(task.deadline) + offset.x),
    bottom: clampPosition(getImportancePosition(task.importance) + offset.y),
  };
}

function getDetailCardStyle(positionedTask: PositionedTask): CSSProperties {
  const top = Math.min(74, Math.max(26, 100 - positionedTask.bottom));
  const horizontalKey = positionedTask.left > 50 ? 'right' : 'left';
  const horizontalValue = `${positionedTask.left > 50 ? 100 - positionedTask.left + 4 : positionedTask.left + 4}%`;

  return {
    top: `${top}%`,
    transform: 'translateY(-50%)',
    [horizontalKey]: horizontalValue,
  };
}

function taskPointTone(task: Task): string {
  const urgent = getUrgencyScore(task.deadline) >= 30;

  if (isTaskComplete(task)) return 'h-5 w-5 border-emerald-200 bg-emerald-500 shadow-emerald-200';
  if (task.importance >= 8 && urgent) return 'h-7 w-7 border-rose-200 bg-rose-500 shadow-rose-300';
  if (task.importance >= 8) return 'h-6 w-6 border-amber-200 bg-amber-500 shadow-amber-200';
  if (urgent) return 'h-6 w-6 border-sky-200 bg-sky-500 shadow-sky-200';
  return 'h-5 w-5 border-slate-200 bg-slate-500 shadow-slate-200';
}

export function PriorityMap({ tasks }: PriorityMapProps) {
  const positionedTasks = useMemo(() => tasks.map(getPositionedTask), [tasks]);
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>();
  const activePositionedTask = positionedTasks.find(({ task }) => task.id === activeTaskId);

  return (
    <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">紧急重要矩阵</p>
          <h2 className="text-2xl font-bold text-slate-950">任务在时间和重要性中的位置</h2>
        </div>
        <p className="text-sm text-slate-500">越靠右越紧急，越靠上越重要。</p>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="relative h-[30rem] min-w-[42rem] overflow-hidden rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
          <div className="pointer-events-none absolute left-8 top-8 h-[calc(50%-2rem)] w-[calc(50%-2rem)] bg-sky-50/65" />
          <div className="pointer-events-none absolute right-8 top-8 h-[calc(50%-2rem)] w-[calc(50%-2rem)] bg-rose-50/75" />
          <div className="pointer-events-none absolute bottom-10 left-8 h-[calc(50%-2.5rem)] w-[calc(50%-2rem)] bg-slate-100/75" />
          <div className="pointer-events-none absolute bottom-10 right-8 h-[calc(50%-2.5rem)] w-[calc(50%-2rem)] bg-amber-50/75" />
          <div className="pointer-events-none absolute inset-x-8 bottom-10 top-8 rounded-3xl border border-slate-200 bg-[linear-gradient(90deg,rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,0.14)_1px,transparent_1px)] bg-[size:25%_25%]" />
          <div className="pointer-events-none absolute bottom-10 left-1/2 top-8 border-l-2 border-dashed border-slate-300" />
          <div className="pointer-events-none absolute left-8 right-8 top-1/2 border-t-2 border-dashed border-slate-300" />
          <div className="pointer-events-none absolute inset-x-8 bottom-10 top-8 border-b-2 border-l-2 border-slate-400" />

          <div className="pointer-events-none absolute left-10 top-10 rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-sky-700 shadow-sm">II 不紧急重要</div>
          <div className="pointer-events-none absolute right-10 top-10 rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-rose-700 shadow-sm">I 紧急重要</div>
          <div className="pointer-events-none absolute bottom-14 left-10 rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-slate-500 shadow-sm">III 不紧急不重要</div>
          <div className="pointer-events-none absolute bottom-14 right-10 rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-amber-700 shadow-sm">IV 紧急不重要</div>

          <div className="pointer-events-none absolute left-3 top-8 text-xs font-semibold text-slate-500 [writing-mode:vertical-rl]">重要性高</div>
          <div className="pointer-events-none absolute bottom-10 left-3 text-xs font-semibold text-slate-500 [writing-mode:vertical-rl]">重要性低</div>
          <div className="pointer-events-none absolute bottom-3 left-8 text-xs font-semibold text-slate-500">不紧急</div>
          <div className="pointer-events-none absolute bottom-3 right-8 text-xs font-semibold text-slate-500">非常紧急</div>

          {positionedTasks.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">添加任务后，它们会出现在这张优先级地图上。</div>
          ) : null}

          {positionedTasks.map((positionedTask) => {
            const { task, left, bottom } = positionedTask;
            const active = task.id === activeTaskId;

            return (
              <button
                key={task.id}
                type="button"
                onClick={() => setActiveTaskId(task.id)}
                onMouseEnter={() => setActiveTaskId(task.id)}
                onMouseLeave={() => setActiveTaskId(undefined)}
                onFocus={() => setActiveTaskId(task.id)}
                onBlur={() => setActiveTaskId(undefined)}
                className="group absolute z-10 -translate-x-1/2 translate-y-1/2 text-left outline-none"
                style={{ left: `${left}%`, bottom: `${bottom}%` }}
                aria-label={`查看任务 ${task.title}`}
              >
                <span className={`block rounded-full border-4 shadow-lg transition group-hover:scale-125 ${taskPointTone(task)} ${active ? 'scale-125 ring-4 ring-sky-100' : ''}`} />
                <span className="absolute left-6 top-1/2 max-w-28 -translate-y-1/2 truncate rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-100 group-hover:max-w-40">
                  {task.title}
                </span>
              </button>
            );
          })}

          {activePositionedTask ? (
            <div className="absolute z-20 w-72 rounded-3xl bg-white/95 p-4 shadow-xl ring-1 ring-slate-100" style={getDetailCardStyle(activePositionedTask)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-sky-700">任务详情</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-950">{activePositionedTask.task.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTaskId(undefined)}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-200"
                  aria-label="关闭任务详情"
                >
                  关闭
                </button>
              </div>
              {isTaskComplete(activePositionedTask.task) ? <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">已完成</span> : null}
              {activePositionedTask.task.description ? <p className="mt-2 text-sm text-slate-600">{activePositionedTask.task.description}</p> : null}
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <p>重要性 {activePositionedTask.task.importance}/10</p>
                <p>{formatCountdown(activePositionedTask.task.deadline)}</p>
                <p className="text-xs text-slate-400">截止 {formatDeadline(activePositionedTask.task.deadline)}</p>
                <p className="rounded-2xl bg-sky-50 px-3 py-2 text-sky-700">{getRecommendationReason(activePositionedTask.task)}</p>
              </div>
              <div className="mt-3">
                <ProgressBar progress={activePositionedTask.task.progress} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
