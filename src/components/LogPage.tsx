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
        <p className="text-sm font-semibold tracking-[0.24em] text-slate-400">复盘中心</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">复盘</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">把任务变化与生命日志放在这里，用于主动回看、校准节奏，而不是制造压力。</p>
      </div>
      <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
        <p className="text-sm font-semibold text-slate-500">自动近期复盘</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">AI 复盘尚未启用</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">未来将基于任务、压力、社交变化与人生树结构，自动生成近期状态总结、风险提醒与调整建议。</p>
      </section>

      <ActivityLog tasks={tasks} limit={Infinity} title="生命日志 / 事件流" onDelete={onDelete} onReviewNoteChange={onReviewNoteChange} />
    </section>
  );
}
