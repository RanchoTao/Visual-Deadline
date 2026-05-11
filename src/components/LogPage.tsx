import type { Task } from '../types/task';
import { ActivityLog } from './ActivityLog';

interface LogPageProps {
  tasks: Task[];
  onDelete: (taskId: string) => void;
  onReviewNoteChange: (taskId: string, reviewNote: string) => void;
}

export function LogPage({ tasks, onDelete, onReviewNoteChange }: LogPageProps) {
  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Log</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">日志</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">完成与放弃的项目会在这里形成更完整的本地记录，用于复盘节奏，而不是制造压力。</p>
      </div>
      <ActivityLog tasks={tasks} limit={Infinity} title="全部归档" onDelete={onDelete} onReviewNoteChange={onReviewNoteChange} />
    </section>
  );
}
