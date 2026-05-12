import type { LifecycleStatus, Task, Achievement } from '../types/task';
import { AchievementsPanel } from './AchievementsPanel';
import { PriorityMap } from './PriorityMap';
import { TaskList } from './TaskList';

interface TaskPageProps {
  activeTasks: Task[];
  achievements: Achievement[];
  onAddTask: () => void;
  onArchiveTask: (task: Task, lifecycleStatus: Exclude<LifecycleStatus, 'active'>) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (task: Task) => void;
}

export function TaskPage({ activeTasks, achievements, onAddTask, onArchiveTask, onDeleteTask, onEditTask }: TaskPageProps) {
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
        <div>
          <p className="text-sm font-semibold tracking-[0.24em] text-slate-500">任务系统</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">任务</h1>
          <p className="mt-3 max-w-2xl text-slate-600">完整任务操作中心：先看紧急重要矩阵，再处理进行中的项目。</p>
        </div>
        <button type="button" onClick={onAddTask} className="rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-700">
          添加项目
        </button>
      </header>

      <PriorityMap tasks={activeTasks} />
      <TaskList tasks={activeTasks} onArchive={onArchiveTask} onDelete={onDeleteTask} onEdit={onEditTask} />
      <AchievementsPanel achievements={achievements} />
    </section>
  );
}
