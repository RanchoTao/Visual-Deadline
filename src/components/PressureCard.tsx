import type { PressureBreakdown } from '../types/task';

interface PressureCardProps {
  pressure: PressureBreakdown;
  onRecalibrate: () => void;
}

const stateTone: Record<PressureBreakdown['state'], string> = {
  steady: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  manageable: 'bg-sky-50 text-sky-700 ring-sky-100',
  high: 'bg-amber-50 text-amber-700 ring-amber-100',
  overload: 'bg-orange-50 text-orange-700 ring-orange-100',
  burnout: 'bg-rose-50 text-rose-700 ring-rose-100',
};

export function PressureCard({ pressure, onRecalibrate }: PressureCardProps) {
  const meterWidth = Math.min(100, pressure.rawPressure);

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-500">实时压力指数</p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <span className="text-5xl font-semibold tracking-tight text-slate-950">{pressure.displayPressure}</span>
            <span className={`mb-1 rounded-full px-3 py-1 text-sm font-medium ring-1 ${stateTone[pressure.state]}`}>{pressure.label}</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{pressure.recommendation}</p>

          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full transition-all duration-700 ${pressure.state === 'burnout' ? 'bg-rose-300' : 'bg-slate-700'}`} style={{ width: `${meterWidth}%` }} />
          </div>
          <div className="mt-4 rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
            <p className="text-sm font-semibold text-slate-600">压力 ≈ 当前任务负载 × 个体压力映射系数 - 恢复释放</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">系统把你校准时输入的主观压力视为“当时任务集合的感受”，用它学习你的压力敏感度，而不是叠加一层固定背景压力。</p>
            <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-4">
              <span className="rounded-full bg-white px-3 py-2">当前任务负载 {pressure.currentTaskLoad}</span>
              <span className="rounded-full bg-white px-3 py-2">映射系数 ×{pressure.pressureRatio}</span>
              <span className="rounded-full bg-white px-3 py-2">恢复释放 -{pressure.recoveryRelief}</span>
              <span className="rounded-full bg-white px-3 py-2">估算压力 {pressure.rawPressure}</span>
            </div>
          </div>
        </div>

        <div className="w-full rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80 sm:w-64">
          <p className="text-sm font-medium text-slate-600">最近一次校准</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{pressure.referencePressure}</p>
          <div className="mt-3 space-y-2 text-xs text-slate-500">
            <p>参考任务负载 {pressure.referenceTaskLoad}</p>
            <p>个体压力映射系数 ×{pressure.pressureRatio}</p>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">点击重新校准时，系统会读取当前进行中任务，再请你输入此刻的主观压力。</p>
          <button type="button" onClick={onRecalibrate} className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-100">
            重新校准
          </button>
        </div>
      </div>
    </section>
  );
}
