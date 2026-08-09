import { useState } from 'react';
import type { VDNotification } from '../types/notification';

const labels: Record<VDNotification['type'], string> = { SYSTEM: '系统', WEEKLY_REPORT: '周报', AI_ANALYSIS: 'AI 分析', RISK_WARNING: '风险', ACHIEVEMENT: '成就', GOAL: '目标', TASK: '任务', SOCIAL: '社交' };
export function NotificationCenter({ notifications, onMarkRead }: { notifications: VDNotification[]; onMarkRead: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<VDNotification>();
  const unread = notifications.some((item) => !item.isRead);
  function choose(item: VDNotification) { setSelected(item); if (!item.isRead) onMarkRead(item.id); }
  return <div className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100" aria-label="打开消息中心" aria-expanded={open}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {unread ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" aria-label="有未读消息" /> : null}
    </button>
    {open ? <section className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/95 p-3 shadow-2xl shadow-slate-300/70 backdrop-blur-xl" aria-label="消息中心">
      <div className="flex items-center justify-between px-2 py-2"><div><p className="text-xs font-semibold text-slate-400">消息中心</p><h2 className="text-lg font-semibold text-slate-950">系统主动信息</h2></div><button type="button" onClick={() => setOpen(false)} className="rounded-full px-3 py-1 text-xs text-slate-400 hover:bg-slate-100">关闭</button></div>
      {selected ? <article className="m-1 rounded-2xl bg-slate-50 p-4"><button type="button" onClick={() => setSelected(undefined)} className="text-xs font-semibold text-sky-700">← 返回</button><p className="mt-3 text-xs font-semibold text-slate-400">{labels[selected.type]}</p><h3 className="mt-1 font-semibold text-slate-950">{selected.title}</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selected.content || selected.summary}</p></article> : <div className="max-h-96 space-y-1 overflow-y-auto">{notifications.length ? notifications.map((item) => <button key={item.id} type="button" onClick={() => choose(item)} className={`block w-full rounded-2xl p-3 text-left transition hover:bg-slate-50 ${item.isRead ? 'opacity-65' : 'bg-sky-50/70'}`}><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-sky-700">{labels[item.type]}</span><time className="text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleDateString('zh-CN')}</time></div><p className="mt-1 text-sm font-semibold text-slate-900">{item.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.summary}</p></button>) : <p className="p-8 text-center text-sm text-slate-400">暂无系统消息。</p>}</div>}
    </section> : null}
  </div>;
}
