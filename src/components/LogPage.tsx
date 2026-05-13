import type { PressureHistoryRecord, Task } from '../types/task';
import { ActivityLog } from './ActivityLog';
import { AIReviewPanel } from './AIReviewPanel';

interface LogPageProps {
  tasks: Task[];
  pressureHistory: PressureHistoryRecord[];
  onDelete: (taskId: string) => void;
  onReviewNoteChange: (taskId: string, reviewNote: string) => void;
}

export function LogPage({ tasks, pressureHistory, onDelete, onReviewNoteChange }: LogPageProps) {
  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
        <p className="text-sm font-semibold tracking-[0.24em] text-slate-400">复盘中心</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">复盘</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">把任务变化与生命日志放在这里，用于主动回看、校准节奏，而不是制造压力。</p>
      </div>
      <AIReviewPanel tasks={tasks} pressureHistory={pressureHistory} />

      <ActivityLog tasks={tasks} limit={Infinity} title="生命日志 / 事件流" onDelete={onDelete} onReviewNoteChange={onReviewNoteChange} />
    </section>
  );
}
