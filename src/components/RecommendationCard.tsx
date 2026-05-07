import type { Task } from '../types/task';
import { formatDeadline } from '../utils/date';
import { getTaskScore } from '../utils/taskScoring';

interface RecommendationCardProps {
  task?: Task;
  onStart: (task: Task) => void;
  onComplete: (task: Task) => void;
}

export function RecommendationCard({ task, onStart, onComplete }: RecommendationCardProps) {
  if (!task) {
    return (
      <section className="rounded-[2rem] bg-gradient-to-br from-emerald-50 to-sky-50 p-6 shadow-sm ring-1 ring-white/70">
        <p className="text-sm font-semibold text-emerald-700">当前推荐</p>
        <h2 className="mt-3 text-2xl font-bold text-slate-900">没有待办任务，先休息一下。</h2>
        <p className="mt-2 text-slate-600">当你添加任务后，系统会自动告诉你最该先做哪一件。</p>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] bg-gradient-to-br from-sky-100 via-white to-amber-50 p-6 shadow-sm ring-1 ring-white/70">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-sky-700">现在最应该做</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{task.title}</h2>
          {task.description ? <p className="mt-3 max-w-2xl text-slate-600">{task.description}</p> : null}
        </div>
        <span className="rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">Score {getTaskScore(task)}</span>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-sm text-slate-600">
        <span className="rounded-full bg-white/75 px-3 py-1.5">重要性 {task.importance}/5</span>
        <span className="rounded-full bg-white/75 px-3 py-1.5">截止 {formatDeadline(task.deadline)}</span>
        {task.estimatedMinutes ? <span className="rounded-full bg-white/75 px-3 py-1.5">约 {task.estimatedMinutes} 分钟</span> : null}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={() => onStart(task)} className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-500">
          开始做
        </button>
        <button onClick={() => onComplete(task)} className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
          标记完成
        </button>
      </div>
    </section>
  );
}
