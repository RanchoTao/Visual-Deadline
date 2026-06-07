import { useMemo, useState, type ReactNode } from 'react';
import type { Achievement, AIArtifact, AIArtifactInput, Goal, PressureBreakdown, PressureHistoryRecord, Task, TaskInput, UserProfile } from '../types/task';
import { calculateAverageCompletionLeadHours, calculateAverageDailyPressure, calculateAverageImportance, calculateCategoryDistribution, calculateCompletionRate, calculateConsecutiveUsageDays, calculateDailyCompletionHeatmap, calculateDeadlineSurvivalRatio, calculateGoalProgress, calculateLastMinuteCompletionRatio, countAbandonedTasks, countCompletedTasks, countOverdueTasks, getCurrentLifeFocus, getLatestAIInsight } from '../lib/analytics/lifeStats';
import { analyzeBehavior } from '../lib/behavior/behaviorAnalytics';
import { calculateBMI, getHealthReadiness } from '../lib/health/healthMetrics';
import { buildPressureHistogram, calculateContinuousOverloadDays, calculateOverloadFrequency, calculatePressureVolatility, calculateRecoverySpeed, getPressureInsight } from '../lib/pressure/pressureAnalytics';
import { parseTaskIntakeResponse } from '../services/taskIntakePrompt';
import { getActivityTypeLabel } from '../utils/taskScoring';
import { ActivityLog } from './ActivityLog';
import { AIReviewPanel } from './AIReviewPanel';

interface DataCenterProps {
  tasks: Task[];
  goals: Goal[];
  profile: UserProfile;
  pressure: PressureBreakdown;
  pressureHistory: PressureHistoryRecord[];
  achievements: Achievement[];
  aiArtifacts: AIArtifact[];
  onAIReportGenerated: (artifact: AIArtifactInput) => void;
  onRecalculatePressureHistory: () => void;
  onDelete: (taskId: string) => void;
  onEdit: (task: Task) => void;
  onRestore: (task: Task) => void;
  onReviewNoteChange: (taskId: string, reviewNote: string) => void;
}

type DataTab = 'overview' | 'tasks' | 'pressure' | 'life' | 'health' | 'trends' | 'ai';
type TimelineEventType = 'weekly' | 'ai' | 'roadmap' | 'pressure' | 'task' | 'achievement' | 'overdue' | 'emotion' | 'manual' | 'behavior';
type TimelineEvent = { id: string; timestamp: string; type: TimelineEventType; title: string; body: string; tone: string; hiddenByDefault?: boolean; duplicateCount?: number };

const tabs: { id: DataTab; label: string; description: string }[] = [
  { id: 'overview', label: '总览', description: '生命状态总览' },
  { id: 'tasks', label: '任务', description: '执行模式' },
  { id: 'pressure', label: '压力', description: '压力核心' },
  { id: 'life', label: '人生', description: '人生结构' },
  { id: 'health', label: '健康', description: '健康准备' },
  { id: 'trends', label: '趋势', description: '长期演化' },
  { id: 'ai', label: 'AI 洞察', description: '第三人称观察' },
];


const eventTypeLabels: Record<TimelineEvent['type'], string> = {
  weekly: '周总结',
  ai: 'AI 报告',
  roadmap: '路线图',
  pressure: '重要状态',
  task: '任务',
  achievement: '成就',
  overdue: '逾期',
  emotion: '情绪',
  manual: '手动保存',
  behavior: '行为信号',
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知时间';
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function localizeVisibleText(text: string): string {
  return text
    .replace(/\bdeadlines\b/gi, '截止时间')
    .replace(/\bdeadline\b/gi, '截止时间')
    .replace(/\bsnapshots\b/gi, '快照')
    .replace(/\bsnapshot\b/gi, '快照')
    .replace(/\barchives\b/gi, '档案')
    .replace(/\barchive\b/gi, '档案')
    .replace(/\breports\b/gi, '报告')
    .replace(/\breport\b/gi, '报告')
    .replace(/\bstatuses\b/gi, '状态')
    .replace(/\bstatus\b/gi, '状态')
    .replace(/\bgoals\b/gi, '目标')
    .replace(/\bgoal\b/gi, '目标')
    .replace(/\btasks\b/gi, '任务')
    .replace(/\btask\b/gi, '任务');
}

function getPressureMood(pressure: number): string {
  if (pressure > 100) return '爆表：系统进入高压记忆。';
  if (pressure >= 81) return '过载：生活正在压缩呼吸空间。';
  if (pressure >= 61) return '高压：注意力开始变窄。';
  if (pressure >= 31) return '可控：压力存在，但仍能被组织。';
  return '平稳：系统暂时有余裕。';
}

function formatDeadline(deadline?: string): string {
  if (!deadline) return '未设置';
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return '未设置';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function getTaskIntakeDrafts(artifact: AIArtifact): { drafts?: TaskInput[]; notes?: string; error?: string } {
  try {
    const result = parseTaskIntakeResponse(artifact.content);
    return { drafts: result.tasks, notes: result.notes };
  } catch {
    return { error: '草稿解析失败，请重新生成' };
  }
}

function getAIArtifactSummary(artifact: AIArtifact): string {
  if (artifact.kind !== 'task-intake') return localizeVisibleText(`${artifact.content.slice(0, 180)}${artifact.content.length > 180 ? '…' : ''}`);
  const result = getTaskIntakeDrafts(artifact);
  if (result.error) return result.error;
  if (!result.drafts?.length) return localizeVisibleText(result.notes || '没有识别到明确任务。');
  return localizeVisibleText(`整理出 ${result.drafts.length} 个任务草稿：${result.drafts.slice(0, 3).map((draft) => draft.title).join('、')}${result.drafts.length > 3 ? '…' : ''}`);
}

function AIArtifactCard({ artifact }: { artifact: AIArtifact }) {
  const taskIntakeResult = artifact.kind === 'task-intake' ? getTaskIntakeDrafts(artifact) : undefined;
  return <article className="rounded-3xl bg-white/75 p-4 ring-1 ring-white/80">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-950">{localizeVisibleText(artifact.title)}</h3><time className="text-xs text-slate-400">{formatTime(artifact.createdAt)}</time></div>
    {taskIntakeResult ? taskIntakeResult.error ? <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600 ring-1 ring-rose-100">{taskIntakeResult.error}</p> : <div className="mt-3 grid gap-3 md:grid-cols-2">
      {taskIntakeResult.notes ? <p className="text-sm leading-6 text-slate-500 md:col-span-2">{localizeVisibleText(taskIntakeResult.notes)}</p> : null}
      {taskIntakeResult.drafts?.length ? taskIntakeResult.drafts.map((draft, index) => <section key={`${draft.title}-${index}`} className="min-w-0 rounded-2xl bg-slate-50/80 p-3 ring-1 ring-slate-100">
        <h4 className="font-semibold text-slate-900">{localizeVisibleText(draft.title)}</h4>
        {draft.description ? <p className="mt-2 text-sm leading-6 text-slate-500">{localizeVisibleText(draft.description)}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500"><span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-100">重要性 {draft.importance}/10</span><span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-100">截止 {formatDeadline(draft.deadline)}</span></div>
        {draft.decomposition?.length ? <div className="mt-3"><p className="text-xs font-semibold text-slate-500">拆解步骤</p><ul className="mt-1 space-y-1 text-xs leading-5 text-slate-500">{draft.decomposition.slice(0, 5).map((item) => <li key={item}>· {localizeVisibleText(item)}</li>)}</ul></div> : null}
      </section>) : <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-400 md:col-span-2">没有识别到明确任务。</p>}
    </div> : <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{localizeVisibleText(artifact.content.slice(0, 360))}{artifact.content.length > 360 ? '…' : ''}</p>}
  </article>;
}

const DEDUPE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function toTimestamp(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getArtifactTimelineType(kind: AIArtifact['kind']): TimelineEvent['type'] {
  if (kind === 'goal-roadmap') return 'roadmap';
  if (kind === 'task-intake' || kind === 'recommendation') return 'behavior';
  return 'ai';
}

function getArtifactTone(kind: AIArtifact['kind']): string {
  if (kind === 'goal-roadmap') return 'bg-violet-50 text-violet-700 ring-violet-100';
  if (kind === 'task-intake' || kind === 'recommendation') return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
  return 'bg-sky-50 text-sky-700 ring-sky-100';
}

function buildWeeklySummaryEvent(tasks: Task[], pressureHistory: PressureHistoryRecord[], aiArtifacts: AIArtifact[]): TimelineEvent | undefined {
  const latestTimes = [
    ...tasks.map((task) => toTimestamp(task.completedAt ?? task.abandonedAt ?? task.updatedAt)),
    ...pressureHistory.map((record) => toTimestamp(record.timestamp)),
    ...aiArtifacts.map((artifact) => toTimestamp(artifact.createdAt)),
  ].filter(Boolean);
  if (latestTimes.length === 0) return undefined;

  const now = new Date(Math.max(...latestTimes));
  const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const completed = tasks.filter((task) => task.completedAt && toTimestamp(task.completedAt) >= weekStart).length;
  const abandoned = tasks.filter((task) => task.abandonedAt && toTimestamp(task.abandonedAt) >= weekStart).length;
  const highPressure = pressureHistory.filter((record) => toTimestamp(record.timestamp) >= weekStart && record.pressure >= 81).length;
  const aiCount = aiArtifacts.filter((artifact) => toTimestamp(artifact.createdAt) >= weekStart).length;
  if (completed + abandoned + highPressure + aiCount === 0) return undefined;

  return {
    id: `weekly-${now.toISOString().slice(0, 10)}`,
    timestamp: now.toISOString(),
    type: 'weekly',
    title: '近七日状态摘要',
    body: `本周完成 ${completed} 项，放弃 ${abandoned} 项，出现 ${highPressure} 次高压/过载记录，新增 ${aiCount} 条 AI 观察。`,
    tone: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  };
}

function buildPressureEvents(pressureHistory: PressureHistoryRecord[]): TimelineEvent[] {
  const sorted = [...pressureHistory].sort((left, right) => toTimestamp(left.timestamp) - toTimestamp(right.timestamp));
  const events: TimelineEvent[] = [];
  let previousMood = sorted[0] ? getPressureMood(sorted[0].pressure) : undefined;

  sorted.forEach((record, index) => {
    if (record.eventType === 'recalibration') {
      events.push({ id: `pressure-recalibration-${record.id}`, timestamp: record.timestamp, type: 'pressure', title: '压力重新校准', body: localizeVisibleText(record.note || `压力映射被重新写入，当前指数 ${record.pressure}。`), tone: 'bg-slate-50 text-slate-700 ring-slate-100' });
      return;
    }

    if (record.eventType === 'manual') {
      events.push({ id: `pressure-manual-${record.id}`, timestamp: record.timestamp, type: 'manual', title: '用户手动保存状态', body: localizeVisibleText(record.note || `手动记录压力指数 ${record.pressure}。`), tone: 'bg-zinc-50 text-zinc-700 ring-zinc-100' });
      return;
    }

    if (record.pressure > 100) {
      events.push({ id: `pressure-spike-${record.id}`, timestamp: record.timestamp, type: 'pressure', title: '压力爆表', body: `压力值 ${record.pressure}。这不是失败，是系统记录到的一次高压状态。`, tone: 'bg-rose-50 text-rose-700 ring-rose-100' });
      previousMood = getPressureMood(record.pressure);
      return;
    }

    const mood = getPressureMood(record.pressure);
    if (index > 0 && previousMood && mood !== previousMood) {
      events.push({ id: `pressure-state-${record.id}`, timestamp: record.timestamp, type: 'pressure', title: '压力状态变化', body: `${previousMood} → ${mood}`, tone: 'bg-amber-50 text-amber-700 ring-amber-100' });
    }
    previousMood = mood;
  });

  return events;
}

function foldRepeatedEvents(events: TimelineEvent[]): TimelineEvent[] {
  const sorted = [...events].sort((left, right) => toTimestamp(right.timestamp) - toTimestamp(left.timestamp));
  const visibleKeys = new Map<string, TimelineEvent>();

  return sorted.map((event) => {
    const key = `${event.type}|${event.title}|${event.body}`;
    const latest = visibleKeys.get(key);
    if (latest && Math.abs(toTimestamp(latest.timestamp) - toTimestamp(event.timestamp)) <= DEDUPE_WINDOW_MS) {
      latest.duplicateCount = (latest.duplicateCount ?? 1) + 1;
      return { ...event, hiddenByDefault: true };
    }
    visibleKeys.set(key, event);
    return event;
  });
}

function buildTimelineEvents(tasks: Task[], pressureHistory: PressureHistoryRecord[], achievements: Achievement[], aiArtifacts: AIArtifact[]): TimelineEvent[] {
  const weeklyEvent = buildWeeklySummaryEvent(tasks, pressureHistory, aiArtifacts);
  const aiEvents: TimelineEvent[] = aiArtifacts.map((artifact) => ({ id: `ai-${artifact.id}`, timestamp: artifact.createdAt, type: getArtifactTimelineType(artifact.kind), title: localizeVisibleText(artifact.title), body: getAIArtifactSummary(artifact), tone: getArtifactTone(artifact.kind) }));
  const pressureEvents = buildPressureEvents(pressureHistory);
  const taskEvents: TimelineEvent[] = tasks.flatMap((task) => {
    const events: TimelineEvent[] = [];
    const taskName = localizeVisibleText(task.title);
    if (task.reviewNote?.trim()) events.push({ id: `task-manual-${task.id}`, timestamp: task.completedAt ?? task.abandonedAt ?? task.updatedAt, type: 'manual', title: '用户手动保存档案', body: `${taskName}：${localizeVisibleText(task.reviewNote)}`, tone: 'bg-zinc-50 text-zinc-700 ring-zinc-100' });
    else if (task.completedAt && task.importance >= 8) events.push({ id: `task-completed-${task.id}`, timestamp: task.completedAt, type: 'behavior', title: '关键任务闭环', body: taskName, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' });
    if (task.abandonedAt) events.push({ id: `task-abandoned-${task.id}`, timestamp: task.abandonedAt, type: 'behavior', title: '任务中止信号', body: taskName, tone: 'bg-slate-50 text-slate-600 ring-slate-100' });
    if (task.lifecycleStatus === 'active' && task.deadline && new Date(task.deadline).getTime() < Date.now() && task.importance >= 7) events.push({ id: `task-overdue-${task.id}`, timestamp: task.deadline, type: 'overdue', title: '重要任务逾期', body: taskName, tone: 'bg-amber-50 text-amber-700 ring-amber-100' });
    return events;
  });
  const achievementEvents: TimelineEvent[] = achievements.map((achievement) => ({ id: `achievement-${achievement.id}`, timestamp: achievement.unlockedAt, type: 'achievement', title: localizeVisibleText(achievement.title), body: localizeVisibleText(achievement.shortDescription), tone: 'bg-zinc-50 text-zinc-700 ring-zinc-100' }));
  const emotionalEvents: TimelineEvent[] = pressureHistory.map((record) => ({ id: `emotion-${record.id}`, timestamp: record.timestamp, type: 'emotion', title: '折叠的情绪压力记录', body: getPressureMood(record.pressure), tone: 'bg-indigo-50 text-indigo-700 ring-indigo-100', hiddenByDefault: true }));
  return foldRepeatedEvents([weeklyEvent, ...aiEvents, ...pressureEvents, ...taskEvents, ...achievementEvents, ...emotionalEvents].filter((event): event is TimelineEvent => Boolean(event))).slice(0, 120);
}

function StatCard({ label, value, detail, tone = 'from-white to-slate-50' }: { label: string; value: string | number; detail: string; tone?: string }) {
  return <article className={`rounded-[1.75rem] bg-gradient-to-br ${tone} p-5 shadow-sm ring-1 ring-white/80`}><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p><p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p></article>;
}

function SectionShell({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return <section className="rounded-[2rem] border border-white/70 bg-white/72 p-5 shadow-xl shadow-slate-200/50 backdrop-blur md:p-6"><p className="text-sm font-semibold text-slate-500">{eyebrow}</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{title}</h2><div className="mt-5">{children}</div></section>;
}

function TinyBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return <div className="flex h-24 items-end gap-1 rounded-3xl bg-slate-50/80 p-3 ring-1 ring-white/80">{values.map((value, index) => <span key={`${value}-${index}`} className="flex-1 rounded-t-full bg-slate-700/70" style={{ height: `${Math.max(6, (value / max) * 100)}%` }} />)}</div>;
}

function Heatmap({ values }: { values: { date: string; count: number }[] }) {
  const max = Math.max(1, ...values.map((item) => item.count));
  return <div className="grid grid-cols-14 gap-1 rounded-3xl bg-slate-50/80 p-3 ring-1 ring-white/80">{values.map((item) => <span key={item.date} title={`${item.date}: ${item.count}`} className="aspect-square rounded-md" style={{ backgroundColor: `rgba(15, 23, 42, ${0.08 + (item.count / max) * 0.62})` }} />)}</div>;
}

function LifeTimeline({ events }: { events: TimelineEvent[] }) {
  const [showAllHistory, setShowAllHistory] = useState(false);
  const visibleEvents = showAllHistory ? events : events.filter((event) => !event.hiddenByDefault);
  const hiddenCount = events.length - visibleEvents.length;

  return <SectionShell eyebrow="档案" title="长期人类状态档案"><p className="max-w-2xl text-sm leading-6 text-slate-500">这里只保留有信息增量的记录：周总结、重要状态变化、关键行为信号、AI 分析、目标路线图更新和用户手动保存的档案。低价值重复记录默认折叠，不再用连续压力记录刷屏。</p>{events.length === 0 ? <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-white/65 p-8 text-center text-sm text-slate-400">系统还没有足够的历史。开始记录任务、校准压力或生成 AI 分析后，这里会变成你的生活状态档案。</div> : <><div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50/80 px-4 py-3 text-xs text-slate-500 ring-1 ring-white/80"><span>已隐藏 {hiddenCount} 条重复或低信息量记录。</span>{hiddenCount > 0 ? <button type="button" onClick={() => setShowAllHistory((value) => !value)} className="rounded-full bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm hover:bg-slate-100">{showAllHistory ? '收起低价值历史' : '展开全部历史'}</button> : null}</div><ol className="mt-6 space-y-3">{visibleEvents.map((event) => <li key={event.id} className={`grid gap-3 rounded-3xl bg-white/70 p-4 ring-1 ring-white/80 md:grid-cols-[9rem_1fr] ${event.hiddenByDefault ? 'opacity-75' : ''}`}><time className="text-xs font-semibold text-slate-400">{formatTime(event.timestamp)}</time><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${event.tone}`}>{eventTypeLabels[event.type]}</span><h3 className="font-semibold text-slate-950">{event.title}</h3>{event.duplicateCount && event.duplicateCount > 1 ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-400">已合并 {event.duplicateCount} 条</span> : null}</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{event.body}</p></div></li>)}</ol></>}</SectionShell>;
}

export function LogPage({ tasks, goals, profile, pressure, pressureHistory, achievements, aiArtifacts, onAIReportGenerated, onRecalculatePressureHistory, onDelete, onEdit, onRestore, onReviewNoteChange }: DataCenterProps) {
  const [activeTab, setActiveTab] = useState<DataTab>('overview');
  const behavior = useMemo(() => analyzeBehavior(tasks), [tasks]);
  const timelineEvents = useMemo(() => buildTimelineEvents(tasks, pressureHistory, achievements, aiArtifacts), [achievements, aiArtifacts, pressureHistory, tasks]);
  const completedCount = countCompletedTasks(tasks);
  const overdueCount = countOverdueTasks(tasks);
  const abandonedCount = countAbandonedTasks(tasks);
  const avgPressure = calculateAverageDailyPressure(pressureHistory);
  const usageStreak = calculateConsecutiveUsageDays(pressureHistory);
  const goalProgress = calculateGoalProgress(goals, tasks);
  const heatmap = calculateDailyCompletionHeatmap(tasks);
  const categoryDistribution = calculateCategoryDistribution(tasks);
  const histogram = buildPressureHistogram(pressureHistory);
  const bmi = calculateBMI(profile);

  return <section className="space-y-6">
    <header className="overflow-hidden rounded-[2.5rem] border border-white/70 bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_34%),linear-gradient(135deg,#ffffff,#f8fafc_48%,#eef2ff)] p-6 shadow-xl shadow-slate-200/60 backdrop-blur md:p-8">
      <p className="text-sm font-semibold tracking-[0.24em] text-slate-400">数据</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">数据</h1>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-500">一个生命状态观测站：追踪你如何工作、如何崩溃、如何恢复、如何演化。VD 不把统计当作后台表格，而把它们当作行为镜像。</p>
      <div className="mt-5 flex flex-wrap gap-2 rounded-[1.5rem] bg-white/60 p-1 ring-1 ring-white/80 md:mt-6">
        {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`min-h-11 flex-1 rounded-full px-3 py-2 text-left text-xs font-semibold transition sm:flex-none sm:px-4 ${activeTab === tab.id ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:bg-white/80 hover:text-slate-800'}`}><span className="block">{tab.label}</span><span className="block text-[10px] opacity-70">{tab.description}</span></button>)}
      </div>
    </header>

    {activeTab === 'overview' ? <section className="space-y-6"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><StatCard label="已完成" value={completedCount} detail="累计闭环任务。" tone="from-emerald-50 to-white" /><StatCard label="压力" value={pressure.displayPressure} detail={`当前状态：${pressure.label}`} tone="from-rose-50 to-white" /><StatCard label="七日均值" value={avgPressure} detail="近 7 天平均压力。" tone="from-sky-50 to-white" /><StatCard label="连续记录" value={`${usageStreak} 天`} detail="连续使用 VD 的天数。" tone="from-violet-50 to-white" /></div><SectionShell eyebrow="行为状态" title="当前行为状态"><div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"><div className="rounded-3xl bg-slate-50/80 p-5 ring-1 ring-white/80"><p className="text-2xl font-semibold text-slate-950">{behavior.currentState}</p><p className="mt-3 text-sm leading-6 text-slate-500">{getLatestAIInsight(aiArtifacts)}</p></div><div className="grid gap-3 sm:grid-cols-2"><StatCard label="生活重心" value={getCurrentLifeFocus(tasks)} detail="当前生活重心。" /><StatCard label="目标进度" value={`${goalProgress}%`} detail="长期目标关联任务推进度。" /></div></div></SectionShell><LifeTimeline events={timelineEvents.slice(0, 12)} /></section> : null}

    {activeTab === 'tasks' ? <section className="space-y-6"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><StatCard label="已完成" value={completedCount} detail="总完成任务。" /><StatCard label="已逾期" value={overdueCount} detail="当前逾期任务。" tone="from-amber-50 to-white" /><StatCard label="已放弃" value={abandonedCount} detail="主动放弃或中止。" /><StatCard label="完成率" value={`${calculateCompletionRate(tasks)}%`} detail="已解决事项中的完成率。" /></div><SectionShell eyebrow="执行模式" title="行为执行模式"><div className="grid gap-4 lg:grid-cols-2"><div className="space-y-3 rounded-3xl bg-white/70 p-5 ring-1 ring-white/80"><p>平均在截止前 <b>{calculateAverageCompletionLeadHours(tasks)}</b> 小时完成任务。</p><p><b>{calculateLastMinuteCompletionRatio(tasks)}%</b> 的任务在最后一小时内完成。</p><p>截止存活率：<b>{calculateDeadlineSurvivalRatio(tasks)}%</b></p><p>平均重要性：<b>{calculateAverageImportance(tasks)}</b>/10</p></div><div className="grid gap-3 sm:grid-cols-2"><StatCard label="拖延倾向" value={behavior.procrastinationTendency} detail="基于逾期与最后一小时完成比例。" /><StatCard label="执行稳定性" value={behavior.executionConsistency} detail="基于完成率与任务状态。" /><StatCard label="截止依赖" value={behavior.urgencyDependence} detail="是否依赖截止时间启动。" /><StatCard label="爆发推进" value={behavior.burstProductivityTendency} detail="是否呈现短周期集中完成。" /></div></div><div className="mt-5"><Heatmap values={heatmap} /></div></SectionShell><ActivityLog tasks={tasks} limit={Infinity} title="任务归档 / 事件流" onDelete={onDelete} onEdit={onEdit} onRestore={onRestore} onReviewNoteChange={onReviewNoteChange} /></section> : null}

    {activeTab === 'pressure' ? <section className="space-y-6"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><StatCard label="实时压力" value={pressure.displayPressure} detail={pressure.recommendation} tone="from-rose-50 to-white" /><StatCard label="波动性" value={calculatePressureVolatility(pressureHistory)} detail="压力标准差估计。" /><StatCard label="高压占比" value={`${calculateOverloadFrequency(pressureHistory)}%`} detail="高压/过载记录占比。" /><StatCard label="连续高压" value={`${calculateContinuousOverloadDays(pressureHistory)} 天`} detail="连续过载天数。" /></div><SectionShell eyebrow="压力核心" title="压力监控系统"><div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/70 p-3 ring-1 ring-white/80"><p className="text-sm leading-6 text-slate-500">仅清理可识别的任务推导点；手动记录和无来源老数据会保留。</p><button type="button" onClick={onRecalculatePressureHistory} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">重算压力曲线 / 清理异常点</button></div><div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]"><TinyBars values={pressureHistory.slice(-24).map((record) => record.pressure)} /><div className="rounded-3xl bg-slate-50/80 p-5 ring-1 ring-white/80"><p className="font-semibold text-slate-950">{getPressureInsight(pressureHistory)}</p><p className="mt-3 text-sm text-slate-500">恢复速度：{calculateRecoverySpeed(pressureHistory)}</p><p className="mt-2 text-sm text-slate-500">分布：[0-30, 31-60, 61-80, 81-100, 100+] = {histogram.join(' / ')}</p></div></div></SectionShell><LifeTimeline events={timelineEvents.filter((event) => event.type === 'pressure' || event.type === 'emotion').slice(0, 20)} /></section> : null}

    {activeTab === 'life' ? <section className="space-y-6"><SectionShell eyebrow="人生结构" title="人生结构分布"><div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]"><div className="space-y-3">{categoryDistribution.map((item) => <div key={item.category} className="rounded-2xl bg-white/75 p-3 ring-1 ring-white/80"><div className="flex justify-between text-sm font-semibold text-slate-600"><span>{getActivityTypeLabel(item.category)}</span><span>{item.ratio}%</span></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-800" style={{ width: `${item.ratio}%` }} /></div></div>)}</div><div className="rounded-3xl bg-slate-50/80 p-5 ring-1 ring-white/80"><p className="text-xl font-semibold text-slate-950">当前人生重心：{getCurrentLifeFocus(tasks)}</p><p className="mt-3 text-sm leading-6 text-slate-500">娱乐比例、自我维护比例、社交活动趋势与长期目标推进会在这里持续沉淀。VD 会观察偏移、忽视、过度聚焦和结构失衡。</p><p className="mt-4 text-sm font-semibold text-slate-700">长期目标进度：{goalProgress}%</p></div></div></SectionShell></section> : null}

    {activeTab === 'health' ? <section className="space-y-6"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><StatCard label="身高" value={profile.height || '未记录'} detail="基础身体数据。" /><StatCard label="体重" value={profile.weight || '未记录'} detail="基础身体数据。" /><StatCard label="身体指数" value={bmi ?? '等待'} detail={getHealthReadiness(profile)} /><StatCard label="恢复状态" value="待接入" detail="睡眠、心率变异性、静息心率、恢复分。" /></div><SectionShell eyebrow="健康整合" title="轻量健康系统"><p className="text-sm leading-7 text-slate-500">这里预留苹果健康、运动平台、智能穿戴等未来集成。VD 会把睡眠、运动、恢复、久坐、深夜活动与压力曲线放在同一个人类状态模型里。</p><div className="mt-5 grid gap-3 md:grid-cols-3"><StatCard label="运动" value="待接入" detail="跑量、训练时长、热量、最大摄氧量。" /><StatCard label="睡眠" value="待接入" detail="睡眠时长、一致性、深夜活动。" /><StatCard label="风险" value="观察中" detail="高压力与低恢复的组合风险。" /></div></SectionShell></section> : null}

    {activeTab === 'trends' ? <section className="space-y-6"><SectionShell eyebrow="长期视角" title="长期趋势系统"><div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]"><TinyBars values={pressureHistory.slice(-36).map((record) => record.pressure)} /><div className="space-y-3"><StatCard label="本月高压天数" value={calculateContinuousOverloadDays(pressureHistory)} detail="当前连续样本，未来扩展为月度统计。" /><StatCard label="执行演化" value={behavior.executionConsistency} detail="过去行为形成的稳定性判断。" /></div></div><p className="mt-5 text-sm leading-7 text-slate-500">这里将扩展为月度演化、季节性变化、年度回顾、习惯一致性、压力演化、执行演化与健康演化。</p></SectionShell></section> : null}

    {activeTab === 'ai' ? <section className="space-y-6"><SectionShell eyebrow="AI 洞察" title="第三人称行为观察"><p className="text-sm leading-7 text-slate-500">AI 不负责鼓励你。它负责观察：压力模式、行为倾向、恢复速度、长期任务稳定性、风险和节奏建议。</p><div className="mt-5 grid gap-3">{aiArtifacts.length ? aiArtifacts.slice(0, 8).map((artifact) => <AIArtifactCard key={artifact.id} artifact={artifact} />) : <div className="rounded-3xl border border-dashed border-slate-200 bg-white/65 p-8 text-center text-sm text-slate-400">尚未生成 AI 洞察。完成一次任务整理或行为分析后，这里会展示可读摘要。</div>}</div></SectionShell><AIReviewPanel tasks={tasks} pressureHistory={pressureHistory} onAIReportGenerated={onAIReportGenerated} /></section> : null}
  </section>;
}
