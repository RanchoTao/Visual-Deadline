import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import type { Task } from '../types/task';
import { formatCountdown, formatDeadline } from '../utils/date';
import { getActivityTypeLabel, getDisplayProgress, getTaskProgress, getImportancePosition, getPulseDuration, getRecommendationReason, getUrgencyPosition, getUrgencyScore, getTimeProgress, isProgressAuto, isTaskActive, isTaskComplete } from '../utils/taskScoring';
import { ProgressBar } from './ProgressBar';

interface PriorityMapProps {
  tasks: Task[];
  onEditTask?: (task: Task) => void;
  onCompleteTask?: (task: Task) => void;
  onDeleteTask?: (taskId: string) => void;
}

interface PositionedTask {
  task: Task;
  left: number;
  bottom: number;
}

interface TaskCluster {
  id: string;
  tasks: PositionedTask[];
  left: number;
  bottom: number;
}

const MIN_POINT_POSITION = 9;
const MAX_POINT_POSITION = 91;

function formatCurrentTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function clampPosition(value: number): number {
  return Math.min(MAX_POINT_POSITION, Math.max(MIN_POINT_POSITION, value));
}

function getStableHash(value: string): number {
  return Array.from(value).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 9973, 17);
}

function getPointOffset(task: Task): { x: number; y: number } {
  const hash = getStableHash(`${task.id}-${task.title}`);

  return {
    x: ((hash % 5) - 2) * 1.4,
    y: ((Math.floor(hash / 5) % 5) - 2) * 1.2,
  };
}

function getPositionedTask(task: Task): PositionedTask {
  const offset = getPointOffset(task);

  return {
    task,
    left: clampPosition(getUrgencyPosition(task.deadline) + offset.x),
    bottom: clampPosition(getImportancePosition(task.importance) + offset.y),
  };
}

function clusterPositionedTasks(tasks: PositionedTask[]): TaskCluster[] {
  const clusters = new Map<string, PositionedTask[]>();
  tasks.forEach((task) => {
    const id = `${Math.round(task.left / 14)}-${Math.round(task.bottom / 14)}`;
    clusters.set(id, [...(clusters.get(id) ?? []), task]);
  });
  return Array.from(clusters, ([id, clusterTasks]) => ({
    id,
    tasks: clusterTasks,
    left: clusterTasks.reduce((sum, item) => sum + item.left, 0) / clusterTasks.length,
    bottom: clusterTasks.reduce((sum, item) => sum + item.bottom, 0) / clusterTasks.length,
  }));
}

function getHoverCardStyle(positionedTask: PositionedTask): CSSProperties {
  const top = Math.min(78, Math.max(22, 100 - positionedTask.bottom));
  const shouldPlaceLeft = positionedTask.left > 50;

  return {
    top: `${top}%`,
    transform: 'translateY(-50%)',
    ...(shouldPlaceLeft
      ? { right: `${100 - positionedTask.left + 6}%` }
      : { left: `${positionedTask.left + 6}%` }),
  };
}

function taskPointTone(task: Task): string {
  const urgent = getUrgencyScore(task.deadline) >= 30;

  if (task.lifecycleStatus === 'abandoned') return 'h-5 w-5 border-white bg-slate-300 opacity-45 shadow-slate-100';
  if (isTaskComplete(task)) return 'h-5 w-5 border-white bg-emerald-300 opacity-70 shadow-emerald-100';
  if (task.importance >= 8 && urgent) return 'h-7 w-7 border-white bg-rose-400 shadow-rose-100';
  if (task.importance >= 8) return 'h-6 w-6 border-white bg-amber-400 shadow-amber-100';
  if (urgent) return 'h-6 w-6 border-white bg-sky-400 shadow-sky-100';
  return 'h-5 w-5 border-white bg-slate-400 shadow-slate-100';
}

function TaskDetailContent({ task }: { task: Task }) {
  const displayProgress = getDisplayProgress(task);
  const taskProgress = getTaskProgress(task);
  const timeProgress = getTimeProgress(task);
  const progressIsAuto = isProgressAuto(task);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-sky-700">任务详情 · {getActivityTypeLabel(task.activityType)}</p>
          <h3 className="mt-1 text-lg font-bold text-slate-950">{task.title}</h3>
        </div>
        {isTaskComplete(task) ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">已完成</span> : null}
      </div>
      {task.description ? <p className="mt-3 text-sm text-slate-600">{task.description}</p> : null}
      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <p>重要性 {task.importance}/10</p>
        <p>紧急程度 {getUrgencyScore(task.deadline)}</p>
        <p>{formatCountdown(task.deadline)}</p>
        <p className="text-xs text-slate-400">截止 {formatDeadline(task.deadline)}</p>
        <p className="rounded-2xl bg-sky-50 px-3 py-2 text-sky-700">{getRecommendationReason(task)}</p>
      </div>
      <div className="mt-4">
        <ProgressBar progress={displayProgress} />
        <p className="mt-1 text-xs text-slate-400">任务进度 {taskProgress}% · 时间进度 {timeProgress}%{progressIsAuto ? ' · 自动估算' : ''}</p>
      </div>
    </>
  );
}

export function PriorityMap({ tasks, onEditTask, onCompleteTask, onDeleteTask }: PriorityMapProps) {
  const [now, setNow] = useState(() => new Date());
  const positionedTasks = useMemo(() => tasks.map(getPositionedTask), [tasks]);
  const mobileClusters = useMemo(() => clusterPositionedTasks(positionedTasks), [positionedTasks]);
  const topTasks = useMemo(() => [...tasks].sort((left, right) => getUrgencyScore(right.deadline) + right.importance * 10 - getUrgencyScore(left.deadline) - left.importance * 10).slice(0, 5), [tasks]);
  const [hoverTaskId, setHoverTaskId] = useState<string | undefined>(undefined);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(undefined);
  const [selectedClusterId, setSelectedClusterId] = useState<string | undefined>(undefined);
  const hoverPositionedTask = positionedTasks.find(({ task }) => task.id === hoverTaskId);
  const selectedTask = positionedTasks.find(({ task }) => task.id === selectedTaskId)?.task;
  const selectedCluster = mobileClusters.find((cluster) => cluster.id === selectedClusterId);

  function closeTaskDetail() {
    setSelectedTaskId(undefined);
    setSelectedClusterId(undefined);
  }

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <section className="rounded-[1.5rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:rounded-[2rem] md:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">紧急重要矩阵</p>
          <h2 className="text-2xl font-bold text-slate-950">任务在时间和重要性中的位置</h2>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-2 text-right ring-1 ring-white/80">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">当前时间</p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-700">{formatCurrentTime(now)}</p>
        </div>
      </div>

      <div className="overflow-hidden pb-2">
        <div className="relative mx-auto aspect-square w-full max-w-[44rem] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50/80 to-sky-50/40 p-4 shadow-inner md:min-w-[34rem] md:rounded-[2rem] md:p-6">
          <div className="pointer-events-none absolute inset-x-16 bottom-16 top-16 border border-slate-300/80 bg-[linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:12.5%_12.5%]" />
          <div className="pointer-events-none absolute bottom-16 left-16 top-16 w-[calc(50%-4rem)] bg-sky-50/35" />
          <div className="pointer-events-none absolute bottom-16 right-16 top-16 w-[calc(50%-4rem)] bg-rose-50/30" />
          <div className="pointer-events-none absolute bottom-16 left-16 right-16 top-1/2 bg-white/55" />
          <div className="pointer-events-none absolute bottom-16 left-1/2 top-16 border-l border-slate-300/90" />
          <div className="pointer-events-none absolute left-16 right-16 top-1/2 border-t border-slate-300/90" />

          <div className="pointer-events-none absolute left-20 top-20 max-w-[35%] truncate text-xs font-semibold text-sky-700/75">II 重要但不紧急</div>
          <div className="pointer-events-none absolute right-20 top-20 max-w-[35%] truncate text-right text-xs font-semibold text-rose-700/75">I 紧急且重要</div>
          <div className="pointer-events-none absolute bottom-24 left-20 max-w-[35%] truncate text-xs font-semibold text-slate-500/80">III 不紧急且不重要</div>
          <div className="pointer-events-none absolute bottom-24 right-20 max-w-[35%] truncate text-right text-xs font-semibold text-amber-700/70">IV 紧急但不重要</div>

          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-center text-[11px] font-medium text-slate-400 [writing-mode:vertical-rl]">
            不紧急 / 时间出生线
          </div>
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-center text-[11px] font-medium text-rose-400 [writing-mode:vertical-rl]">
            非常紧急 / 时间死亡线
          </div>
          <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 text-[11px] font-medium text-rose-400">重要性高 / 重要性死亡线</div>
          <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 text-[11px] font-medium text-slate-400">重要性低 / 重要性出生线</div>

          {positionedTasks.length === 0 ? (
            <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 rounded-full bg-white/65 px-4 py-2 text-xs text-slate-400 ring-1 ring-white/70 backdrop-blur">
              添加任务后，圆点会从出生线向截止线移动。
            </div>
          ) : null}

          {positionedTasks.map((positionedTask) => {
            const { task, left, bottom } = positionedTask;
            const active = task.id === hoverTaskId || task.id === selectedTaskId;

            return (
              <button
                key={task.id}
                type="button"
                onClick={() => setSelectedTaskId(task.id)}
                onMouseEnter={() => setHoverTaskId(task.id)}
                onMouseLeave={() => setHoverTaskId(undefined)}
                onFocus={() => setHoverTaskId(task.id)}
                onBlur={() => setHoverTaskId(undefined)}
                className="group absolute z-10 hidden -translate-x-1/2 translate-y-1/2 text-left outline-none md:block"
                style={{ left: `${left}%`, bottom: `${bottom}%` }}
                aria-label={`查看任务 ${task.title}`}
              >
                <span
                  className={`block rounded-full border-4 shadow-md transition group-hover:scale-110 ${taskPointTone(task)} ${active ? 'scale-110 ring-4 ring-sky-100/80' : ''} ${isTaskActive(task) ? 'animate-task-breathe' : ''}`}
                  style={isTaskActive(task) ? { animationDuration: `${getPulseDuration(task)}s` } : undefined}
                />
                <span className={`absolute top-1/2 max-w-28 -translate-y-1/2 truncate rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-white/80 backdrop-blur group-hover:max-w-40 ${left > 78 ? 'right-6' : 'left-6'}`}>
                  {task.title}
                </span>
              </button>
            );
          })}

          <div className="md:hidden">
            {mobileClusters.map((cluster) => {
              const firstTask = cluster.tasks[0].task;
              return <button key={cluster.id} type="button" onClick={() => { setSelectedTaskId(firstTask.id); setSelectedClusterId(cluster.id); }} className="absolute z-10 -translate-x-1/2 translate-y-1/2 rounded-full border-4 border-white bg-slate-800 text-xs font-bold text-white shadow-md" style={{ left: `${cluster.left}%`, bottom: `${cluster.bottom}%`, width: cluster.tasks.length > 1 ? '2rem' : '1.25rem', height: cluster.tasks.length > 1 ? '2rem' : '1.25rem' }} aria-label={cluster.tasks.length > 1 ? `查看附近 ${cluster.tasks.length} 个任务` : `查看任务 ${firstTask.title}`}>{cluster.tasks.length > 1 ? cluster.tasks.length : ''}</button>;
            })}
          </div>

          {hoverPositionedTask && !selectedTask ? (
            <div className="pointer-events-none absolute z-20 hidden w-64 md:block rounded-2xl bg-white/90 p-3 shadow-xl shadow-slate-200/60 ring-1 ring-white/80 backdrop-blur" style={getHoverCardStyle(hoverPositionedTask)}>
              <p className="truncate text-sm font-bold text-slate-950">{hoverPositionedTask.task.title}</p>
              <p className="mt-2 text-xs text-slate-600">{formatCountdown(hoverPositionedTask.task.deadline)}</p>
              <p className="mt-2 rounded-xl bg-sky-50 px-2.5 py-1.5 text-xs text-sky-700">{getRecommendationReason(hoverPositionedTask.task)}</p>
              <div className="mt-2">
                <ProgressBar progress={getDisplayProgress(hoverPositionedTask.task)} compact />
                <p className="mt-1 text-xs text-slate-400">任务进度 {getTaskProgress(hoverPositionedTask.task)}% · 时间进度 {getTimeProgress(hoverPositionedTask.task)}%{isProgressAuto(hoverPositionedTask.task) ? ' · 自动估算' : ''}</p>
              </div>
            </div>
          ) : null}

          {selectedTask ? (
            <div className="absolute inset-0 z-30 flex items-end justify-center bg-slate-900/15 p-3 backdrop-blur-sm md:items-center md:p-6">
              <div className="max-h-[92%] w-full max-w-xl overflow-y-auto rounded-[2rem] bg-white/95 p-5 md:p-6 shadow-2xl shadow-slate-300/40 ring-1 ring-white/80 backdrop-blur">
                <div className="mb-4 flex justify-end">
                  <button
                    type="button"
                    onClick={closeTaskDetail}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                    aria-label="关闭任务详情"
                  >
                    关闭
                  </button>
                </div>
                {selectedCluster && selectedCluster.tasks.length > 1 ? <div className="mb-4 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100 md:hidden"><p className="text-xs font-semibold text-slate-500">附近 {selectedCluster.tasks.length} 个任务</p><div className="mt-2 flex flex-wrap gap-2">{selectedCluster.tasks.map(({ task }) => <button key={task.id} type="button" onClick={() => setSelectedTaskId(task.id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${selectedTask.id === task.id ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-100'}`}>{task.title}</button>)}</div></div> : null}
                <TaskDetailContent task={selectedTask} />
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  {onEditTask ? <button type="button" onClick={() => { closeTaskDetail(); onEditTask(selectedTask); }} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">编辑</button> : null}
                  {onCompleteTask ? <button type="button" onClick={() => { closeTaskDetail(); onCompleteTask(selectedTask); }} className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">完成</button> : null}
                  {onDeleteTask ? <button type="button" onClick={() => { closeTaskDetail(); onDeleteTask(selectedTask.id); }} className="rounded-full bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100">删除</button> : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-5 md:hidden"><h3 className="text-sm font-semibold text-slate-700">当前最值得关注的任务 Top 5</h3>{topTasks.length ? <ol className="mt-3 space-y-2">{topTasks.map((task, index) => <li key={task.id}><button type="button" onClick={() => setSelectedTaskId(task.id)} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-left ring-1 ring-slate-100"><span className="min-w-0 truncate text-sm font-medium text-slate-700">{index + 1}. {task.title}</span><span className="shrink-0 text-xs text-slate-400">重要性 {task.importance} · 紧急 {getUrgencyScore(task.deadline)}</span></button></li>)}</ol> : <p className="mt-3 rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">暂无进行中的任务。</p>}</div>
    </section>
  );
}
