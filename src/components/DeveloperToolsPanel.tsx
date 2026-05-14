import { useState } from 'react';
import { clearValue, hasValue, saveValue, storageKeys } from '../storage';

const appStorageKeys = Object.values(storageKeys);

function getStorageKeyRows() {
  return appStorageKeys.map((key) => ({ key, exists: hasValue(key) }));
}

function reloadPage(): void {
  window.location.reload();
}

export function DeveloperToolsPanel() {
  const [isKeyListVisible, setIsKeyListVisible] = useState(false);
  const [keyRows, setKeyRows] = useState(getStorageKeyRows);

  function refreshKeyRows() {
    setKeyRows(getStorageKeyRows());
  }

  function clearAllLocalData() {
    const confirmed = window.confirm('确定要清除所有飞升本地数据并重启吗？任务、压力、人生树、社交图谱、备份快照与设置都会被删除。');
    if (!confirmed) return;
    appStorageKeys.forEach((key) => clearValue(key));
    reloadPage();
  }

  function resetOnboarding() {
    const confirmed = window.confirm('确定要重置初始问答吗？现有任务、压力、社交与人生树数据会保留。');
    if (!confirmed) return;
    saveValue(storageKeys.onboardingComplete, false);
    refreshKeyRows();
    reloadPage();
  }

  function toggleKeyList() {
    refreshKeyRows();
    setIsKeyListVisible((visible) => !visible);
  }

  return (
    <section className="rounded-[2rem] border border-dashed border-slate-200 bg-white/65 p-5 shadow-lg shadow-slate-200/50 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">开发者工具</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">本地测试与数据重置</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">用于本地测试和数据重置，正式使用时请谨慎操作。</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <button type="button" onClick={clearAllLocalData} className="rounded-3xl bg-rose-50 px-4 py-3 text-left text-sm font-semibold text-rose-600 ring-1 ring-rose-100 hover:bg-rose-100/70">
          清除本地数据并重启
          <span className="mt-1 block text-xs font-medium text-rose-400">仅清除飞升使用的本地存储键</span>
        </button>
        <button type="button" onClick={resetOnboarding} className="rounded-3xl bg-white/85 px-4 py-3 text-left text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
          重置初始问答
          <span className="mt-1 block text-xs font-medium text-slate-400">保留任务数据，重启后重新显示问答</span>
        </button>
        <button type="button" onClick={toggleKeyList} className="rounded-3xl bg-white/85 px-4 py-3 text-left text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
          查看本地存储键
          <span className="mt-1 block text-xs font-medium text-slate-400">显示当前飞升键是否存在</span>
        </button>
      </div>

      {isKeyListVisible ? (
        <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white/80">
          <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-semibold text-slate-400">
            <span>存储键</span>
            <span>状态</span>
          </div>
          <div className="divide-y divide-slate-100">
            {keyRows.map((row) => (
              <div key={row.key} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-sm">
                <code className="truncate text-xs text-slate-500">{row.key}</code>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.exists ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>{row.exists ? '存在' : '未写入'}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
