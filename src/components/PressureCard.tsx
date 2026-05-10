import { getPressureInterpretation } from '../utils/taskScoring';

interface PressureCardProps {
  subjectivePressure: number;
  totalPressure: number;
  onSubjectivePressureChange: (pressure: number) => void;
}

export function PressureCard({ subjectivePressure, totalPressure, onSubjectivePressureChange }: PressureCardProps) {
  const interpretation = getPressureInterpretation(totalPressure);

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">实时压力指数</p>
          <div className="mt-2 flex items-end gap-3">
            <span className="text-5xl font-semibold tracking-tight text-slate-950">{totalPressure}</span>
            <span className="mb-1 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">{interpretation}</span>
          </div>
          <p className="mt-2 max-w-xl text-sm text-slate-500">这是系统对时间压力、任务重要性和恢复活动的温和估计，仅用于帮助你观察节奏。</p>
        </div>

        <div className="min-w-64 flex-1 rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
          <div className="flex items-center justify-between text-sm font-medium text-slate-600">
            <label htmlFor="subjectivePressure">当前主观压力</label>
            <span>{subjectivePressure}</span>
          </div>
          <input
            id="subjectivePressure"
            type="range"
            min="0"
            max="100"
            value={subjectivePressure}
            onChange={(event) => onSubjectivePressureChange(Number(event.target.value))}
            className="mt-4 w-full accent-slate-700"
          />
          <div className="mt-2 flex justify-between text-xs text-slate-400">
            <span>轻</span>
            <span>重</span>
          </div>
        </div>
      </div>
    </section>
  );
}
