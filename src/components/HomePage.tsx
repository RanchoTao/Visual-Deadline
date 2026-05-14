import { branding } from '../constants/branding';
import type { Goal, GoalInput, PressureBreakdown, PressureHistoryRecord, Task } from '../types/task';
import { MiniTaskMatrix } from './MiniTaskMatrix';
import { GoalRoadmapPanel } from './GoalRoadmapPanel';
import { PressureCard } from './PressureCard';
import { RecommendationCard } from './RecommendationCard';

interface HomePageProps {
  pressure: PressureBreakdown;
  pressureHistory: PressureHistoryRecord[];
  recommendedTasks: Task[];
  activeTasks: Task[];
  tasks: Task[];
  goals: Goal[];
  onSaveGoal: (input: GoalInput, goalId?: string) => void;
  onDeleteGoal: (goalId: string) => void;
  onRoadmapGenerated: () => void;
  onRecalibrate: () => void;
  onOpenTasks: () => void;
}

export function HomePage({ pressure, pressureHistory, recommendedTasks, activeTasks, tasks, goals, onSaveGoal, onDeleteGoal, onRoadmapGenerated, onRecalibrate, onOpenTasks }: HomePageProps) {
  return (
    <section className="space-y-7 md:space-y-8">
      <PressureCard pressure={pressure} history={pressureHistory} onRecalibrate={onRecalibrate} />
      <RecommendationCard tasks={recommendedTasks} pressure={pressure} />
      <MiniTaskMatrix tasks={activeTasks} onOpenTasks={onOpenTasks} />
      <GoalRoadmapPanel goals={goals} tasks={tasks} onSaveGoal={onSaveGoal} onDeleteGoal={onDeleteGoal} onRoadmapGenerated={onRoadmapGenerated} />

      <section className="rounded-[1.5rem] border border-white/60 bg-white/45 px-4 py-3 text-xs text-slate-400 shadow-sm shadow-slate-200/40 backdrop-blur" aria-label="产品品牌信息">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-slate-500">{branding.organizationName} · {branding.productName} v{branding.version} · Built by {branding.author}</p>
          <a href={branding.githubUrl} target="_blank" rel="noreferrer" className="font-semibold text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline">GitHub</a>
        </div>
      </section>
    </section>
  );
}
