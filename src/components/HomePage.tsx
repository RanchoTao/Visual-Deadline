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
      <PressureCard pressure={pressure} history={pressureHistory} onRecalibrate={onRecalibrate} />
      <RecommendationCard tasks={recommendedTasks} pressure={pressure} />
      <MiniTaskMatrix tasks={activeTasks} onOpenTasks={onOpenTasks} />

      <section className="rounded-[1.5rem] border border-white/60 bg-white/45 px-4 py-3 text-xs text-slate-400 shadow-sm shadow-slate-200/40 backdrop-blur" aria-label="产品品牌信息">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-slate-500">{branding.organizationName} · {branding.productName} v{branding.version} · 作者 {branding.author}</p>
          <a href={branding.githubUrl} target="_blank" rel="noreferrer" className="font-semibold text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline">源码</a>
        </div>
      </section>
    </section>
  );
}
