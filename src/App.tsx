import { useEffect, useMemo, useState } from 'react';
import { PriorityMap } from './components/PriorityMap';
import { RecommendationCard } from './components/RecommendationCard';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { Task, TaskInput } from './types/task';
import { clampImportance, clampProgress, getRecommendedTask, migrateLegacyImportance } from './utils/taskScoring';

const STORAGE_KEY = 'visualized-deadline.tasks';

type LegacyTask = Partial<Omit<Task, 'schemaVersion'>> & {
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
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-2',
    title: '预约下周复盘时间',
    importance: 8,
    deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    progress: 0,
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function normalizeTaskInput(input: TaskInput): TaskInput {
  return {
    title: input.title,
    description: input.description,
    importance: clampImportance(input.importance),
    deadline: input.deadline,
    progress: clampProgress(input.progress),
  };
}

function normalizeStoredTask(task: LegacyTask): Task {
  const now = new Date().toISOString();
  const legacyDoneProgress = task.status === 'done' ? 100 : 0;
  const isCurrentSchema = task.schemaVersion === 2;

  return {
    id: task.id || crypto.randomUUID(),
    title: task.title || '未命名任务',
    description: task.description || undefined,
    importance: isCurrentSchema ? clampImportance(task.importance) : migrateLegacyImportance(task.importance),
    deadline: task.deadline || undefined,
    progress: clampProgress(task.progress ?? legacyDoneProgress),
    schemaVersion: 2,
    createdAt: task.createdAt || now,
    updatedAt: task.updatedAt || now,
  };
}

function createTask(input: TaskInput): Task {
  const now = new Date().toISOString();
  return {
    ...normalizeTaskInput(input),
    id: crypto.randomUUID(),
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
  };
}

function App() {
  const [tasks, setTasks] = useLocalStorage<Task[]>(STORAGE_KEY, demoTasks);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();

  const normalizedTasks = useMemo(() => {
    const storedTasks = Array.isArray(tasks) ? tasks : demoTasks;
    return storedTasks.map((task) => normalizeStoredTask(task));
  }, [tasks]);
  const recommendedTask = useMemo(() => getRecommendedTask(normalizedTasks), [normalizedTasks]);

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

    if (editingTask) {
      setTasks((currentTasks) =>
        currentTasks.map((task) => (task.id === editingTask.id ? { ...task, ...normalizedInput, updatedAt: new Date().toISOString() } : task)),
      );
    } else {
      setTasks((currentTasks) => [createTask(normalizedInput), ...currentTasks]);
    }
    closeForm();
  }

  function deleteTask(taskId: string) {
    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
  }

  function startEditing(task: Task) {
    setEditingTask(task);
    setIsFormOpen(true);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e0f2fe,transparent_35%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-8 text-slate-900 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">Visualized Deadline</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">把任务放在地图上，把注意力留给推进。</h1>
            <p className="mt-3 max-w-2xl text-slate-600">系统根据截止时间和重要性，把任务放进一张视觉优先级地图；你只需要看见重点并更新进度。</p>
          </div>
          <button onClick={() => setIsFormOpen(true)} className="rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-700">
            添加任务
          </button>
        </header>

        <RecommendationCard task={recommendedTask} />

        {isFormOpen ? <TaskForm task={editingTask} onCancel={closeForm} onSubmit={handleSubmit} /> : null}

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <PriorityMap tasks={normalizedTasks} />
          <TaskList tasks={normalizedTasks} onDelete={deleteTask} onEdit={startEditing} />
        </div>
      </div>
    </main>
  );
}

export default App;
