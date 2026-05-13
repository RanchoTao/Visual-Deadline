import { branding } from '../constants/branding';
import type { Goal, GoalInput, PressureBreakdown, PressureHistoryRecord, Task } from '../types/task';
import { MiniTaskMatrix } from './MiniTaskMatrix';
import { GoalRoadmapPanel } from './GoalRoadmapPanel';
import { PressureCard } from './PressureCard';
import { RecommendationCard } from './RecommendationCard';
import { TodayFocusPanel } from './TodayFocusPanel';

interface HomePageProps {
  pressure: PressureBreakdown;
  pressureHistory: PressureHistoryRecord[];
  recommendedTasks: Task[];
  activeTasks: Task[];
  tasks: Task[];
  goals: Goal[];
  onSaveGoal: (input: GoalInput, goalId?: string) => void;
  onAddTask: () => void;
  onRecalibrate: () => void;
  onOpenTasks: () => void;
}

export function HomePage({ pressure, pressureHistory, recommendedTasks, activeTasks, tasks, goals, onSaveGoal, onAddTask, onRecalibrate, onOpenTasks }: HomePageProps) {
  const completedCount = tasks.filter((task) => task.lifecycleStatus === 'completed').length;

  return (
    <section className="space-y-5 md:space-y-6">
      <PressureCard pressure={pressure} history={pressureHistory} onRecalibrate={onRecalibrate} />
      <TodayFocusPanel tasks={activeTasks} onOpenTasks={onOpenTasks} />
      <RecommendationCard tasks={recommendedTasks} />
      <MiniTaskMatrix tasks={activeTasks} onOpenTasks={onOpenTasks} />
      <GoalRoadmapPanel goals={goals} tasks={tasks} onSaveGoal={onSaveGoal} />

      <section className="rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-xl shadow-slate-200/60 backdrop-blur md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-500">快速操作</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">首页只保留今天需要立刻判断的入口。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-white/80">进行中 {activeTasks.length}</span>
            <span className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-white/80">已完成 {completedCount}</span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onAddTask} className="rounded-3xl bg-slate-950 px-4 py-3 text-left text-sm font-semibold text-white shadow-sm hover:bg-slate-700">
            添加项目
            <span className="mt-1 block text-xs font-medium text-slate-300">把脑内占用移到系统里</span>
          </button>
          <button type="button" onClick={onRecalibrate} className="rounded-3xl bg-white/85 px-4 py-3 text-left text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
            重新校准压力
            <span className="mt-1 block text-xs font-medium text-slate-400">让模型贴近此刻体感</span>
          </button>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/70 bg-white/55 px-4 py-3 text-xs text-slate-400 shadow-sm shadow-slate-200/50 backdrop-blur">
        <span className="font-semibold text-slate-500">未来智能区：</span>
        本地总结、节奏洞察与行动建议暂不启用；当前版本不调用 AI 或云端服务。
      </section>

      <section className="rounded-[1.5rem] border border-white/60 bg-white/45 px-4 py-3 text-xs text-slate-400 shadow-sm shadow-slate-200/40 backdrop-blur" aria-label="产品品牌信息">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-slate-500">{branding.organizationName}</span>
            <span>{branding.productName} v{branding.version}</span>
            <span>Built by {branding.author}</span>
          </div>
          <a href={branding.githubUrl} target="_blank" rel="noreferrer" className="font-semibold text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline">GitHub</a>
        </div>
      </section>
    </section>
  );
}
