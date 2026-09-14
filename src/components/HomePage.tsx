import { branding, footerBranding } from '../constants/branding';
import type { HomeRecommendationComparison } from '../domain/execution/homeProjection';
import type { Task } from '../types/task';
import type { BuiltInLifeEventType, LifeControllerPlan, LifeEvent, LifePreferences, LifeState } from '../types/lifeController';
import { MiniTaskMatrix } from './MiniTaskMatrix';
import { RecommendationCard } from './RecommendationCard';

interface HomePageProps {
  recommendedTasks: Task[];
  recommendationComparison: HomeRecommendationComparison;
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

function RecommendationDiagnostics({ comparison }: { comparison: HomeRecommendationComparison }) {
  return (
    <details className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-3 text-xs text-slate-600" data-testid="home-recommendation-diagnostics">
      <summary className="cursor-pointer font-semibold text-slate-700">Execution recommendation diagnostics</summary>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div><dt className="font-semibold">Legacy Top 3</dt><dd>{comparison.legacy.taskIds.join(' → ') || 'empty'}</dd></div>
        <div><dt className="font-semibold">Execution Top 3</dt><dd>{comparison.execution.taskIds.join(' → ') || 'empty'}</dd></div>
        <div><dt className="font-semibold">Relation</dt><dd>{comparison.rankingRelation}</dd></div>
        <div><dt className="font-semibold">Classifications</dt><dd>{comparison.classifications.join(', ')}</dd></div>
      </dl>
      {comparison.relationshipWarnings.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {comparison.relationshipWarnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
      {comparison.differences.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {comparison.differences.map((difference, index) => (
            <li key={`${difference.kind}-${difference.taskId ?? 'summary'}-${index}`}>
              {difference.kind}{difference.taskId ? `: ${difference.taskId}` : ''}
              {difference.reason ? ` (${difference.reason})` : ''}
              {difference.legacyRank ? ` legacy #${difference.legacyRank}` : ''}
              {difference.executionRank ? ` execution #${difference.executionRank}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

export function HomePage({ recommendedTasks, recommendationComparison, activeTasks, onOpenTasks }: HomePageProps) {
  return (
    <section className="space-y-4 md:space-y-8">
      <MiniTaskMatrix tasks={activeTasks} onOpenTasks={onOpenTasks} />
      <RecommendationCard tasks={recommendedTasks} />
      {import.meta.env.DEV ? <RecommendationDiagnostics comparison={recommendationComparison} /> : null}

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
