import { branding, footerBranding } from '../constants/branding';
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
    <section className="space-y-4 md:space-y-8">
      <PressureCard pressure={pressure} history={pressureHistory} onRecalibrate={onRecalibrate} />
      <RecommendationCard tasks={recommendedTasks} pressure={pressure} />
      <MiniTaskMatrix tasks={activeTasks} onOpenTasks={onOpenTasks} />

      <section className="rounded-[1.5rem] border border-white/60 bg-white/45 px-4 py-3 text-xs text-slate-400 shadow-sm shadow-slate-200/40 backdrop-blur" aria-label="产品品牌信息">
        <div className="flex min-h-8 flex-col justify-center gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-medium leading-5 text-slate-500">
            <span className="whitespace-nowrap">{footerBranding.brandName}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="whitespace-nowrap">{footerBranding.productVersion}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="whitespace-nowrap">{footerBranding.authorCredit}</span>
          </p>
          <a
            href={branding.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-8 shrink-0 items-center justify-center self-start rounded-full px-3 py-1.5 font-semibold leading-none text-slate-500 underline-offset-4 transition-colors duration-200 hover:bg-white/60 hover:text-slate-700 hover:underline sm:self-center"
          >
            {footerBranding.githubLabel}
          </a>
        </div>
      </section>
    </section>
  );
}
