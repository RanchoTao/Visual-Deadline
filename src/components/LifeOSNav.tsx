import type { LifeOSModule } from '../types/task';

interface LifeOSNavProps {
  activeModule: LifeOSModule;
  onModuleChange: (module: LifeOSModule) => void;
}

const navItems: { id: LifeOSModule; label: string }[] = [
  { id: 'life-map', label: '人生地图' },
  { id: 'vd', label: 'VD' },
  { id: 'social', label: '社交' },
  { id: 'profile', label: '个人主页' },
  { id: 'log', label: '日志' },
];

export function LifeOSNav({ activeModule, onModuleChange }: LifeOSNavProps) {
  return (
    <nav className="sticky top-4 z-30 rounded-[2rem] border border-white/70 bg-white/75 p-2 shadow-xl shadow-slate-200/60 backdrop-blur" aria-label="LifeOS modules">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">LifeOS Shell</p>
          <p className="mt-1 text-sm font-medium text-slate-600">Visualized-Deadline module</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-[1.5rem] bg-slate-100/70 p-1">
          {navItems.map((item) => {
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onModuleChange(item.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${isActive ? 'bg-white text-slate-950 shadow-sm shadow-slate-200' : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
