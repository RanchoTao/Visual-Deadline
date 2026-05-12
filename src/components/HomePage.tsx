import type { PressureBreakdown, PressureHistoryRecord, Task } from '../types/task';
import { ActivityLog } from './ActivityLog';
import { PressureCard } from './PressureCard';
import { RecommendationCard } from './RecommendationCard';

interface HomePageProps {
  pressure: PressureBreakdown;
  pressureHistory: PressureHistoryRecord[];
  recommendedTasks: Task[];
  activeTasks: Task[];
  tasks: Task[];
  onAddTask: () => void;
  onRecalibrate: () => void;
  onDeleteTask: (taskId: string) => void;
  onReviewNoteChange: (taskId: string, reviewNote: string) => void;
}

function pressureTone(state: PressureBreakdown['state']): string {
  if (state === 'burnout') return 'text-rose-600 bg-rose-50 ring-rose-100';
  if (state === 'overload') return 'text-orange-600 bg-orange-50 ring-orange-100';
  if (state === 'high') return 'text-amber-600 bg-amber-50 ring-amber-100';
  if (state === 'manageable') return 'text-sky-600 bg-sky-50 ring-sky-100';
  return 'text-emerald-600 bg-emerald-50 ring-emerald-100';
}

export function HomePage({ pressure, pressureHistory, recommendedTasks, activeTasks, tasks, onAddTask, onRecalibrate, onDeleteTask, onReviewNoteChange }: HomePageProps) {
  const completedCount = tasks.filter((task) => task.lifecycleStatus === 'completed').length;
  const archivedCount = tasks.filter((task) => task.lifecycleStatus !== 'active').length;
  const nextTask = recommendedTasks[0];

  return (
    <section className="space-y-5 md:space-y-6">
      <header className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur md:p-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">VD Home · Daily Control Center</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">首页</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">先看压力，再选下一步。VD 会把任务、节奏和日志收束成每天的控制台。</p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-3xl bg-slate-50/80 p-2 ring-1 ring-white/80 sm:min-w-[22rem]">
            <div className="rounded-2xl bg-white/85 px-3 py-3 text-center"><p className="text-2xl font-semibold text-slate-950">{activeTasks.length}</p><p className="text-xs text-slate-400">进行中</p></div>
            <div className="rounded-2xl bg-white/85 px-3 py-3 text-center"><p className="text-2xl font-semibold text-slate-950">{completedCount}</p><p className="text-xs text-slate-400">已完成</p></div>
            <div className="rounded-2xl bg-white/85 px-3 py-3 text-center"><p className="text-2xl font-semibold text-slate-950">{archivedCount}</p><p className="text-xs text-slate-400">日志</p></div>
          </div>
        </div>
      </header>

      <PressureCard pressure={pressure} history={pressureHistory} onRecalibrate={onRecalibrate} />
      <RecommendationCard tasks={recommendedTasks} />

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-500">当前状态</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-950">{nextTask ? `下一步：${nextTask.title}` : '今天没有强制推进项'}</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${pressureTone(pressure.state)}`}>{pressure.label}</span>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-500">{pressure.recommendation}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={onAddTask} className="rounded-3xl bg-slate-950 px-4 py-4 text-left text-sm font-semibold text-white shadow-sm hover:bg-slate-700">添加项目<span className="mt-1 block text-xs font-medium text-slate-300">把脑内占用移到系统里</span></button>
            <button type="button" onClick={onRecalibrate} className="rounded-3xl bg-white/85 px-4 py-4 text-left text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">重新校准压力<span className="mt-1 block text-xs font-medium text-slate-400">让模型贴近此刻体感</span></button>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
          <p className="text-sm font-semibold text-slate-500">未来智能区</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">AI 协同占位</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">这里预留给未来的本地上下文总结、节奏建议和行动复盘。当前版本保持本地优先，不调用任何 AI 或云端服务。</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {['本地上下文', '节奏洞察', '行动建议'].map((item) => <div key={item} className="rounded-2xl bg-slate-50/80 px-3 py-3 text-center text-xs font-semibold text-slate-500 ring-1 ring-white/80">{item}</div>)}
          </div>
        </section>
      </div>

      <ActivityLog tasks={tasks} limit={4} title="最近日志" onDelete={onDeleteTask} onReviewNoteChange={onReviewNoteChange} />
    </section>
  );
}
