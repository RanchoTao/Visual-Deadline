import type { Achievement, AIArtifact, AIArtifactInput, PressureHistoryRecord, Task } from '../types/task';
import { ActivityLog } from './ActivityLog';
import { AIReviewPanel } from './AIReviewPanel';

interface LogPageProps {
  tasks: Task[];
  pressureHistory: PressureHistoryRecord[];
  achievements: Achievement[];
  aiArtifacts: AIArtifact[];
  onAIReportGenerated: (artifact: AIArtifactInput) => void;
  onDelete: (taskId: string) => void;
  onReviewNoteChange: (taskId: string, reviewNote: string) => void;
}

type TimelineEvent = {
  id: string;
  timestamp: string;
  type: 'ai' | 'pressure' | 'task' | 'achievement' | 'overdue' | 'emotion';
  title: string;
  body: string;
  tone: string;
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知时间';
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function getPressureMood(pressure: number): string {
  if (pressure > 100) return '爆表：系统进入高压记忆。';
  if (pressure >= 81) return '过载：生活正在压缩呼吸空间。';
  if (pressure >= 61) return '高压：注意力开始变窄。';
  if (pressure >= 31) return '可控：压力存在，但仍能被组织。';
  return '平稳：系统暂时有余裕。';
}

function buildTimelineEvents(tasks: Task[], pressureHistory: PressureHistoryRecord[], achievements: Achievement[], aiArtifacts: AIArtifact[]): TimelineEvent[] {
  const aiEvents: TimelineEvent[] = aiArtifacts.map((artifact) => ({
    id: `ai-${artifact.id}`,
    timestamp: artifact.createdAt,
    type: 'ai',
    title: artifact.title,
    body: `${artifact.content.slice(0, 180)}${artifact.content.length > 180 ? '…' : ''}`,
    tone: artifact.kind === 'goal-roadmap' ? 'bg-violet-50 text-violet-700 ring-violet-100' : 'bg-sky-50 text-sky-700 ring-sky-100',
  }));

  const pressureEvents: TimelineEvent[] = pressureHistory.flatMap((record) => {
    const events: TimelineEvent[] = [];
    if (record.eventType === 'recalibration') {
      events.push({ id: `pressure-recalibration-${record.id}`, timestamp: record.timestamp, type: 'pressure', title: '压力重新校准', body: record.note || `压力映射被重新写入，当前指数 ${record.pressure}。`, tone: 'bg-slate-50 text-slate-700 ring-slate-100' });
    }
    if (record.pressure > 100) {
      events.push({ id: `pressure-spike-${record.id}`, timestamp: record.timestamp, type: 'pressure', title: '压力爆表', body: `压力值 ${record.pressure}。这不是失败，是系统记录到的一次高压状态。`, tone: 'bg-rose-50 text-rose-700 ring-rose-100' });
    }
    return events;
  });

  const taskEvents: TimelineEvent[] = tasks.flatMap((task) => {
    const events: TimelineEvent[] = [];
    if (task.completedAt) events.push({ id: `task-completed-${task.id}`, timestamp: task.completedAt, type: 'task', title: '任务闭环', body: task.title, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' });
    if (task.abandonedAt) events.push({ id: `task-abandoned-${task.id}`, timestamp: task.abandonedAt, type: 'task', title: '任务放弃', body: task.title, tone: 'bg-slate-50 text-slate-600 ring-slate-100' });
    if (task.lifecycleStatus === 'active' && task.deadline && new Date(task.deadline).getTime() < Date.now()) {
      events.push({ id: `task-overdue-${task.id}`, timestamp: task.deadline, type: 'overdue', title: '逾期事件', body: task.title, tone: 'bg-amber-50 text-amber-700 ring-amber-100' });
    }
    return events;
  });

  const achievementEvents: TimelineEvent[] = achievements.map((achievement) => ({
    id: `achievement-${achievement.id}`,
    timestamp: achievement.unlockedAt,
    type: 'achievement',
    title: achievement.title,
    body: achievement.description,
    tone: 'bg-zinc-50 text-zinc-700 ring-zinc-100',
  }));

  const emotionalEvents: TimelineEvent[] = pressureHistory.slice(-12).map((record) => ({
    id: `emotion-${record.id}`,
    timestamp: record.timestamp,
    type: 'emotion',
    title: '情绪压力快照',
    body: getPressureMood(record.pressure),
    tone: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  }));

  return [...aiEvents, ...pressureEvents, ...taskEvents, ...achievementEvents, ...emotionalEvents]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 80);
}

function LifeTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">生命操作历史</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">Timeline</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">AI 报告、路线图、校准、闭环、逾期、成就和压力快照都会留在这里。VD 不把你的历史当作临时弹窗。</p>
        </div>
        <span className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-white/80">{events.length} 条记录</span>
      </div>

      {events.length === 0 ? (
        <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-white/65 p-8 text-center text-sm text-slate-400">系统还没有足够的历史。开始记录任务、校准压力或生成 AI 报告后，这里会变成你的生活操作史。</div>
      ) : (
        <ol className="mt-6 space-y-3">
          {events.map((event) => (
            <li key={event.id} className="grid gap-3 rounded-3xl bg-white/70 p-4 ring-1 ring-white/80 md:grid-cols-[9rem_1fr]">
              <time className="text-xs font-semibold text-slate-400">{formatTime(event.timestamp)}</time>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${event.tone}`}>{event.type}</span>
                  <h3 className="font-semibold text-slate-950">{event.title}</h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500 whitespace-pre-wrap">{event.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function LogPage({ tasks, pressureHistory, achievements, aiArtifacts, onAIReportGenerated, onDelete, onReviewNoteChange }: LogPageProps) {
  const timelineEvents = buildTimelineEvents(tasks, pressureHistory, achievements, aiArtifacts);

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
        <p className="text-sm font-semibold tracking-[0.24em] text-slate-400">复盘中心</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">复盘</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">这里是 VD 的生活操作史：不是临时弹窗，不是被删除的结果，而是你如何承受、推进、校准和恢复的历史。</p>
      </div>
      <LifeTimeline events={timelineEvents} />
      <AIReviewPanel tasks={tasks} pressureHistory={pressureHistory} onAIReportGenerated={onAIReportGenerated} />
      <ActivityLog tasks={tasks} limit={Infinity} title="任务归档 / 事件流" onDelete={onDelete} onReviewNoteChange={onReviewNoteChange} />
    </section>
  );
}
