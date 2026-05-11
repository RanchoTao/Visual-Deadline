import { useState } from 'react';
import type { PressureBreakdown, PressureHistoryRecord } from '../types/task';
import { PressureTimeline } from './PressureTimeline';
import { isRecentPressureRecord } from '../utils/pressureHistory';

interface PressureCardProps {
  pressure: PressureBreakdown;
  history: PressureHistoryRecord[];
  onRecalibrate: () => void;
}

const stateTone: Record<PressureBreakdown['state'], string> = {
  steady: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  manageable: 'bg-sky-50 text-sky-700 ring-sky-100',
  high: 'bg-amber-50 text-amber-700 ring-amber-100',
  overload: 'bg-orange-50 text-orange-700 ring-orange-100',
  burnout: 'bg-rose-50 text-rose-700 ring-rose-100',
};

function miniPath(records: PressureHistoryRecord[]): string {
  if (records.length < 2) return '';
  const width = 220;
  const height = 74;
  const maxPressure = Math.max(100, ...records.map((record) => record.pressure));
  return records
    .map((record, index) => {
      const x = (index / (records.length - 1)) * width;
      const y = height - (Math.min(record.pressure, maxPressure) / maxPressure) * height;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

export function PressureCard({ pressure, history, onRecalibrate }: PressureCardProps) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const meterWidth = Math.min(100, pressure.rawPressure);
  const recentHistory = history.filter((record) => isRecentPressureRecord(record, new Date(), 30)).slice(-32);
  const path = miniPath(recentHistory);

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500">实时压力指数</p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <span className="text-5xl font-semibold tracking-tight text-slate-950">{pressure.displayPressure}</span>
            <span className={`mb-1 rounded-full px-3 py-1 text-sm font-medium ring-1 ${stateTone[pressure.state]}`}>{pressure.label}</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{pressure.recommendation}</p>

          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all duration-700 ${pressure.state === 'burnout' ? 'bg-rose-300' : 'bg-slate-700'}`} style={{ width: `${meterWidth}%` }} /></div>
          <div className="mt-4 rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
            <p className="text-sm font-semibold text-slate-600">压力 ≈ 当前任务负载 × 个体压力映射系数 - 恢复释放</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">系统把校准时的主观压力视为当时任务集合的感受，用它映射此刻压力。</p>
            <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-4">
              <span className="rounded-full bg-white px-3 py-2">任务负载 {pressure.currentTaskLoad}</span><span className="rounded-full bg-white px-3 py-2">系数 ×{pressure.pressureRatio}</span><span className="rounded-full bg-white px-3 py-2">恢复 -{pressure.recoveryRelief}</span><span className="rounded-full bg-white px-3 py-2">估算 {pressure.rawPressure}</span>
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <button type="button" onClick={() => setTimelineOpen(true)} className="w-full rounded-3xl bg-slate-50/80 p-4 text-left ring-1 ring-white/80 transition hover:bg-white">
            <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-600">压力曲线</p><span className="text-xs text-slate-400">点击展开</span></div>
            {recentHistory.length < 2 ? <div className="mt-3 flex h-24 items-center justify-center rounded-2xl bg-white/70 text-xs text-slate-400">继续使用后生成曲线</div> : (
              <svg viewBox="0 0 220 84" className="mt-3 h-24 w-full overflow-visible" aria-label="迷你压力曲线">
                <rect x="0" y="0" width="220" height="18" rx="9" fill="#fee2e2" opacity="0.28" />
                <path d={path} fill="none" stroke="#64748b" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
              </svg>
            )}
          </button>

          <div className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
            <p className="text-sm font-medium text-slate-600">最近一次校准</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{pressure.referencePressure}</p>
            <div className="mt-3 space-y-2 text-xs text-slate-500"><p>参考任务负载 {pressure.referenceTaskLoad}</p><p>压力映射系数 ×{pressure.pressureRatio}</p></div>
            <button type="button" onClick={onRecalibrate} className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-100">重新校准</button>
          </div>
        </aside>
      </div>

      {timelineOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[calc(100vh-3rem)] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-white/95 p-4 shadow-2xl shadow-slate-300/60">
            <div className="mb-3 flex items-center justify-between gap-3 px-2"><h2 className="text-xl font-semibold text-slate-950">压力曲线详情</h2><button type="button" onClick={() => setTimelineOpen(false)} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">关闭</button></div>
            <PressureTimeline records={history} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
