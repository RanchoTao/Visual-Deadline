import { memo } from 'react';

interface ProgressBarProps {
  progress: number;
  compact?: boolean;
}

function ProgressBarComponent({ progress, compact = false }: ProgressBarProps) {
  const normalizedProgress = Math.min(100, Math.max(0, progress));
  const toneClass = normalizedProgress >= 75 ? 'bg-sky-500' : normalizedProgress >= 45 ? 'bg-sky-600' : 'bg-slate-500';

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
        <span>进度</span>
        <span>{normalizedProgress}%</span>
      </div>
      <div className={`mt-1 overflow-hidden rounded-full bg-slate-200/80 ${compact ? 'h-1.5' : 'h-2.5'}`}>
        <div className={`h-full rounded-full ${toneClass} transition-[width,background-color] duration-300 ease-out`} style={{ width: `${normalizedProgress}%` }} />
      </div>
    </div>
  );
}

export const ProgressBar = memo(ProgressBarComponent);
