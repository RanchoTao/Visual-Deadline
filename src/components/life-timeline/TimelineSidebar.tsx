import type { TimelineItem } from './types';

interface TimelineSidebarProps {
  weekMilestones: { title: string; date: string }[];
  longTermGoals: { title: string; date: string }[];
  age?: number;
  onSelect: (item: TimelineItem) => void;
}

export function TimelineSidebar({ weekMilestones, longTermGoals, age = 23 }: TimelineSidebarProps) {
  const progress = Math.min(100, Math.max(0, age));
  return <aside className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm shadow-slate-200/60">
      <div className="flex items-center gap-4">
        <div className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#ef233c ${progress * 3.6}deg, #f1f5f9 0deg)` }}>
          <div className="grid h-[66px] w-[66px] place-items-center rounded-full bg-white"><strong className="text-xl text-slate-950">{progress}%</strong></div>
        </div>
        <div><p className="text-xs font-semibold tracking-[0.16em] text-slate-400">人生进度</p><h3 className="mt-1 font-semibold text-slate-900">已走过 {age} 年</h3><p className="mt-1 text-xs text-slate-400">以 100 年为象征坐标</p></div>
      </div>
    </section>
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm shadow-slate-200/60">
      <p className="text-xs font-semibold tracking-[0.16em] text-slate-400">本周关键节点</p>
      <div className="mt-4 space-y-3">{weekMilestones.map((item, index) => <div key={item.title} className="flex gap-3"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${index === 0 ? 'bg-[#ef233c] ring-4 ring-rose-100' : 'bg-slate-300'}`} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-700">{item.title}</p><p className="text-xs text-slate-400">{item.date}</p></div></div>)}</div>
    </section>
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm shadow-slate-200/60">
      <p className="text-xs font-semibold tracking-[0.16em] text-slate-400">长期目标</p>
      <div className="mt-4 space-y-3">{longTermGoals.map((item) => <div key={item.title} className="rounded-2xl bg-slate-50 px-3 py-2.5"><p className="text-sm font-medium text-slate-700">{item.title}</p><p className="mt-1 text-xs font-semibold text-[#ef233c]">{item.date}</p></div>)}</div>
    </section>
    <section className="relative overflow-hidden rounded-3xl bg-[#18181b] p-5 text-white shadow-lg shadow-slate-300/40">
      <span className="absolute -right-3 -top-7 text-8xl font-serif text-white/5">“</span><p className="text-xs font-semibold tracking-[0.16em] text-white/45">今日聚焦</p><blockquote className="mt-5 text-lg font-medium leading-8">专注当下，<br />未来自会清晰。</blockquote><p className="mt-4 text-xs text-white/45">— VD</p>
    </section>
  </aside>;
}

