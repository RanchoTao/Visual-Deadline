import type { ReactElement } from 'react';
import type { DailyQuest, LifeOSModule, MobileTab, ReminderSettings } from '../types/task';
import { DailyQuestPage } from './DailyQuestPage';

interface MobileShellProps {
  activeTab: MobileTab;
  quest: DailyQuest;
  reminderSettings: ReminderSettings;
  taskModule: ReactElement;
  profileModule: ReactElement;
  onTabChange: (tab: MobileTab) => void;
  onDesktopModuleChange: (module: LifeOSModule) => void;
  onCompleteQuestItem: (itemId: string) => void;
  onOpenReview: () => void;
  onRequestReminder: () => void;
}

const tabs: { id: MobileTab; label: string; icon: string }[] = [
  { id: 'today', label: '今日', icon: '◆' },
  { id: 'tasks', label: '任务', icon: '✓' },
  { id: 'profile', label: '档案', icon: '◎' },
  { id: 'settings', label: '设置', icon: '⚙' },
];

export function MobileShell({ activeTab, quest, reminderSettings, taskModule, profileModule, onTabChange, onDesktopModuleChange, onCompleteQuestItem, onOpenReview, onRequestReminder }: MobileShellProps) {
  const content = activeTab === 'today'
    ? <DailyQuestPage quest={quest} reminderSettings={reminderSettings} onCompleteItem={onCompleteQuestItem} onOpenReview={onOpenReview} onRequestReminder={onRequestReminder} />
    : activeTab === 'tasks'
      ? <div className="mobile-embedded-module">{taskModule}</div>
      : activeTab === 'profile'
        ? <div className="mobile-embedded-module">{profileModule}</div>
        : (
          <section className="space-y-4 text-slate-100">
            <div className="rounded-[2rem] border border-white/10 bg-slate-900/88 p-5 shadow-2xl shadow-slate-950/35">
              <p className="text-xs font-semibold tracking-[0.24em] text-cyan-200/70">设置 / 提醒</p>
              <h1 className="mt-3 text-2xl font-semibold text-white">主动提醒系统</h1>
              <p className="mt-2 text-sm leading-6 text-slate-300">提醒只会在你主动点击后申请权限。当前先使用本地状态，为未来推送预留配置。</p>
              <button type="button" onClick={onRequestReminder} className="mt-5 min-h-14 w-full rounded-[1.4rem] bg-cyan-200 text-base font-semibold text-slate-950">{reminderSettings.reminderEnabled ? '提醒已开启' : '开启提醒'}</button>
              <p className="mt-3 text-sm text-slate-300">权限状态：{reminderSettings.notificationPermission === 'granted' ? '提醒已开启' : reminderSettings.notificationPermission === 'denied' ? '提醒权限未开启，你仍然可以使用站内提醒。' : reminderSettings.notificationPermission === 'unsupported' ? '当前环境不支持浏览器通知，已降级为站内提醒。' : '等待开启'}</p>
            </div>
            <div className="rounded-[2rem] border border-white/10 bg-slate-900/75 p-5">
              <h2 className="text-lg font-semibold text-white">提醒场景</h2>
              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <p>每日任务生成提醒 · {reminderSettings.reminderTime}</p>
                <p>晚间复盘提醒 · 21:30</p>
                <p>deadline 临近提醒 · 静态预留</p>
              </div>
            </div>
            <button type="button" onClick={() => { onDesktopModuleChange('me'); onTabChange('profile'); }} className="min-h-14 w-full rounded-[1.4rem] border border-white/12 bg-white/8 font-semibold text-white">打开个人档案</button>
          </section>
        );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#12324a,transparent_34%),linear-gradient(180deg,#020617,#0f172a_48%,#020617)] px-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] text-slate-100">
      <div className="mx-auto max-w-md">{content}</div>
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-slate-950/92 px-3 pt-2 backdrop-blur-xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="移动端底部导航">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
          {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => onTabChange(tab.id)} className={`min-h-14 rounded-2xl text-xs font-semibold ${activeTab === tab.id ? 'bg-cyan-200 text-slate-950' : 'bg-white/6 text-slate-300'}`}><span className="block text-base">{tab.icon}</span>{tab.label}</button>)}
        </div>
      </nav>
    </main>
  );
}
