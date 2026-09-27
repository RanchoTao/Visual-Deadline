import { useState } from 'react';
import type { VDNotification } from '../types/notification';

const labels: Record<VDNotification['type'], string> = { SYSTEM: '系统', WEEKLY_REPORT: '周报', AI_ANALYSIS: 'AI 分析', RISK_WARNING: '风险', ACHIEVEMENT: '成就', GOAL: '目标', TASK: '任务', SOCIAL: '社交' };

function dateTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—';
}

export function NotificationsPage({ notifications, onMarkRead }: { notifications: VDNotification[]; onMarkRead: (id: string) => void }) {
  const [selected, setSelected] = useState<VDNotification>();
  function select(notification: VDNotification) {
    setSelected(notification);
    if (!notification.isRead) onMarkRead(notification.id);
  }
  return <section className="max-w-3xl space-y-5">
    <header className="rounded-2xl border border-zinc-200 bg-white p-6"><p className="text-xs font-semibold tracking-[.16em] text-zinc-400">账户</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">通知</h1><p className="mt-2 text-sm leading-6 text-zinc-500">系统消息按当前账号隔离；已读状态会同步到已连接的云端工作区。</p></header>
    {selected ? <article className="rounded-2xl border border-zinc-200 bg-white p-6"><button type="button" onClick={() => setSelected(undefined)} className="text-sm font-semibold text-zinc-600">← 全部通知</button><p className="mt-5 text-xs font-semibold text-zinc-400">{labels[selected.type]} · {dateTime(selected.createdAt)}</p><h2 className="mt-2 text-xl font-semibold">{selected.title}</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{selected.content || selected.summary}</p></article> : <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">{notifications.length ? notifications.map((notification) => <button key={notification.id} type="button" onClick={() => select(notification)} className={`block w-full border-b border-zinc-100 p-5 text-left last:border-b-0 hover:bg-zinc-50 ${notification.isRead ? 'opacity-70' : 'bg-sky-50/50'}`}><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-zinc-500">{labels[notification.type]}</span><time className="text-xs text-zinc-400">{dateTime(notification.createdAt)}</time></div><h2 className="mt-2 text-base font-semibold">{notification.title}</h2><p className="mt-1 line-clamp-2 text-sm text-zinc-500">{notification.summary}</p></button>) : <p className="p-10 text-center text-sm text-zinc-500">暂无系统消息。</p>}</section>}
  </section>;
}
