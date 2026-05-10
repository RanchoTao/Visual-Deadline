import type { Task } from '../types/task';
import { formatCountdown, formatDeadline } from '../utils/date';
import { getRecommendationReason } from '../utils/taskScoring';
import { ProgressBar } from './ProgressBar';

interface RecommendationCardProps {
  task?: Task;
}

export function RecommendationCard({ task }: RecommendationCardProps) {
  if (!task) {
    return (
      <section className="rounded-[2rem] bg-gradient-to-br from-emerald-50 to-sky-50 p-6 shadow-sm ring-1 ring-white/70">
        <p className="text-sm font-semibold text-emerald-700">当前推荐</p>
        <h2 className="mt-3 text-2xl font-bold text-slate-900">没有需要推进的任务，先休息一下。</h2>
        <p className="mt-2 text-slate-600">当你添加任务后，系统会自动告诉你最值得关注哪一件。</p>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] bg-gradient-to-br from-sky-100 via-white to-amber-50 p-6 shadow-sm ring-1 ring-white/70">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-sky-700">当前最值得关注</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{task.title}</h2>
          {task.description ? <p className="mt-3 max-w-2xl text-slate-600">{task.description}</p> : null}
        </div>
        <span className="rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-sky-700 shadow-sm">{getRecommendationReason(task)}</span>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-slate-600 md:grid-cols-[1fr_1fr_1.2fr]">
        <span className="rounded-2xl bg-white/75 px-3 py-2">重要性 {task.importance}/10</span>
        <span className="rounded-2xl bg-white/75 px-3 py-2">{formatCountdown(task.deadline)}</span>
        <span className="rounded-2xl bg-white/75 px-3 py-2">截止 {formatDeadline(task.deadline)}</span>
      </div>

      <div className="mt-5 max-w-xl">
        <ProgressBar progress={task.progress} />
      </div>
    </section>
  );
}
