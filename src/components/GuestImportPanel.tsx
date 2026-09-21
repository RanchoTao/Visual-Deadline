import type { GuestImportPreview } from '../domain/v2/guestImport';

export function GuestImportPanel({ preview, onConfirm }: { preview: GuestImportPreview; onConfirm: () => void }) {
  const creates = preview.plan.records.filter((record) => record.disposition === 'CREATE').length;
  const unresolved = preview.plan.unresolvedRelationships.length;
  return <aside className="mx-auto mb-4 max-w-3xl rounded-3xl border border-amber-200 bg-amber-50/95 p-5 text-sm text-amber-950 shadow-lg" role="status">
    <p className="font-semibold">发现本机访客数据：尚未导入云端</p>
    <p className="mt-1 text-xs leading-5">已创建不可变本地恢复快照。预览不会写入云端，也不会删除本机数据。</p>
    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4"><span className="rounded-xl bg-white px-3 py-2">任务 {preview.plan.sourceCounts.tasks}</span><span className="rounded-xl bg-white px-3 py-2">目标 {preview.plan.sourceCounts.goals}</span><span className="rounded-xl bg-white px-3 py-2">计划创建 {creates}</span><span className="rounded-xl bg-white px-3 py-2">待处理关系 {unresolved}</span></div>
    {preview.unsupportedDomains.length ? <p className="mt-3 text-xs">暂不迁移、仍保留本地的域：{preview.unsupportedDomains.join('、')}。</p> : null}
    <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={onConfirm} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white">确认导入此快照</button><span className="text-xs text-amber-800">生产 v2 导入仍被运行时闸门禁用；确认不会产生云端写入。</span></div>
  </aside>;
}
