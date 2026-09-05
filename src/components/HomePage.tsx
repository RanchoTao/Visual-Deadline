import { branding, footerBranding } from '../constants/branding';
import type { Task } from '../types/task';
import type { BuiltInLifeEventType, LifeControllerPlan, LifeEvent, LifePreferences, LifeState } from '../types/lifeController';
import { LifeControllerPanel } from './LifeControllerPanel';
import { MiniTaskMatrix } from './MiniTaskMatrix';
import { RecommendationCard } from './RecommendationCard';

interface HomePageProps {
  recommendedTasks: Task[];
  activeTasks: Task[];
  onOpenTasks: () => void;
  lifeState: LifeState;
  lifePlan: LifeControllerPlan;
  lifeEvents: LifeEvent[];
  lifePreferences: LifePreferences;
  onRecordLifeEvent: (type: BuiltInLifeEventType) => Promise<void>;
  onUndoLifeEvent: () => Promise<void>;
  lifeEventSyncStatus?: string;
}

export function HomePage({ recommendedTasks, activeTasks, onOpenTasks, lifeState, lifePlan, lifeEvents, lifePreferences, onRecordLifeEvent, onUndoLifeEvent, lifeEventSyncStatus }: HomePageProps) {
  return (
    <section className="space-y-4 md:space-y-8">
      <LifeControllerPanel state={lifeState} plan={lifePlan} events={lifeEvents} preferences={lifePreferences} onRecord={onRecordLifeEvent} onUndo={onUndoLifeEvent} syncStatus={lifeEventSyncStatus} />

      <details className="rounded-[2rem] border border-white/70 bg-white/55 p-4 shadow-xl shadow-slate-200/50 backdrop-blur md:p-5">
        <summary className="min-h-12 cursor-pointer list-none rounded-2xl px-3 py-3 text-sm font-semibold text-slate-600 transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100">查看原有任务概览</summary>
        <div className="mt-4 space-y-4 md:space-y-6">
          <MiniTaskMatrix tasks={activeTasks} onOpenTasks={onOpenTasks} />
          <RecommendationCard tasks={recommendedTasks} />
        </div>
      </details>

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
