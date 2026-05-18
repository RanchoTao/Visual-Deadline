import { useEffect, useRef, useState } from 'react';
import type { PressureBreakdown, PressureHistoryRecord } from '../types/task';
import { PressureTimeline } from './PressureTimeline';
import { ModalPortal } from './ModalPortal';
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


function useAnimatedNumber(value: number, duration = 720): number {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);

  useEffect(() => {
    const startValue = previousValue.current;
    const targetValue = value;
    const startedAt = performance.now();
    let frameId = 0;

    function tick(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const easedProgress = 1 - (1 - progress) ** 3;
      setDisplayValue(Math.round(startValue + (targetValue - startValue) * easedProgress));
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
        return;
      }
      previousValue.current = targetValue;
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [duration, value]);

  return displayValue;
}

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
  const animatedPressure = useAnimatedNumber(pressure.displayPressure);
  const meterWidth = Math.min(100, pressure.rawPressure);
  const recentHistory = history.filter((record) => isRecentPressureRecord(record, new Date(), 30)).slice(-32);
  const path = miniPath(recentHistory);

  return (
    <section className="rounded-[1.5rem] border border-white/70 bg-white/75 p-4 shadow-lg shadow-slate-200/50 backdrop-blur md:rounded-[2rem] md:p-5 md:shadow-xl md:shadow-slate-200/60">
      <div className="grid gap-4 md:gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 md:text-sm md:tracking-normal">实时压力指数</p>
          <div className="mt-1.5 flex flex-wrap items-end gap-2.5 md:mt-2 md:gap-3">
            <span className="text-4xl font-semibold tracking-tight text-slate-950 tabular-nums transition-colors duration-500 md:text-5xl">{pressure.state === 'burnout' ? pressure.displayPressure : animatedPressure}</span>
            <span className={`mb-0.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 md:mb-1 md:px-3 md:text-sm ${stateTone[pressure.state]}`}>{pressure.label}</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 md:leading-6">{pressure.recommendation}</p>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 md:mt-5 md:h-2.5"><div className={`h-full rounded-full transition-all duration-1000 ease-out ${pressure.state === 'burnout' ? 'bg-rose-300' : 'bg-slate-700'}`} style={{ width: `${meterWidth}%` }} /></div>
          <div className="mt-3 rounded-2xl bg-slate-50/80 p-3 ring-1 ring-white/80 md:mt-4 md:rounded-3xl md:p-4">
            <p className="text-xs font-semibold leading-5 text-slate-600 md:text-sm">压力 ≈ 当前任务负载 × 个体压力映射系数 - 恢复释放</p>
            <p className="mt-1.5 text-xs leading-5 text-slate-500 md:mt-2">系统把校准时的主观压力视为当时任务集合的感受，用它映射此刻压力。</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 md:grid-cols-4">
              <span className="rounded-2xl bg-white px-2.5 py-2 text-center md:rounded-full md:px-3">任务负载 {pressure.currentTaskLoad}</span><span className="rounded-2xl bg-white px-2.5 py-2 text-center md:rounded-full md:px-3">系数 ×{pressure.pressureRatio}</span><span className="rounded-2xl bg-white px-2.5 py-2 text-center md:rounded-full md:px-3">恢复 -{pressure.recoveryRelief}</span><span className="rounded-2xl bg-white px-2.5 py-2 text-center md:rounded-full md:px-3">估算 {pressure.rawPressure}</span>
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <button type="button" onClick={() => setTimelineOpen(true)} className="w-full rounded-2xl bg-slate-50/80 p-3 text-left ring-1 ring-white/80 transition hover:bg-white md:rounded-3xl md:p-4">
            <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-600">压力曲线</p><span className="text-xs text-slate-400">点击展开</span></div>
            {recentHistory.length < 2 ? <div className="mt-3 flex h-20 items-center justify-center rounded-2xl bg-white/70 text-xs text-slate-400 md:h-24">继续使用后生成曲线</div> : (
              <svg viewBox="0 0 220 84" className="mt-3 h-20 w-full overflow-visible md:h-24" aria-label="迷你压力曲线">
                <rect x="0" y="0" width="220" height="18" rx="9" fill="#fee2e2" opacity="0.28" />
                <path d={path} fill="none" stroke="#64748b" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
              </svg>
            )}
          </button>

          <div className="rounded-2xl bg-slate-50/80 p-3 ring-1 ring-white/80 md:rounded-3xl md:p-4">
            <p className="text-sm font-medium text-slate-600">最近一次校准</p>
            <p className="mt-1.5 text-2xl font-semibold text-slate-950 md:mt-2 md:text-3xl">{pressure.referencePressure}</p>
            <div className="mt-3 space-y-2 text-xs text-slate-500"><p>参考任务负载 {pressure.referenceTaskLoad}</p><p>压力映射系数 ×{pressure.pressureRatio}</p></div>
            <button type="button" onClick={onRecalibrate} className="mt-4 min-h-10 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-100">重新校准</button>
          </div>
        </aside>
      </div>

      {timelineOpen ? (
        <ModalPortal>
          <div className="max-h-[85vh] w-[min(calc(100vw-2rem),1100px)] overflow-y-auto rounded-[2rem] border border-white/80 bg-white/95 p-5 shadow-2xl shadow-slate-950/25">
            <div className="sticky top-0 z-10 -mb-10 flex justify-end pointer-events-none">
              <button type="button" onClick={() => setTimelineOpen(false)} className="pointer-events-auto rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-200" aria-label="关闭压力曲线详情">关闭</button>
            </div>
            <div className="pr-20">
              <PressureTimeline records={history} variant="modal" />
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </section>
  );
}
