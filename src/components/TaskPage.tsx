import type { LifecycleStatus, Task, Achievement, PressureBreakdown, TaskInput } from '../types/task';
import { AchievementsPanel } from './AchievementsPanel';
import { AITaskAnalysisPanel } from './AITaskAnalysisPanel';
import { AITaskCommandBar } from './AITaskCommandBar';
import { PriorityMap } from './PriorityMap';
import { TaskList } from './TaskList';

interface TaskPageProps {
  tasks: Task[];
  activeTasks: Task[];
  achievements: Achievement[];
  pressure?: PressureBreakdown;
  onAddTask: () => void;
  onConfirmAITasks: (tasks: TaskInput[]) => void;
  onArchiveTask: (task: Task, lifecycleStatus: Exclude<LifecycleStatus, 'active'>) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  onAIConnected: () => void;
  onAIReportGenerated: () => void;
}

export function TaskPage({ tasks, activeTasks, achievements, pressure, onAddTask, onConfirmAITasks, onArchiveTask, onDeleteTask, onEditTask, onAIConnected, onAIReportGenerated }: TaskPageProps) {
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
        <div>
          <p className="text-sm font-semibold tracking-[0.24em] text-slate-500">任务系统</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">任务</h1>
          <p className="mt-3 max-w-2xl text-slate-600">完整任务操作中心：先看紧急重要矩阵，再处理进行中的项目。</p>
        </div>
        <button type="button" onClick={onAddTask} className="rounded-full bg-white/85 px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
          添加项目
        </button>
      </header>

      <AITaskCommandBar tasks={tasks} onConfirmTasks={onConfirmAITasks} />
      <PriorityMap tasks={activeTasks} />
      <AITaskAnalysisPanel tasks={tasks} pressure={pressure} onAIConnected={onAIConnected} onAIReportGenerated={onAIReportGenerated} />
      <TaskList tasks={activeTasks} onArchive={onArchiveTask} onDelete={onDeleteTask} onEdit={onEditTask} />
      <AchievementsPanel achievements={achievements} />
    </section>
  );
}
