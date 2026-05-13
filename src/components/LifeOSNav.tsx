import type { LifeOSModule } from '../types/task';

interface LifeOSNavProps {
  activeModule: LifeOSModule;
  onModuleChange: (module: LifeOSModule) => void;
}

const navItems: { id: LifeOSModule; label: string }[] = [
  { id: 'home', label: '首页' },
  { id: 'task', label: '任务' },
  { id: 'map', label: '人生' },
  { id: 'social', label: '社交' },
  { id: 'log', label: '复盘' },
  { id: 'me', label: '我' },
];

export function LifeOSNav({ activeModule, onModuleChange }: LifeOSNavProps) {
  return (
    <nav className="sticky top-3 z-30 rounded-[1.75rem] border border-white/70 bg-white/80 p-2 shadow-xl shadow-slate-200/60 backdrop-blur md:top-4" aria-label="LifeOS 模块">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="px-3 py-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">LifeOS</p>
          <p className="mt-1 text-sm font-medium text-slate-600">个人操作系统</p>
        </div>
        <div className="grid grid-cols-6 gap-1 rounded-[1.35rem] bg-slate-100/70 p-1 sm:flex sm:flex-wrap">
          {navItems.map((item) => {
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onModuleChange(item.id)}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition md:px-4 ${isActive ? 'bg-white text-slate-950 shadow-sm shadow-slate-200' : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'}`}
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
