import { useEffect, useMemo, useState } from 'react';
import { ActivityLog } from './components/ActivityLog';
import { PressureCard } from './components/PressureCard';
import { PriorityMap } from './components/PriorityMap';
import { RecommendationCard } from './components/RecommendationCard';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { ActivityType, LifecycleStatus, Task, TaskInput } from './types/task';
import {
  calculatePressureIndex,
  clampImportance,
  clampProgress,
  getRecommendedTask,
  migrateLegacyImportance,
  normalizeActivityType,
  normalizeLifecycleStatus,
} from './utils/taskScoring';

const STORAGE_KEY = 'visualized-deadline.tasks';
const PRESSURE_STORAGE_KEY = 'visualized-deadline.subjectivePressure';

type LegacyTask = Partial<Omit<Task, 'schemaVersion' | 'activityType' | 'lifecycleStatus'>> & {
  activityType?: ActivityType | string;
  lifecycleStatus?: LifecycleStatus | string;
  status?: 'todo' | 'doing' | 'done';
  schemaVersion?: number;
};

const demoTasks: Task[] = [
  {
    id: 'demo-1',
    title: '整理今天最重要的交付物',
    description: '只列出 1-3 件真正需要推进的事情。',
    importance: 9,
    deadline: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 16),
    progress: 20,
    activityType: 'task',
    lifecycleStatus: 'active',
    schemaVersion: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-2',
    title: '预约下周复盘时间',
    importance: 8,
    deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    progress: 0,
    activityType: 'schedule',
    lifecycleStatus: 'active',
    schemaVersion: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function normalizeTaskInput(input: TaskInput): TaskInput {
  const lifecycleStatus = input.progress >= 100 ? 'completed' : input.lifecycleStatus;

  return {
    title: input.title,
    description: input.description,
    importance: clampImportance(input.importance),
    deadline: input.deadline,
    progress: clampProgress(input.progress),
    activityType: normalizeActivityType(input.activityType),
    lifecycleStatus,
  };
}

function normalizeStoredTask(task: LegacyTask): Task {
  const now = new Date().toISOString();
  const progress = clampProgress(task.progress ?? (task.status === 'done' ? 100 : 0));
  const migratedLifecycleStatus = task.status === 'done' || progress >= 100 ? 'completed' : normalizeLifecycleStatus(task.lifecycleStatus);
  const isCurrentSchema = task.schemaVersion === 3;
  const completedAt = task.completedAt ?? (migratedLifecycleStatus === 'completed' ? task.updatedAt ?? now : undefined);
  const abandonedAt = task.abandonedAt ?? (migratedLifecycleStatus === 'abandoned' ? task.updatedAt ?? now : undefined);

  return {
    id: task.id || crypto.randomUUID(),
    title: task.title || '未命名项目',
    description: task.description || undefined,
    importance: isCurrentSchema ? clampImportance(task.importance) : migrateLegacyImportance(task.importance),
    deadline: task.deadline || undefined,
    progress,
    activityType: normalizeActivityType(task.activityType),
    lifecycleStatus: migratedLifecycleStatus,
    completedAt,
    abandonedAt,
    schemaVersion: 3,
    createdAt: task.createdAt || now,
    updatedAt: task.updatedAt || now,
  };
}

function createTask(input: TaskInput): Task {
  const now = new Date().toISOString();
  const normalizedInput = normalizeTaskInput(input);

  return {
    ...normalizedInput,
    id: crypto.randomUUID(),
    completedAt: normalizedInput.lifecycleStatus === 'completed' ? now : undefined,
    abandonedAt: normalizedInput.lifecycleStatus === 'abandoned' ? now : undefined,
    schemaVersion: 3,
    createdAt: now,
    updatedAt: now,
  };
}

function App() {
  const [tasks, setTasks] = useLocalStorage<Task[]>(STORAGE_KEY, demoTasks);
  const [subjectivePressure, setSubjectivePressure] = useLocalStorage<number>(PRESSURE_STORAGE_KEY, 35);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();

  const normalizedTasks = useMemo(() => {
    const storedTasks = Array.isArray(tasks) ? tasks : demoTasks;
    return storedTasks.map((task) => normalizeStoredTask(task));
  }, [tasks]);
  const activeTasks = useMemo(() => normalizedTasks.filter((task) => task.lifecycleStatus === 'active'), [normalizedTasks]);
  const recommendedTask = useMemo(() => getRecommendedTask(normalizedTasks), [normalizedTasks]);
  const totalPressure = useMemo(() => calculatePressureIndex(normalizedTasks, subjectivePressure), [normalizedTasks, subjectivePressure]);

  useEffect(() => {
    if (JSON.stringify(tasks) !== JSON.stringify(normalizedTasks)) {
      setTasks(normalizedTasks);
    }
  }, [normalizedTasks, setTasks, tasks]);

  function closeForm() {
    setIsFormOpen(false);
    setEditingTask(undefined);
  }

  function handleSubmit(input: TaskInput) {
    const normalizedInput = normalizeTaskInput(input);
    const now = new Date().toISOString();

    if (editingTask) {
      setTasks((currentTasks) =>
        currentTasks.map((task) => {
          if (task.id !== editingTask.id) return task;
          const lifecycleChanged = task.lifecycleStatus !== normalizedInput.lifecycleStatus;
          return {
            ...task,
            ...normalizedInput,
            completedAt: normalizedInput.lifecycleStatus === 'completed' ? task.completedAt ?? now : lifecycleChanged ? undefined : task.completedAt,
            abandonedAt: normalizedInput.lifecycleStatus === 'abandoned' ? task.abandonedAt ?? now : lifecycleChanged ? undefined : task.abandonedAt,
            updatedAt: now,
          };
        }),
      );
    } else {
      setTasks((currentTasks) => [createTask(normalizedInput), ...currentTasks]);
    }
    closeForm();
  }

  function archiveTask(task: Task, lifecycleStatus: Exclude<LifecycleStatus, 'active'>) {
    const now = new Date().toISOString();
    setTasks((currentTasks) =>
      currentTasks.map((item) =>
        item.id === task.id
          ? {
              ...item,
              lifecycleStatus,
              progress: lifecycleStatus === 'completed' ? 100 : item.progress,
              completedAt: lifecycleStatus === 'completed' ? now : item.completedAt,
              abandonedAt: lifecycleStatus === 'abandoned' ? now : item.abandonedAt,
              updatedAt: now,
            }
          : item,
      ),
    );
  }

  function deleteTask(taskId: string) {
    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
  }

  function startEditing(task: Task) {
    setEditingTask(task);
    setIsFormOpen(true);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e0f2fe,transparent_32%),radial-gradient(circle_at_top_right,#f8fafc,transparent_30%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-8 text-slate-900 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Visualized Deadline</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">把压力外化成一张可操作的地图。</h1>
            <p className="mt-3 max-w-2xl text-slate-600">系统记录时间压力、注意力负载与恢复活动；你只需要观察节奏，选择下一步。</p>
          </div>
          <button onClick={() => setIsFormOpen(true)} className="rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-700">
            添加项目
          </button>
        </header>

        <PressureCard subjectivePressure={subjectivePressure} totalPressure={totalPressure} onSubjectivePressureChange={setSubjectivePressure} />
        <RecommendationCard task={recommendedTask} />

        {isFormOpen ? <TaskForm task={editingTask} onCancel={closeForm} onSubmit={handleSubmit} /> : null}

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <PriorityMap tasks={activeTasks} />
          <div className="space-y-6">
            <TaskList tasks={activeTasks} onArchive={archiveTask} onDelete={deleteTask} onEdit={startEditing} />
            <ActivityLog tasks={normalizedTasks} />
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
