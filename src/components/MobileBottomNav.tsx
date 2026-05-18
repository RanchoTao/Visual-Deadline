import type { LifeOSModule } from '../types/task';

interface MobileBottomNavProps {
  activeModule: LifeOSModule;
  onModuleChange: (module: LifeOSModule) => void;
}

const navItems: { id: LifeOSModule; label: string; icon: string }[] = [
  { id: 'home', label: '首页', icon: '⌂' },
  { id: 'task', label: '任务', icon: '✓' },
  { id: 'map', label: '人生', icon: '✦' },
  { id: 'social', label: '社交', icon: '○' },
  { id: 'log', label: '数据', icon: '▥' },
];

export function MobileBottomNav({ activeModule, onModuleChange }: MobileBottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/80 bg-white/90 px-2 pt-2 shadow-[0_-16px_40px_rgba(148,163,184,0.24)] backdrop-blur-xl md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Visual Deadline 移动端模块导航">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1 rounded-[1.35rem] bg-slate-100/70 p-1">
        {navItems.map((item) => {
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onModuleChange(item.id)}
              className={`flex min-h-12 flex-col items-center justify-center rounded-2xl px-2 py-1.5 text-[11px] font-semibold transition-all duration-200 ${isActive ? 'bg-white text-slate-950 shadow-sm shadow-slate-200' : 'text-slate-500 active:bg-white/70'}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="text-base leading-none" aria-hidden="true">{item.icon}</span>
              <span className="mt-1 leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
