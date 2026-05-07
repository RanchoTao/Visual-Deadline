import { useMemo, useState } from 'react';
import { EisenhowerMatrix } from './components/EisenhowerMatrix';
import { RecommendationCard } from './components/RecommendationCard';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { Task, TaskInput, TaskStatus } from './types/task';
import { getRecommendedTask, groupTasksByMatrix } from './utils/taskScoring';

const STORAGE_KEY = 'visualized-deadline.tasks';

const demoTasks: Task[] = [
  {
    id: 'demo-1',
    title: '整理今天最重要的交付物',
    description: '只列出 1-3 件真正需要推进的事情。',
    importance: 5,
    deadline: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 16),
    estimatedMinutes: 25,
    status: 'todo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-2',
    title: '预约下周复盘时间',
    importance: 4,
    deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    estimatedMinutes: 10,
    status: 'todo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function createTask(input: TaskInput): Task {
  const now = new Date().toISOString();
  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
}

function App() {
  const [tasks, setTasks] = useLocalStorage<Task[]>(STORAGE_KEY, demoTasks);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();

  const recommendedTask = useMemo(() => getRecommendedTask(tasks), [tasks]);
  const matrixGroups = useMemo(() => groupTasksByMatrix(tasks), [tasks]);

  function closeForm() {
    setIsFormOpen(false);
    setEditingTask(undefined);
  }

  function handleSubmit(input: TaskInput) {
    if (editingTask) {
      setTasks((currentTasks) =>
        currentTasks.map((task) => (task.id === editingTask.id ? { ...task, ...input, updatedAt: new Date().toISOString() } : task)),
      );
    } else {
      setTasks((currentTasks) => [createTask(input), ...currentTasks]);
    }
    closeForm();
  }

  function updateTaskStatus(task: Task, status: TaskStatus) {
    setTasks((currentTasks) =>
      currentTasks.map((item) => (item.id === task.id ? { ...item, status, updatedAt: new Date().toISOString() } : item)),
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e0f2fe,transparent_35%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-8 text-slate-900 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">Visualized Deadline</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">把任务交给系统，把注意力留给执行。</h1>
            <p className="mt-3 max-w-2xl text-slate-600">记录、分类、排序和提醒由系统完成；你只需要看见下一步，然后开始。</p>
          </div>
          <button onClick={() => setIsFormOpen(true)} className="rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-700">
            添加任务
          </button>
        </header>

        <RecommendationCard task={recommendedTask} onStart={(task) => updateTaskStatus(task, 'doing')} onComplete={(task) => updateTaskStatus(task, 'done')} />

        {isFormOpen ? <TaskForm task={editingTask} onCancel={closeForm} onSubmit={handleSubmit} /> : null}

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <EisenhowerMatrix groups={matrixGroups} />
          <TaskList tasks={tasks} onDelete={deleteTask} onEdit={startEditing} onStatusChange={updateTaskStatus} />
        </div>
      </div>
    </main>
  );
}

export default App;
