import type { Achievement } from '../types/task';
import { achievementCatalog } from '../utils/taskScoring';

interface AchievementsPanelProps {
  achievements: Achievement[];
}

function formatUnlockedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function AchievementsPanel({ achievements }: AchievementsPanelProps) {
  const unlockedIds = new Set(achievements.map((achievement) => achievement.id));

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">Achievement System</p>
          <h2 className="text-2xl font-semibold text-slate-950">成就系统</h2>
          <p className="mt-1 text-sm text-slate-500">用轻量反馈记录你正在恢复秩序。</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">{achievements.length}/{achievementCatalog.length}</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {achievementCatalog.map((achievement) => {
          const unlockedAchievement = achievements.find((item) => item.id === achievement.id);
          const isUnlocked = unlockedIds.has(achievement.id);

          return (
            <article key={achievement.id} className={`rounded-3xl p-4 ring-1 transition ${isUnlocked ? 'bg-white text-slate-900 shadow-sm shadow-slate-100 ring-white/80' : 'bg-slate-50/70 text-slate-400 ring-white/60'}`}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{achievement.title}</h3>
                <span className="text-lg" aria-hidden="true">
                  {isUnlocked ? '◦' : '·'}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5">{achievement.description}</p>
              <p className="mt-4 text-[11px] font-medium text-slate-400">{unlockedAchievement ? formatUnlockedAt(unlockedAchievement.unlockedAt) : '尚未解锁'}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
