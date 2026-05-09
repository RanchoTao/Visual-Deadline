interface ProgressBarProps {
  progress: number;
  compact?: boolean;
}

export function ProgressBar({ progress, compact = false }: ProgressBarProps) {
  const normalizedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
        <span>进度</span>
        <span>{normalizedProgress}%</span>
      </div>
      <div className={`mt-1 overflow-hidden rounded-full bg-slate-200 ${compact ? 'h-1.5' : 'h-2.5'}`}>
        <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${normalizedProgress}%` }} />
      </div>
    </div>
  );
}
