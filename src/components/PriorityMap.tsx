import { useMemo, useState } from 'react';
import type { Task } from '../types/task';
import { formatCountdown, formatDeadline } from '../utils/date';
import { getImportancePosition, getRecommendationReason, getUrgencyPosition, isTaskComplete } from '../utils/taskScoring';
import { ProgressBar } from './ProgressBar';

interface PriorityMapProps {
  tasks: Task[];
}

function taskPointTone(task: Task): string {
  if (isTaskComplete(task)) return 'border-emerald-300 bg-emerald-500 shadow-emerald-200';
  if (task.importance >= 8) return 'border-rose-300 bg-rose-500 shadow-rose-200';
  if (task.importance >= 6) return 'border-sky-300 bg-sky-500 shadow-sky-200';
  return 'border-slate-300 bg-slate-500 shadow-slate-200';
}

export function PriorityMap({ tasks }: PriorityMapProps) {
  const visibleTasks = useMemo(() => tasks, [tasks]);
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>(visibleTasks[0]?.id);
  const activeTask = visibleTasks.find((task) => task.id === activeTaskId) ?? visibleTasks[0];

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
        <div className="relative h-[28rem] min-w-[42rem] rounded-[1.75rem] border border-slate-200 bg-[linear-gradient(90deg,rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,0.14)_1px,transparent_1px)] bg-[size:25%_25%] p-5">
          <div className="pointer-events-none absolute inset-x-8 bottom-10 top-8 border-b-2 border-l-2 border-slate-300" />
          <div className="pointer-events-none absolute left-3 top-8 text-xs font-semibold text-slate-400 [writing-mode:vertical-rl]">重要性高</div>
          <div className="pointer-events-none absolute bottom-3 left-8 text-xs font-semibold text-slate-400">不紧急</div>
          <div className="pointer-events-none absolute bottom-3 right-8 text-xs font-semibold text-slate-400">非常紧急</div>
          <div className="pointer-events-none absolute bottom-10 left-8 right-8 h-16 rounded-b-[1.5rem] bg-slate-50/70" />
          <div className="pointer-events-none absolute right-8 top-8 h-24 w-24 rounded-bl-[2rem] bg-rose-50/80" />

          {visibleTasks.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">添加任务后，它们会出现在这张优先级地图上。</div>
          ) : null}

          {visibleTasks.map((task) => {
            const left = getUrgencyPosition(task.deadline);
            const bottom = getImportancePosition(task.importance);
            const active = task.id === activeTask?.id;

            return (
              <button
                key={task.id}
                type="button"
                onClick={() => setActiveTaskId(task.id)}
                onMouseEnter={() => setActiveTaskId(task.id)}
                className="group absolute -translate-x-1/2 translate-y-1/2 text-left outline-none"
                style={{ left: `${left}%`, bottom: `${bottom}%` }}
                aria-label={`查看任务 ${task.title}`}
              >
                <span className={`block h-5 w-5 rounded-full border-4 shadow-lg transition group-hover:scale-125 ${taskPointTone(task)} ${active ? 'scale-125 ring-4 ring-sky-100' : ''}`} />
                <span className="absolute left-6 top-1/2 max-w-32 -translate-y-1/2 truncate rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-100 group-hover:max-w-48">
                  {task.title}
                </span>
              </button>
            );
          })}

          {activeTask ? (
            <div className="absolute right-5 top-5 w-72 rounded-3xl bg-white/95 p-4 shadow-xl ring-1 ring-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-sky-700">任务详情</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-950">{activeTask.title}</h3>
                </div>
                {isTaskComplete(activeTask) ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">已完成</span> : null}
              </div>
              {activeTask.description ? <p className="mt-2 text-sm text-slate-600">{activeTask.description}</p> : null}
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <p>重要性 {activeTask.importance}/10</p>
                <p>{formatCountdown(activeTask.deadline)}</p>
                <p className="text-xs text-slate-400">截止 {formatDeadline(activeTask.deadline)}</p>
                <p className="rounded-2xl bg-sky-50 px-3 py-2 text-sky-700">{getRecommendationReason(activeTask)}</p>
              </div>
              <div className="mt-3">
                <ProgressBar progress={activeTask.progress} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
