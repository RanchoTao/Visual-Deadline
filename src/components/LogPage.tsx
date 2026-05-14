import { useMemo, useState, type ReactNode } from 'react';
import type { Achievement, AIArtifact, AIArtifactInput, Goal, PressureBreakdown, PressureHistoryRecord, Task, UserProfile } from '../types/task';
import { calculateAverageCompletionLeadHours, calculateAverageDailyPressure, calculateAverageImportance, calculateCategoryDistribution, calculateCompletionRate, calculateConsecutiveUsageDays, calculateDailyCompletionHeatmap, calculateDeadlineSurvivalRatio, calculateGoalProgress, calculateLastMinuteCompletionRatio, countAbandonedTasks, countCompletedTasks, countOverdueTasks, getCurrentLifeFocus, getLatestAIInsight } from '../lib/analytics/lifeStats';
import { analyzeBehavior } from '../lib/behavior/behaviorAnalytics';
import { calculateBMI, getHealthReadiness } from '../lib/health/healthMetrics';
import { buildPressureHistogram, calculateContinuousOverloadDays, calculateOverloadFrequency, calculatePressureVolatility, calculateRecoverySpeed, getPressureInsight } from '../lib/pressure/pressureAnalytics';
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
  onDelete: (taskId: string) => void;
  onReviewNoteChange: (taskId: string, reviewNote: string) => void;
}

type DataTab = 'overview' | 'tasks' | 'pressure' | 'life' | 'health' | 'trends' | 'ai';
type TimelineEvent = { id: string; timestamp: string; type: 'ai' | 'pressure' | 'task' | 'achievement' | 'overdue' | 'emotion'; title: string; body: string; tone: string };

const tabs: { id: DataTab; label: string; description: string }[] = [
  { id: 'overview', label: 'Overview', description: '生命状态总览' },
  { id: 'tasks', label: 'Tasks', description: '执行模式' },
  { id: 'pressure', label: 'Pressure', description: '压力核心' },
  { id: 'life', label: 'Life', description: '人生结构' },
  { id: 'health', label: 'Health', description: '健康准备' },
  { id: 'trends', label: 'Trends', description: '长期演化' },
  { id: 'ai', label: 'AI Insights', description: '第三人称观察' },
];

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
  const aiEvents: TimelineEvent[] = aiArtifacts.map((artifact) => ({ id: `ai-${artifact.id}`, timestamp: artifact.createdAt, type: 'ai', title: artifact.title, body: `${artifact.content.slice(0, 180)}${artifact.content.length > 180 ? '…' : ''}`, tone: artifact.kind === 'goal-roadmap' ? 'bg-violet-50 text-violet-700 ring-violet-100' : 'bg-sky-50 text-sky-700 ring-sky-100' }));
  const pressureEvents: TimelineEvent[] = pressureHistory.flatMap((record) => {
    const events: TimelineEvent[] = [];
    if (record.eventType === 'recalibration') events.push({ id: `pressure-recalibration-${record.id}`, timestamp: record.timestamp, type: 'pressure', title: '压力重新校准', body: record.note || `压力映射被重新写入，当前指数 ${record.pressure}。`, tone: 'bg-slate-50 text-slate-700 ring-slate-100' });
    if (record.pressure > 100) events.push({ id: `pressure-spike-${record.id}`, timestamp: record.timestamp, type: 'pressure', title: '压力爆表', body: `压力值 ${record.pressure}。这不是失败，是系统记录到的一次高压状态。`, tone: 'bg-rose-50 text-rose-700 ring-rose-100' });
    return events;
  });
  const taskEvents: TimelineEvent[] = tasks.flatMap((task) => {
    const events: TimelineEvent[] = [];
    if (task.completedAt) events.push({ id: `task-completed-${task.id}`, timestamp: task.completedAt, type: 'task', title: '任务闭环', body: task.title, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' });
    if (task.abandonedAt) events.push({ id: `task-abandoned-${task.id}`, timestamp: task.abandonedAt, type: 'task', title: '任务放弃', body: task.title, tone: 'bg-slate-50 text-slate-600 ring-slate-100' });
    if (task.lifecycleStatus === 'active' && task.deadline && new Date(task.deadline).getTime() < Date.now()) events.push({ id: `task-overdue-${task.id}`, timestamp: task.deadline, type: 'overdue', title: '逾期事件', body: task.title, tone: 'bg-amber-50 text-amber-700 ring-amber-100' });
    return events;
  });
  const achievementEvents: TimelineEvent[] = achievements.map((achievement) => ({ id: `achievement-${achievement.id}`, timestamp: achievement.unlockedAt, type: 'achievement', title: achievement.title, body: achievement.description, tone: 'bg-zinc-50 text-zinc-700 ring-zinc-100' }));
  const emotionalEvents: TimelineEvent[] = pressureHistory.slice(-12).map((record) => ({ id: `emotion-${record.id}`, timestamp: record.timestamp, type: 'emotion', title: '情绪压力快照', body: getPressureMood(record.pressure), tone: 'bg-indigo-50 text-indigo-700 ring-indigo-100' }));
  return [...aiEvents, ...pressureEvents, ...taskEvents, ...achievementEvents, ...emotionalEvents].sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()).slice(0, 80);
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
  return <SectionShell eyebrow="Archive" title="长期人类状态档案"><p className="max-w-2xl text-sm leading-6 text-slate-500">AI 报告、路线图、校准、闭环、逾期、行为信号和压力快照都会留在这里。统计不是数字，是行为镜像。</p>{events.length === 0 ? <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-white/65 p-8 text-center text-sm text-slate-400">系统还没有足够的历史。开始记录任务、校准压力或生成 AI 报告后，这里会变成你的生活状态档案。</div> : <ol className="mt-6 space-y-3">{events.map((event) => <li key={event.id} className="grid gap-3 rounded-3xl bg-white/70 p-4 ring-1 ring-white/80 md:grid-cols-[9rem_1fr]"><time className="text-xs font-semibold text-slate-400">{formatTime(event.timestamp)}</time><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${event.tone}`}>{event.type}</span><h3 className="font-semibold text-slate-950">{event.title}</h3></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{event.body}</p></div></li>)}</ol>}</SectionShell>;
}

export function LogPage({ tasks, goals, profile, pressure, pressureHistory, achievements, aiArtifacts, onAIReportGenerated, onDelete, onReviewNoteChange }: DataCenterProps) {
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
      <p className="text-sm font-semibold tracking-[0.24em] text-slate-400">DATA CENTER</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">数据中心</h1>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-500">一个生命状态观测站：追踪你如何工作、如何崩溃、如何恢复、如何演化。VD 不把统计当作后台表格，而把它们当作行为镜像。</p>
      <div className="mt-6 flex gap-2 overflow-x-auto rounded-[1.5rem] bg-white/60 p-1 ring-1 ring-white/80">
        {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`min-w-fit rounded-full px-4 py-2 text-left text-xs font-semibold transition ${activeTab === tab.id ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:bg-white/80 hover:text-slate-800'}`}><span className="block">{tab.label}</span><span className="block text-[10px] opacity-70">{tab.description}</span></button>)}
      </div>
    </header>

    {activeTab === 'overview' ? <section className="space-y-6"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><StatCard label="Completed" value={completedCount} detail="累计闭环任务。" tone="from-emerald-50 to-white" /><StatCard label="Pressure" value={pressure.displayPressure} detail={`当前状态：${pressure.label}`} tone="from-rose-50 to-white" /><StatCard label="Avg 7d" value={avgPressure} detail="近 7 天平均压力。" tone="from-sky-50 to-white" /><StatCard label="Streak" value={`${usageStreak} 天`} detail="连续使用 VD 的天数。" tone="from-violet-50 to-white" /></div><SectionShell eyebrow="Behavioral State" title="当前行为状态"><div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"><div className="rounded-3xl bg-slate-50/80 p-5 ring-1 ring-white/80"><p className="text-2xl font-semibold text-slate-950">{behavior.currentState}</p><p className="mt-3 text-sm leading-6 text-slate-500">{getLatestAIInsight(aiArtifacts)}</p></div><div className="grid gap-3 sm:grid-cols-2"><StatCard label="Life Focus" value={getCurrentLifeFocus(tasks)} detail="当前生活重心。" /><StatCard label="Goal Progress" value={`${goalProgress}%`} detail="长期目标关联任务推进度。" /></div></div></SectionShell><LifeTimeline events={timelineEvents.slice(0, 12)} /></section> : null}

    {activeTab === 'tasks' ? <section className="space-y-6"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><StatCard label="Completed" value={completedCount} detail="总完成任务。" /><StatCard label="Overdue" value={overdueCount} detail="当前逾期任务。" tone="from-amber-50 to-white" /><StatCard label="Abandoned" value={abandonedCount} detail="主动放弃或中止。" /><StatCard label="Completion" value={`${calculateCompletionRate(tasks)}%`} detail="已解决事项中的完成率。" /></div><SectionShell eyebrow="Execution Pattern" title="行为执行模式"><div className="grid gap-4 lg:grid-cols-2"><div className="space-y-3 rounded-3xl bg-white/70 p-5 ring-1 ring-white/80"><p>平均在截止前 <b>{calculateAverageCompletionLeadHours(tasks)}</b> 小时完成任务。</p><p><b>{calculateLastMinuteCompletionRatio(tasks)}%</b> 的任务在最后一小时内完成。</p><p>Deadline survival ratio：<b>{calculateDeadlineSurvivalRatio(tasks)}%</b></p><p>平均重要性：<b>{calculateAverageImportance(tasks)}</b>/10</p></div><div className="grid gap-3 sm:grid-cols-2"><StatCard label="拖延倾向" value={behavior.procrastinationTendency} detail="基于逾期与最后一小时完成比例。" /><StatCard label="执行稳定性" value={behavior.executionConsistency} detail="基于完成率与任务状态。" /><StatCard label="截止依赖" value={behavior.urgencyDependence} detail="是否依赖 deadline 启动。" /><StatCard label="爆发推进" value={behavior.burstProductivityTendency} detail="是否呈现短周期集中完成。" /></div></div><div className="mt-5"><Heatmap values={heatmap} /></div></SectionShell><ActivityLog tasks={tasks} limit={Infinity} title="任务归档 / 事件流" onDelete={onDelete} onReviewNoteChange={onReviewNoteChange} /></section> : null}

    {activeTab === 'pressure' ? <section className="space-y-6"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><StatCard label="Realtime" value={pressure.displayPressure} detail={pressure.recommendation} tone="from-rose-50 to-white" /><StatCard label="Volatility" value={calculatePressureVolatility(pressureHistory)} detail="压力标准差估计。" /><StatCard label="Overload" value={`${calculateOverloadFrequency(pressureHistory)}%`} detail="高压/过载记录占比。" /><StatCard label="Overload Days" value={`${calculateContinuousOverloadDays(pressureHistory)} 天`} detail="连续过载天数。" /></div><SectionShell eyebrow="Pressure Core" title="压力监控系统"><div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]"><TinyBars values={pressureHistory.slice(-24).map((record) => record.pressure)} /><div className="rounded-3xl bg-slate-50/80 p-5 ring-1 ring-white/80"><p className="font-semibold text-slate-950">{getPressureInsight(pressureHistory)}</p><p className="mt-3 text-sm text-slate-500">恢复速度：{calculateRecoverySpeed(pressureHistory)}</p><p className="mt-2 text-sm text-slate-500">分布：[0-30, 31-60, 61-80, 81-100, 100+] = {histogram.join(' / ')}</p></div></div></SectionShell><LifeTimeline events={timelineEvents.filter((event) => event.type === 'pressure' || event.type === 'emotion').slice(0, 20)} /></section> : null}

    {activeTab === 'life' ? <section className="space-y-6"><SectionShell eyebrow="Life Structure" title="人生结构分布"><div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]"><div className="space-y-3">{categoryDistribution.map((item) => <div key={item.category} className="rounded-2xl bg-white/75 p-3 ring-1 ring-white/80"><div className="flex justify-between text-sm font-semibold text-slate-600"><span>{getActivityTypeLabel(item.category)}</span><span>{item.ratio}%</span></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-800" style={{ width: `${item.ratio}%` }} /></div></div>)}</div><div className="rounded-3xl bg-slate-50/80 p-5 ring-1 ring-white/80"><p className="text-xl font-semibold text-slate-950">当前人生重心：{getCurrentLifeFocus(tasks)}</p><p className="mt-3 text-sm leading-6 text-slate-500">娱乐比例、自我维护比例、社交活动趋势与长期目标推进会在这里持续沉淀。VD 会观察偏移、忽视、过度聚焦和结构失衡。</p><p className="mt-4 text-sm font-semibold text-slate-700">长期目标进度：{goalProgress}%</p></div></div></SectionShell></section> : null}

    {activeTab === 'health' ? <section className="space-y-6"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><StatCard label="Height" value={profile.height || '未记录'} detail="基础身体数据。" /><StatCard label="Weight" value={profile.weight || '未记录'} detail="基础身体数据。" /><StatCard label="BMI" value={bmi ?? '等待'} detail={getHealthReadiness(profile)} /><StatCard label="Recovery" value="待接入" detail="睡眠、HRV、静息心率、恢复分。" /></div><SectionShell eyebrow="Health Integration" title="轻量健康系统"><p className="text-sm leading-7 text-slate-500">这里预留 Apple Health、KEEP、WHOOP、Garmin、Mi Fitness 等未来集成。VD 会把睡眠、运动、恢复、久坐、深夜活动与压力曲线放在同一个人类状态模型里。</p><div className="mt-5 grid gap-3 md:grid-cols-3"><StatCard label="Exercise" value="待接入" detail="跑量、训练时长、热量、VO₂ Max。" /><StatCard label="Sleep" value="待接入" detail="睡眠时长、一致性、深夜活动。" /><StatCard label="Risk" value="观察中" detail="高压力与低恢复的组合风险。" /></div></SectionShell></section> : null}

    {activeTab === 'trends' ? <section className="space-y-6"><SectionShell eyebrow="Long Horizon" title="长期趋势系统"><div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]"><TinyBars values={pressureHistory.slice(-36).map((record) => record.pressure)} /><div className="space-y-3"><StatCard label="本月高压天数" value={calculateContinuousOverloadDays(pressureHistory)} detail="当前连续样本，未来扩展为月度统计。" /><StatCard label="执行演化" value={behavior.executionConsistency} detail="过去行为形成的稳定性判断。" /></div></div><p className="mt-5 text-sm leading-7 text-slate-500">这里将扩展为月度演化、季节性变化、年度回顾、习惯一致性、压力演化、执行演化与健康演化。</p></SectionShell></section> : null}

    {activeTab === 'ai' ? <section className="space-y-6"><SectionShell eyebrow="AI Insights" title="第三人称行为观察"><p className="text-sm leading-7 text-slate-500">AI 不负责鼓励你。它负责观察：压力模式、行为倾向、恢复速度、长期任务稳定性、风险和节奏建议。</p><div className="mt-5 grid gap-3">{aiArtifacts.slice(0, 8).map((artifact) => <article key={artifact.id} className="rounded-3xl bg-white/75 p-4 ring-1 ring-white/80"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-950">{artifact.title}</h3><time className="text-xs text-slate-400">{formatTime(artifact.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{artifact.content.slice(0, 360)}{artifact.content.length > 360 ? '…' : ''}</p></article>)}</div></SectionShell><AIReviewPanel tasks={tasks} pressureHistory={pressureHistory} onAIReportGenerated={onAIReportGenerated} /></section> : null}
  </section>;
}
