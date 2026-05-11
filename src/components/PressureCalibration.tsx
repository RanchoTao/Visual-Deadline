import { useState } from 'react';
import { clampPressure } from '../utils/taskScoring';

interface PressureCalibrationProps {
  initialValue?: number;
  onSave: (pressure: number) => void;
}

export function PressureCalibration({ initialValue = 35, onSave }: PressureCalibrationProps) {
  const [pressure, setPressure] = useState(clampPressure(initialValue));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/10 px-4 backdrop-blur-sm">
      <section className="w-full max-w-lg rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-2xl shadow-slate-300/60">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">Pressure Calibration</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">你近期主观生活压力有多大？</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">凭直觉拖动即可。VD 会把它作为压力基线，再叠加 Deadline 与活动状态。</p>

        <div className="mt-8 rounded-3xl bg-slate-50/90 p-5 ring-1 ring-white/80">
          <div className="flex items-end justify-between gap-4">
            <label htmlFor="baselinePressure" className="text-sm font-medium text-slate-600">
              当前基线
            </label>
            <span className="text-4xl font-semibold text-slate-950">{pressure}</span>
          </div>
          <input
            id="baselinePressure"
            type="range"
            min="0"
            max="100"
            value={pressure}
            onChange={(event) => setPressure(clampPressure(Number(event.target.value)))}
            className="mt-5 w-full accent-slate-700"
          />
          <div className="mt-2 flex justify-between text-xs text-slate-400">
            <span>平静</span>
            <span>很重</span>
          </div>
        </div>

        <button type="button" onClick={() => onSave(pressure)} className="mt-6 w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-700">
          保存并进入 VD
        </button>
      </section>
    </div>
  );
}
