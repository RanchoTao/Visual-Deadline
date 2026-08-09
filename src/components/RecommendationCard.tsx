import type { Task } from '../types/task';
import { formatCountdown } from '../utils/date';
import { getActivityTypeLabel, getRecommendationReason, getTaskScore } from '../utils/taskScoring';

interface RecommendationCardProps {
  tasks: Task[];
}

export function RecommendationCard({ tasks }: RecommendationCardProps) {
  if (tasks.length === 0) {
    return (
      <section className="rounded-[2rem] bg-gradient-to-br from-emerald-50 to-sky-50 p-7 shadow-sm ring-1 ring-white/70 md:p-8">
        <p className="text-sm font-semibold text-emerald-700">当前最值得关注</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">没有需要推进的任务，先休息一下。</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">添加任务后，VD 会根据截止时间与重要性给出下一步建议。</p>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] bg-gradient-to-br from-sky-100 via-white to-amber-50 p-6 shadow-sm ring-1 ring-white/70 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-sky-700">下一步建议</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">优先列表</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">系统建议我接下来先做什么？</p>
        </div>
        <span className="rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-sky-700 shadow-sm">Top 3</span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {tasks.map((task, index) => {
          const priorityScore = Math.round(getTaskScore(task));
          return (
            <article key={task.id} className="rounded-3xl bg-white/75 p-5 shadow-sm ring-1 ring-white/80 transition duration-500 hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-slate-950">{index + 1}. {task.title}</h3>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">{task.importance}/10</span>
              </div>
              <p className="mt-4 rounded-2xl bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-700">{getRecommendationReason(task)}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-50 px-2.5 py-1">重要性 {task.importance}/10</span>
                <span className="rounded-full bg-slate-50 px-2.5 py-1">{getActivityTypeLabel(task.activityType)}</span>
                <span className="rounded-full bg-slate-50 px-2.5 py-1">{formatCountdown(task.deadline)}</span>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">优先分 {priorityScore}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
