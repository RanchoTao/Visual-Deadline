import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { collectCurrentData, createExportEnvelope, formatBackupFilename, getAvailableBackupCount, getRecoveryNotice, parseImportJson, restoreData, saveAutoBackup, STORAGE_RECOVERY_EVENT } from '../storage';

function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function DataSafetyPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState(getRecoveryNotice());
  const [statusType, setStatusType] = useState<'info' | 'success' | 'error'>(getRecoveryNotice() ? 'info' : 'success');
  const [backupCount, setBackupCount] = useState(() => getAvailableBackupCount());

  useEffect(() => {
    function handleRecovery(event: Event) {
      const message = event instanceof CustomEvent && typeof event.detail?.message === 'string' ? event.detail.message : '已尝试从备份恢复。';
      setStatus(message);
      setStatusType('info');
      setBackupCount(getAvailableBackupCount());
    }

    window.addEventListener(STORAGE_RECOVERY_EVENT, handleRecovery);
    return () => window.removeEventListener(STORAGE_RECOVERY_EVENT, handleRecovery);
  }, []);

  function handleExport() {
    const envelope = createExportEnvelope(collectCurrentData());
    downloadJson(formatBackupFilename(new Date(envelope.exportedAt)), JSON.stringify(envelope, null, 2));
    saveAutoBackup();
    setBackupCount(getAvailableBackupCount());
    setStatus('已导出完整 JSON 备份，并刷新本地安全快照。');
    setStatusType('success');
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const result = parseImportJson(text);
      if (!result.ok || !result.data) {
        setStatus(result.error || '导入失败：无法识别备份结构。');
        setStatusType('error');
        return;
      }

      restoreData(result.data);
      saveAutoBackup();
      setBackupCount(getAvailableBackupCount());
      setStatus(`导入成功：已迁移到 v1.0.1 架构并立即刷新界面。`);
      setStatusType('success');
    } catch {
      setStatus('读取文件失败，请确认浏览器允许访问该 JSON 备份。');
      setStatusType('error');
    }
  }

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">数据安全 · v1.0.1</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">备份与恢复中心</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">统一导出任务、压力、人生地图、社交图谱、日志与设置；本地会自动保留滚动安全快照。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleExport} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-700">导出数据</button>
          <button type="button" onClick={handleImportClick} className="rounded-full bg-white/85 px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">导入数据</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImport} className="sr-only" />
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <p className={`rounded-2xl px-4 py-3 text-sm ${statusType === 'error' ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-100' : statusType === 'info' ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-100' : 'bg-slate-50 text-slate-500 ring-1 ring-white/80'}`}>
          {status || '系统已启用 v1.0.1 存储架构：集中读写、JSON 备份、导入校验与自动恢复。'}
        </p>
        <div className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm">{backupCount} 个本地快照</div>
      </div>
    </section>
  );
}
