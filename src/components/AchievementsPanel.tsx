import { useState } from 'react';
import type { Achievement, AchievementDefinition } from '../types/task';
import { achievementCatalog } from '../utils/taskScoring';

interface AchievementsPanelProps {
  achievements: Achievement[];
}

function formatUnlockedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function getUnlockedAchievement(achievements: Achievement[], achievementId: string): Achievement | undefined {
  return achievements.find((achievement) => achievement.id === achievementId);
}

function getDetailStatus(unlockedAchievement?: Achievement): string {
  return unlockedAchievement ? '已记录' : '尚未发生';
}

function AchievementDetailModal({ achievement, unlockedAchievement, onClose }: { achievement: AchievementDefinition; unlockedAchievement?: Achievement; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="achievement-detail-title">
      <section className="max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-2xl shadow-slate-300/60">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">System Memory Archive</p>
            <h2 id="achievement-detail-title" className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{achievement.title}</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">{achievement.shortDescription}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200" aria-label="关闭成就详情">关闭</button>
        </div>

        <dl className="mt-8 space-y-4">
          <div className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Unlock Status</dt>
            <dd className="mt-2 text-sm font-semibold text-slate-900">{getDetailStatus(unlockedAchievement)}</dd>
          </div>
          <div className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Unlock Timestamp</dt>
            <dd className="mt-2 text-sm text-slate-600">{unlockedAchievement ? formatUnlockedAt(unlockedAchievement.unlockedAt) : '等待系统记录。'}</dd>
          </div>
          <div className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Trigger Condition</dt>
            <dd className="mt-2 text-sm text-slate-600">{achievement.unlockCondition}</dd>
          </div>
          <div className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Hidden System Commentary</dt>
            <dd className="mt-2 text-sm text-slate-500">{achievement.hiddenCommentary ?? '未接入。系统暂时保持沉默。'}</dd>
          </div>
          <div className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Related Statistics</dt>
            <dd className="mt-2 text-sm text-slate-500">{achievement.relatedStats?.length ? achievement.relatedStats.join(' / ') : '未接入。等待更多生命数据。'}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

export function AchievementsPanel({ achievements }: AchievementsPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const [selectedAchievementId, setSelectedAchievementId] = useState<string | undefined>();
  const unlockedIds = new Set(achievements.map((achievement) => achievement.id));
  const unlockedByRecent = [...achievements].sort((a, b) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime());
  const nextGoals = achievementCatalog.filter((achievement) => !unlockedIds.has(achievement.id));
  const displayAchievements = showAll ? achievementCatalog : [...unlockedByRecent, ...nextGoals].slice(0, 4);
  const selectedAchievement = achievementCatalog.find((achievement) => achievement.id === selectedAchievementId);
  const selectedUnlockedAchievement = selectedAchievementId ? getUnlockedAchievement(achievements, selectedAchievementId) : undefined;

  return (
    <section className="relative z-0 rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">行为信号</p>
          <h2 className="text-2xl font-semibold text-slate-950">已经留下的痕迹</h2>
          <p className="mt-1 text-sm text-slate-500">这些不是奖励，而是 VD 观察到的生活状态、压力姿态与行为记忆。</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">{achievements.length}/{achievementCatalog.length}</span>
          {achievementCatalog.length > 4 ? <button type="button" onClick={() => setShowAll((value) => !value)} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm hover:bg-slate-100">{showAll ? '收起' : '查看全部'}</button> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {displayAchievements.map((achievement) => {
          const unlockedAchievement = getUnlockedAchievement(achievements, achievement.id);
          const isUnlocked = unlockedIds.has(achievement.id);

          return (
            <button key={achievement.id} type="button" onClick={() => setSelectedAchievementId(achievement.id)} className={`rounded-3xl p-5 text-left ring-1 transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-slate-300 ${isUnlocked ? 'bg-white text-slate-950 shadow-sm shadow-slate-100 ring-white/80' : 'bg-slate-50/70 text-slate-300 ring-white/60'}`}>
              <h3 className="text-sm font-semibold">{achievement.title}</h3>
              <p className={`mt-3 line-clamp-2 text-xs leading-5 ${isUnlocked ? 'text-slate-600' : 'text-slate-400'}`}>{achievement.shortDescription}</p>
              <p className="mt-4 text-[11px] font-medium text-slate-400">{unlockedAchievement ? formatUnlockedAt(unlockedAchievement.unlockedAt) : '尚未发生'}</p>
            </button>
          );
        })}
      </div>

      {selectedAchievement ? <AchievementDetailModal achievement={selectedAchievement} unlockedAchievement={selectedUnlockedAchievement} onClose={() => setSelectedAchievementId(undefined)} /> : null}
    </section>
  );
}
