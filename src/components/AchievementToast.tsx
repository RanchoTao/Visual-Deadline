import type { Achievement } from '../types/task';

interface AchievementToastProps {
  achievement?: Achievement;
}

export function AchievementToast({ achievement }: AchievementToastProps) {
  if (!achievement) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 animate-soft-rise rounded-[1.5rem] border border-white/80 bg-white/88 p-4 shadow-2xl shadow-slate-300/40 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">生命信号已记录</p>
      <h3 className="mt-1 font-semibold text-slate-950">{achievement.title}</h3>
      <p className="mt-1 text-sm leading-5 text-slate-500">{achievement.description}</p>
    </div>
  );
}
