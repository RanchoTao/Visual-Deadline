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
  { id: 'me', label: '我' },
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
    <nav className="sticky top-3 z-30 rounded-[1.75rem] border border-white/70 bg-white/80 p-2 shadow-xl shadow-slate-200/60 backdrop-blur md:top-4" aria-label="可视模块">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="px-3 py-1.5">
          <p className="text-sm font-semibold tracking-tight text-slate-950">{branding.productName}</p>
          <p className="mt-1 text-sm font-medium text-slate-600">{branding.tagline}</p>
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
