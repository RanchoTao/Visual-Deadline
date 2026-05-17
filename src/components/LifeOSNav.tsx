import logoUrl from '../../visualdeadline-banner.png';
import { branding } from '../constants/branding';
import type { LifeOSModule, UserProfile } from '../types/task';

interface LifeOSNavProps {
  activeModule: LifeOSModule;
  profile: UserProfile;
  isSignedIn: boolean;
  isCloudLoading: boolean;
  syncStateLabel: string;
  onModuleChange: (module: LifeOSModule) => void;
  onOpenProfile: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

const navItems: { id: LifeOSModule; label: string }[] = [
  { id: 'home', label: '首页' },
  { id: 'task', label: '任务' },
  { id: 'map', label: '人生' },
  { id: 'social', label: '社交' },
  { id: 'log', label: '数据' },
];

function getDisplayName(profile: UserProfile): string {
  return profile.nickname.trim() || 'VD 用户';
}

function getUsername(profile: UserProfile): string {
  const normalized = profile.username.trim().replace(/^@/, '');
  if (normalized) return normalized;
  return getDisplayName(profile).replace(/\s+/g, '').toLowerCase() || 'visualdeadline';
}

function Avatar({ profile, size = 'md' }: { profile: UserProfile; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-16 w-16 text-2xl' : size === 'sm' ? 'h-9 w-9 text-sm' : 'h-11 w-11 text-base';
  const initial = getDisplayName(profile).slice(0, 1).toUpperCase();

  return (
    <span className={`${sizeClass} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-slate-900 via-slate-700 to-sky-500 font-semibold text-white shadow-lg shadow-slate-300/70 ring-2 ring-white/90 transition duration-300 ease-out group-hover/avatar:-translate-y-0.5 group-hover/avatar:scale-105`}>
      {profile.avatarDataUrl ? <img src={profile.avatarDataUrl} alt="用户头像" className="h-full w-full object-cover" /> : initial}
    </span>
  );
}

export function LifeOSNav({ activeModule, profile, isSignedIn, isCloudLoading, syncStateLabel, onModuleChange, onOpenProfile, onSignIn, onSignOut }: LifeOSNavProps) {
  const displayName = getDisplayName(profile);
  const username = getUsername(profile);

  return (
    <header className="sticky top-3 z-30 overflow-visible rounded-[2rem] border border-white/70 bg-white/78 p-3 shadow-2xl shadow-slate-200/70 backdrop-blur-xl transition-all duration-500 md:top-4" aria-label="Visual Deadline 全局导航">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
      <div className="flex items-start justify-between gap-4 px-1 py-1 md:items-center md:px-2">
        <button type="button" onClick={() => onModuleChange('home')} className="group flex min-w-0 items-center gap-3 rounded-[1.5rem] px-2 py-1.5 text-left transition duration-300 hover:bg-white/55">
          <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg shadow-slate-300 ring-1 ring-slate-200/70 transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-xl">
            <img src={logoUrl} alt="Visual Deadline 标志" className="h-full w-full object-contain" />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold tracking-tight text-slate-950">{branding.productName}</span>
          </span>
        </button>

        <div className="group/avatar relative flex shrink-0 justify-end pb-3 pr-1" onMouseLeave={() => undefined}>
          <button type="button" onClick={onOpenProfile} className="rounded-full outline-none transition duration-300 focus-visible:ring-4 focus-visible:ring-sky-100" aria-label="打开个人中心">
            <Avatar profile={profile} />
          </button>

          <div className="pointer-events-none absolute right-0 top-[3.3rem] w-[18rem] translate-y-3 scale-[0.98] opacity-0 transition-all duration-300 ease-out group-hover/avatar:pointer-events-auto group-hover/avatar:translate-y-0 group-hover/avatar:scale-100 group-hover/avatar:opacity-100 group-focus-within/avatar:pointer-events-auto group-focus-within/avatar:translate-y-0 group-focus-within/avatar:scale-100 group-focus-within/avatar:opacity-100">
            <section className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/92 p-4 shadow-2xl shadow-slate-300/70 ring-1 ring-slate-900/5 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <Avatar profile={profile} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-slate-950">{displayName}</p>
                  <p className="mt-0.5 truncate text-sm text-slate-500">@{username}</p>
                </div>
              </div>

              <div className="my-4 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

              <div className="space-y-1 text-sm font-medium text-slate-600">
                <button type="button" onClick={onOpenProfile} className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left transition duration-200 hover:bg-slate-50 hover:text-slate-950">
                  个人中心 <span className="text-slate-300">⌘</span>
                </button>
                <button type="button" onClick={onOpenProfile} className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left transition duration-200 hover:bg-slate-50 hover:text-slate-950">
                  账号设置 <span className="text-slate-300">→</span>
                </button>
                <div className="rounded-2xl bg-slate-50/85 px-3 py-2.5 text-left">
                  <p className="font-semibold text-slate-700">数据同步状态</p>
                  <p className={`mt-1 text-xs leading-5 ${syncStateLabel.includes('失败') || syncStateLabel.includes('denied') ? 'text-rose-600' : 'text-slate-500'}`}>{syncStateLabel}</p>
                </div>
                <button type="button" onClick={onOpenProfile} className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left transition duration-200 hover:bg-slate-50 hover:text-slate-950">
                  安全与隐私 <span className="text-slate-300">→</span>
                </button>
              </div>

              <div className="my-4 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

              {isSignedIn ? (
                <button type="button" onClick={onSignOut} disabled={isCloudLoading} className="w-full rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-rose-500 transition duration-200 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-300">
                  退出登录
                </button>
              ) : (
                <button type="button" onClick={onSignIn} className="w-full rounded-2xl bg-slate-950 px-3 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-slate-200 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl">
                  登录同步
                </button>
              )}
            </section>
          </div>
        </div>
      </div>

      <nav className="mt-2 rounded-[1.45rem] bg-slate-100/65 p-1" aria-label="Visual Deadline 模块">
        <div className="grid grid-cols-5 gap-1 sm:flex sm:flex-wrap">
          {navItems.map((item) => {
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onModuleChange(item.id)}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition-all duration-300 ease-out md:px-4 ${isActive ? 'bg-white text-slate-950 shadow-sm shadow-slate-200' : 'text-slate-500 hover:-translate-y-0.5 hover:bg-white/65 hover:text-slate-700'}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
