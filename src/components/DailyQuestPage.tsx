import type { DailyQuest, DailyQuestItem, ReminderSettings } from '../types/task';

interface DailyQuestPageProps {
  quest: DailyQuest;
  reminderSettings: ReminderSettings;
  onCompleteItem: (itemId: string) => void;
  onOpenReview: () => void;
  onRequestReminder: () => void;
}

const typeLabel: Record<DailyQuestItem['type'], string> = {
  main: '主线任务',
  daily: '日课任务',
  side: '支线任务',
  recovery: '恢复任务',
};

export function DailyQuestPage({ quest, reminderSettings, onCompleteItem, onOpenReview, onRequestReminder }: DailyQuestPageProps) {
  const completedCount = quest.items.filter((item) => item.status === 'done').length;
  const totalCount = quest.items.length;
  const rate = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return (
    <section className="space-y-4 pb-4 text-slate-100">
      <header className="rounded-[2rem] border border-cyan-300/15 bg-slate-900/88 p-5 shadow-2xl shadow-slate-950/40">
        <p className="text-xs font-semibold tracking-[0.24em] text-cyan-200/70">今日概览 / {quest.date}</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">{quest.title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">{quest.summary}</p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-3xl bg-white/7 p-3 ring-1 ring-white/10">
            <p className="text-[11px] text-slate-400">完成度</p>
            <p className="mt-1 text-2xl font-semibold text-cyan-100 tabular-nums">{rate}%</p>
          </div>
          <div className="rounded-3xl bg-white/7 p-3 ring-1 ring-white/10">
            <p className="text-[11px] text-slate-400">任务</p>
            <p className="mt-1 text-2xl font-semibold text-white tabular-nums">{completedCount}/{totalCount}</p>
          </div>
          <div className="rounded-3xl bg-white/7 p-3 ring-1 ring-white/10">
            <p className="text-[11px] text-slate-400">等级</p>
            <p className="mt-1 text-2xl font-semibold text-white">{quest.difficulty}</p>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-cyan-300 transition-all duration-500" style={{ width: `${rate}%` }} />
        </div>
      </header>

      <div className="rounded-[2rem] border border-amber-200/15 bg-amber-200/8 p-4 text-sm leading-6 text-amber-50">
        <p className="font-semibold">系统矫正</p>
        <p className="mt-1 text-amber-100/80">{quest.systemCorrection.message}</p>
        {quest.systemCorrection.intensityHint ? <p className="mt-2 text-xs text-amber-100/70">{quest.systemCorrection.intensityHint}</p> : null}
      </div>

      <div className="space-y-3">
        {quest.items.map((item) => {
          const done = item.status === 'done';
          return (
            <article key={item.id} className={`rounded-[1.75rem] border p-4 shadow-xl shadow-slate-950/20 ${done ? 'border-emerald-300/20 bg-emerald-400/10' : 'border-white/10 bg-slate-900/88'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-cyan-100/75">{typeLabel[item.type]} · 优先级 {item.priority}</p>
                  <h2 className="mt-2 text-lg font-semibold leading-6 text-white">{item.title}</h2>
                </div>
                <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-cyan-50 tabular-nums">[{item.currentValue}/{item.targetValue}{item.unit}]</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{item.successCriteria}</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="rounded-full bg-white/8 px-3 py-1.5 text-xs text-slate-300">预计 {item.estimatedMinutes} 分钟</span>
                <button type="button" onClick={() => onCompleteItem(item.id)} disabled={done} className={`min-h-12 rounded-full px-5 text-sm font-semibold transition ${done ? 'bg-emerald-400/20 text-emerald-100' : 'bg-cyan-200 text-slate-950 active:scale-[0.98]'}`}>
                  {done ? '已完成' : '完成任务'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="grid gap-3">
        <button type="button" onClick={onOpenReview} className="min-h-14 rounded-[1.4rem] bg-white text-base font-semibold text-slate-950 shadow-lg shadow-slate-950/20">进入今日总结</button>
        <button type="button" onClick={onRequestReminder} className="min-h-14 rounded-[1.4rem] border border-white/12 bg-white/8 text-base font-semibold text-white">
          {reminderSettings.reminderEnabled ? '提醒已开启' : '开启提醒'}
        </button>
        {!reminderSettings.reminderEnabled && reminderSettings.notificationPermission === 'denied' ? <p className="text-center text-xs text-slate-400">提醒权限未开启，你仍然可以使用站内提醒。</p> : null}
      </div>
    </section>
  );
}
