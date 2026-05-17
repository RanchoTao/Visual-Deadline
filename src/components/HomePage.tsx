import { branding } from '../constants/branding';
import type { PressureBreakdown, PressureHistoryRecord, Task } from '../types/task';
import { MiniTaskMatrix } from './MiniTaskMatrix';
import { PressureCard } from './PressureCard';
import { RecommendationCard } from './RecommendationCard';

interface HomePageProps {
  pressure: PressureBreakdown;
  pressureHistory: PressureHistoryRecord[];
  recommendedTasks: Task[];
  activeTasks: Task[];
  onRecalibrate: () => void;
  onOpenTasks: () => void;
}

export function HomePage({ pressure, pressureHistory, recommendedTasks, activeTasks, onRecalibrate, onOpenTasks }: HomePageProps) {
  return (
    <section className="space-y-7 md:space-y-8">
      <div className="rounded-[2rem] border border-white/70 bg-white/60 p-5 shadow-xl shadow-slate-200/50 backdrop-blur md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold tracking-[0.24em] text-slate-400">今日执行</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">今日执行中枢</h1>
          </div>
          <p className="max-w-md text-sm leading-6 text-slate-500">只保留高频、短周期、可立即行动的信息：任务、优先级、压力与提醒。</p>
        </div>
      </div>
      <PressureCard pressure={pressure} history={pressureHistory} onRecalibrate={onRecalibrate} />
      <RecommendationCard tasks={recommendedTasks} pressure={pressure} />
      <MiniTaskMatrix tasks={activeTasks} onOpenTasks={onOpenTasks} />

      <section className="rounded-[1.5rem] border border-white/60 bg-white/45 px-4 py-3 text-xs text-slate-400 shadow-sm shadow-slate-200/40 backdrop-blur" aria-label="产品品牌信息">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-slate-500">{branding.organizationName} · {branding.productName} v{branding.version} · 作者：{branding.author}</p>
          <a href={branding.githubUrl} target="_blank" rel="noreferrer" className="font-semibold text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline">GitHub</a>
        </div>
      </section>
    </section>
  );
}
