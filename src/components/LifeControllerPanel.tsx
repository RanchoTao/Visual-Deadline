import { useState } from 'react';
import type { BuiltInLifeEventType, LifeControllerPlan, LifeEvent, LifePreferences, LifeState } from '../types/lifeController';
import { formatDurationMinutes, formatZonedDateTime } from '../domain/life-controller';

interface LifeControllerPanelProps {
  state: LifeState;
  plan: LifeControllerPlan;
  events: LifeEvent[];
  preferences: LifePreferences;
  onRecord: (type: BuiltInLifeEventType) => Promise<void>;
  onUndo: () => Promise<void>;
  theme?: 'light' | 'dark';
  syncStatus?: string;
}

const eventLabels: Record<BuiltInLifeEventType, string> = {
  wake: '起床',
  meal: '吃饭',
  sleep_start: '睡觉',
};

function stateLabel(state: LifeState['currentSleepState']): string {
  if (state === 'awake') return '清醒';
  if (state === 'sleeping') return '睡眠中';
  return '未知';
}

export function LifeControllerPanel({ state, plan, events, preferences, onRecord, onUndo, theme = 'light', syncStatus }: LifeControllerPanelProps) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const dark = theme === 'dark';
  const recentEvents = [...events].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp)).slice(0, 20);
  const nowAction = plan.now?.actionEventType;

  async function record(type: BuiltInLifeEventType) {
    setPendingAction(type);
    setFeedback('');
    try {
      await onRecord(type);
      setFeedback(`已记录：${eventLabels[type]}`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '记录失败，请重试。');
    } finally {
      setPendingAction(null);
    }
  }

  async function undo() {
    setPendingAction('undo');
    setFeedback('');
    try {
      await onUndo();
      setFeedback('已撤销最近一条记录。');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '撤销失败，请重试。');
    } finally {
      setPendingAction(null);
    }
  }

  const surface = dark ? 'border-white/10 bg-slate-900/88 text-white shadow-slate-950/35' : 'border-white/75 bg-white/78 text-slate-950 shadow-slate-200/60';
  const inset = dark ? 'bg-white/7 ring-white/10' : 'bg-slate-50/80 ring-white/80';
  const muted = dark ? 'text-slate-300' : 'text-slate-500';
  const quiet = dark ? 'text-slate-400' : 'text-slate-400';
  const secondaryButton = dark ? 'border-white/12 bg-white/8 text-white hover:bg-white/12' : 'border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-50';

  return (
    <section className="space-y-4" aria-label="Life Controller 生活控制面板">
      <section className={`relative overflow-hidden rounded-[2rem] border p-5 shadow-2xl md:p-7 ${dark ? 'border-rose-300/15 bg-gradient-to-br from-rose-500/18 via-slate-900/92 to-slate-900/92 shadow-slate-950/40' : 'border-rose-100/80 bg-gradient-to-br from-rose-50 via-white to-slate-50 shadow-rose-100/55'}`} aria-labelledby="life-controller-now">
        <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-rose-400/10 blur-3xl" />
        <p className={`text-xs font-bold tracking-[0.28em] ${dark ? 'text-rose-200/80' : 'text-rose-500'}`}>NOW</p>
        <h1 id="life-controller-now" className={`relative mt-3 text-3xl font-semibold tracking-tight md:text-4xl ${dark ? 'text-white' : 'text-slate-950'}`}>
          {plan.now?.title ?? '当前无生活事项需要立即处理'}
        </h1>
        <p className={`relative mt-3 max-w-2xl text-sm leading-6 ${muted}`}>
          {plan.now?.detail ?? '睡眠与进食记录暂未触发立即行动。未来 Task Controller 会在这里补充工作任务。'}
        </p>
        {nowAction ? (
          <button type="button" onClick={() => void record(nowAction)} disabled={pendingAction !== null} className="relative mt-5 min-h-12 rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/20 transition hover:-translate-y-0.5 hover:bg-rose-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200 disabled:cursor-wait disabled:opacity-60">
            {pendingAction === nowAction ? '记录中…' : `记录已${eventLabels[nowAction]}`}
          </button>
        ) : null}
      </section>

      <section className={`rounded-[2rem] border p-5 shadow-xl md:p-6 ${surface}`} aria-labelledby="life-controller-state">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={`text-xs font-semibold tracking-[0.22em] ${quiet}`}>STATE</p>
            <h2 id="life-controller-state" className="mt-2 text-xl font-semibold">当前状态</h2>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${state.currentSleepState === 'unknown' ? (dark ? 'bg-amber-300/10 text-amber-100 ring-amber-200/20' : 'bg-amber-50 text-amber-700 ring-amber-100') : (dark ? 'bg-cyan-200/10 text-cyan-100 ring-cyan-200/20' : 'bg-sky-50 text-sky-700 ring-sky-100')}`}>{stateLabel(state.currentSleepState)}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className={`rounded-3xl p-4 ring-1 ${inset}`}><p className={`text-xs ${quiet}`}>清醒时长</p><p className="mt-2 font-semibold tabular-nums">{formatDurationMinutes(state.awakeDurationMinutes)}</p></div>
          <div className={`rounded-3xl p-4 ring-1 ${inset}`}><p className={`text-xs ${quiet}`}>距上次进食</p><p className="mt-2 font-semibold tabular-nums">{formatDurationMinutes(state.timeSinceLastMealMinutes)}</p></div>
          <div className={`rounded-3xl p-4 ring-1 ${inset}`}><p className={`text-xs ${quiet}`}>上次睡眠</p><p className="mt-2 font-semibold tabular-nums">{formatDurationMinutes(state.lastSleepDurationMinutes)}</p></div>
          <div className={`rounded-3xl p-4 ring-1 ${inset}`}><p className={`text-xs ${quiet}`}>今日进食</p><p className="mt-2 font-semibold tabular-nums">{state.mealsToday} 次</p></div>
        </div>
        {plan.notices.length ? <div className={`mt-4 rounded-2xl px-4 py-3 text-xs leading-5 ${dark ? 'bg-amber-200/8 text-amber-100/80' : 'bg-amber-50 text-amber-700'}`}>{plan.notices.map((notice) => <p key={notice}>{notice}</p>)}</div> : null}
      </section>

      <section className={`rounded-[2rem] border p-5 shadow-xl md:p-6 ${surface}`} aria-labelledby="life-controller-next">
        <p className={`text-xs font-semibold tracking-[0.22em] ${quiet}`}>NEXT</p>
        <h2 id="life-controller-next" className="mt-2 text-xl font-semibold">接下来</h2>
        {plan.next.length ? (
          <ol className="mt-4 space-y-3">
            {plan.next.map((entry) => <li key={entry.id} className={`flex items-start justify-between gap-4 rounded-3xl p-4 ring-1 ${inset}`}><div><p className="font-semibold">{entry.title}</p><p className={`mt-1 text-sm leading-5 ${muted}`}>{entry.detail}</p></div>{entry.scheduledLocalTime ? <time className={`shrink-0 text-sm font-semibold tabular-nums ${dark ? 'text-cyan-100' : 'text-sky-700'}`}>{entry.scheduledLocalTime}</time> : null}</li>)}
          </ol>
        ) : <p className={`mt-4 rounded-3xl p-4 text-sm ring-1 ${inset} ${muted}`}>暂无需要预告的生活计划项。</p>}
      </section>

      <section className={`rounded-[2rem] border p-5 shadow-xl md:p-6 ${surface}`} aria-labelledby="life-controller-capture">
        <p className={`text-xs font-semibold tracking-[0.22em] ${quiet}`}>CAPTURE</p>
        <h2 id="life-controller-capture" className="mt-2 text-xl font-semibold">刚刚发生了什么？</h2>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(['wake', 'meal', 'sleep_start'] as const).map((type) => {
            const duplicate = (type === 'wake' && state.currentSleepState === 'awake') || (type === 'sleep_start' && state.currentSleepState === 'sleeping');
            return <button key={type} type="button" onClick={() => void record(type)} disabled={pendingAction !== null || duplicate} title={duplicate ? `当前已经是${stateLabel(state.currentSleepState)}状态` : undefined} className={`min-h-14 rounded-[1.35rem] border px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-40 ${type === 'meal' ? 'border-rose-400 bg-rose-500 text-white hover:bg-rose-600' : secondaryButton}`}>{pendingAction === type ? '记录中…' : eventLabels[type]}</button>;
          })}
        </div>
        <button type="button" onClick={() => void undo()} disabled={pendingAction !== null || recentEvents.length === 0} className={`mt-3 min-h-12 w-full rounded-[1.25rem] border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-40 ${secondaryButton}`}>{pendingAction === 'undo' ? '撤销中…' : '撤销最近记录'}</button>
        <p className={`mt-3 min-h-5 text-center text-xs ${feedback.includes('失败') || feedback.includes('不能') ? 'text-rose-500' : muted}`} role="status" aria-live="polite">{feedback}</p>
        {syncStatus ? <p className={`mt-1 text-center text-[11px] leading-5 ${syncStatus.includes('失败') || syncStatus.includes('未应用') ? 'text-amber-500' : quiet}`}>{syncStatus}</p> : null}
      </section>

      <section className={`rounded-[2rem] border p-5 shadow-xl md:p-6 ${surface}`}>
        <p className={`text-xs font-semibold tracking-[0.22em] ${quiet}`}>LATER</p>
        <h2 className="mt-2 text-xl font-semibold">稍后</h2>
        <ul className="mt-4 space-y-2">
          {plan.later.map((entry) => <li key={entry.id} className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm ring-1 ${inset}`}><span><strong>{entry.title}</strong><span className={`mt-1 block text-xs ${muted}`}>{entry.detail}</span></span>{entry.scheduledLocalTime ? <time className="shrink-0 font-semibold tabular-nums">{entry.scheduledLocalTime}</time> : null}</li>)}
        </ul>

        <details className={`mt-4 rounded-2xl ring-1 ${inset}`}>
          <summary className="min-h-12 cursor-pointer list-none px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200">最近记录 · {recentEvents.length}</summary>
          <div className={`border-t px-4 py-2 ${dark ? 'border-white/10' : 'border-slate-200/70'}`}>
            {recentEvents.length ? <ol>{recentEvents.map((event) => <li key={event.id} className={`flex items-center justify-between gap-4 border-b py-3 text-sm last:border-0 ${dark ? 'border-white/8' : 'border-slate-100'}`}><span className="font-medium">{eventLabels[event.type as BuiltInLifeEventType] ?? event.type}</span><time className={`tabular-nums ${muted}`}>{formatZonedDateTime(event.timestamp, preferences.timezone)}</time></li>)}</ol> : <p className={`py-4 text-sm ${muted}`}>还没有生活事件。记录会保存在当前用户的数据空间。</p>}
          </div>
        </details>
      </section>
    </section>
  );
}
