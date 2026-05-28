import { memo } from 'react';

interface ProgressBarProps {
  progress: number;
  compact?: boolean;
}

export const ProgressBar = memo(function ProgressBar({ progress, compact = false }: ProgressBarProps) {
  const normalizedProgress = Math.min(100, Math.max(0, progress));
  const progressTone = normalizedProgress >= 75 ? 'from-sky-500 via-cyan-500 to-teal-400' : 'from-slate-500 via-slate-500 to-sky-500';

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
        <span>进度</span>
        <span>{normalizedProgress}%</span>
      </div>
      <div className={`mt-1 overflow-hidden rounded-full bg-slate-200/90 ring-1 ring-white/75 ${compact ? 'h-1.5' : 'h-2.5'}`}>
        <div className={`h-full rounded-full bg-gradient-to-r ${progressTone} transform-gpu transition-[width,filter] duration-300 ease-out`} style={{ width: `${normalizedProgress}%` }} />
      </div>
    </div>
  );
});
