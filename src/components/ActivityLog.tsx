import { useState } from 'react';
import type { Task } from '../types/task';
import { getActivityTypeLabel, getLifecycleStatusLabel } from '../utils/taskScoring';

interface ActivityLogProps {
  tasks: Task[];
  limit?: number;
  title?: string;
  onDelete?: (taskId: string) => void;
  onEdit?: (task: Task) => void;
  onRestore?: (task: Task) => void;
  onReviewNoteChange?: (taskId: string, reviewNote: string) => void;
}

type ArchiveGroup = { id: string; title: string; tasks: Task[]; defaultOpen?: boolean };

function logDate(task: Task): Date {
  return new Date(task.completedAt ?? task.abandonedAt ?? task.updatedAt);
}

function formatLogTime(value?: string): string {
  if (!value) return '未记录时间';
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function dateKey(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function weekKey(date: Date): string {
  const start = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return `${date.getFullYear()} 年第 ${week} 周`;
}

function monthKey(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(date);
}

function groupTasks(tasks: Task[], limit: number): ArchiveGroup[] {
  const now = new Date();
  const today: Task[] = [];
  const recentDays = new Map<string, Task[]>();
  const older = new Map<string, Task[]>();
  const source = Number.isFinite(limit) ? tasks.slice(0, limit) : tasks;

  source.forEach((task) => {
    const date = logDate(task);
    const ageDays = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86400000);
    if (ageDays <= 0) today.push(task);
    else if (ageDays <= 7) recentDays.set(dateKey(date), [...(recentDays.get(dateKey(date)) ?? []), task]);
    else if (ageDays <= 30) older.set(weekKey(date), [...(older.get(weekKey(date)) ?? []), task]);
    else older.set(monthKey(date), [...(older.get(monthKey(date)) ?? []), task]);
  });

  return [
    { id: 'today', title: '今天', tasks: today, defaultOpen: true },
    ...Array.from(recentDays, ([title, items]) => ({ id: `day-${title}`, title, tasks: items })),
    ...Array.from(older, ([title, items]) => ({ id: `older-${title}`, title, tasks: items })),
  ].filter((group) => group.tasks.length > 0);
}

// Future review module hook: these archive groups can be reused as selectable daily,
// weekly, monthly, or manual log context for AI-assisted reflection. No AI/API is called in v0.6.3.
export function ActivityLog({ tasks, limit = Number.POSITIVE_INFINITY, title = '归档日志', onDelete, onEdit, onRestore, onReviewNoteChange }: ActivityLogProps) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | undefined>();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ today: true });
  const archivedTasks = tasks.filter((task) => task.lifecycleStatus === 'completed' || task.lifecycleStatus === 'abandoned').sort((a, b) => logDate(b).getTime() - logDate(a).getTime());
  const groups = groupTasks(archivedTasks, limit);

  function confirmDelete(task: Task) {
    const shouldDelete = window.confirm(`删除归档记录「${task.title}」？此操作会从本地记录中移除。`);
    if (shouldDelete) onDelete?.(task.id);
  }

  function renderTask(task: Task) {
    const time = task.lifecycleStatus === 'completed' ? task.completedAt : task.abandonedAt;
    const isExpanded = expandedTaskId === task.id;
    return (
      <li key={task.id} className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-medium text-slate-900">{task.title}</h3><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500">{getLifecycleStatusLabel(task.lifecycleStatus)}</span><button type="button" onClick={() => setExpandedTaskId(isExpanded ? undefined : task.id)} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 shadow-sm hover:bg-slate-100">{isExpanded ? '收起' : '详情'}</button>{onEdit ? <button type="button" onClick={() => onEdit(task)} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-100">编辑</button> : null}{onRestore ? <button type="button" onClick={() => onRestore(task)} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-sky-600 shadow-sm hover:bg-sky-50">恢复为未完成</button> : null}{onDelete ? <button type="button" onClick={() => confirmDelete(task)} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-rose-500 shadow-sm hover:bg-rose-50">删除</button> : null}</div></div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500"><span className="rounded-full bg-white px-2.5 py-1">{getActivityTypeLabel(task.activityType)}</span><span className="rounded-full bg-white px-2.5 py-1">{formatLogTime(time)}</span></div>
        {task.reviewNote && !isExpanded ? <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">{task.reviewNote}</p> : null}
        {isExpanded ? <div className="mt-4 rounded-3xl bg-white/70 p-4 ring-1 ring-white/80"><label className="text-sm font-semibold text-slate-600" htmlFor={`review-note-${task.id}`}>数据记录</label><textarea id={`review-note-${task.id}`} value={task.reviewNote ?? ''} onChange={(event) => onReviewNoteChange?.(task.id, event.target.value)} className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm outline-none transition focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70" placeholder="写下这次完成或放弃后的观察。" /></div> : null}
      </li>
    );
  }

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-slate-500">生命日志</p><h2 className="text-2xl font-semibold text-slate-950">{title}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-500">{archivedTasks.length} 条</span></div>
      {groups.length === 0 ? <p className="mt-5 rounded-3xl bg-slate-50/80 p-5 text-sm text-slate-400">完成或放弃的项目会安静地留在这里，成为之后数据观察的材料。</p> : <div className="mt-5 space-y-3">{groups.map((group) => { const isOpen = openGroups[group.id] ?? group.defaultOpen ?? false; return <section key={group.id} className="rounded-3xl bg-white/60 p-3 ring-1 ring-white/80"><button type="button" onClick={() => setOpenGroups((value) => ({ ...value, [group.id]: !isOpen }))} className="flex w-full items-center justify-between rounded-2xl px-2 py-1 text-left"><span className="font-semibold text-slate-700">{group.title}</span><span className="text-xs text-slate-400">{group.tasks.length} 条 · {isOpen ? '收起' : '展开'}</span></button>{isOpen ? <ul className="mt-3 space-y-3">{group.tasks.map(renderTask)}</ul> : null}</section>; })}</div>}
    </section>
  );
}
