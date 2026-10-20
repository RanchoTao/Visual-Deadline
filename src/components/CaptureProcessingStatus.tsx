import { LoaderCircle, Square } from 'lucide-react';

interface CaptureProcessingStatusProps {
  stage: 'uploading' | 'interpreting';
  elapsedSeconds: number;
  onStop: () => void;
}

function elapsedLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * The API currently returns one JSON result, not streamed model tokens.
 * Show only observed request phases; never manufacture per-step completion or percentage.
 */
export function CaptureProcessingStatus({ stage, elapsedSeconds, onStop }: CaptureProcessingStatusProps) {
  const uploading = stage === 'uploading';
  const status = uploading ? '正在处理附件' : '正在整理你的任务';
  const detail = uploading
    ? '附件请求正在处理。完成后将发送给 AI。'
    : elapsedSeconds >= 60
      ? '请求仍在进行中。复杂整理可能需要更长时间，也可以停止后调整输入。'
      : '正在等待 AI 返回目标、任务及约束的结构化结果。';

  return <section data-testid="capture-processing" className="vd-subpanel mt-4 border-sky-100 bg-gradient-to-br from-sky-50/90 via-white to-white p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-900 text-white">
          <LoaderCircle aria-hidden="true" className="h-5 w-5 motion-safe:animate-spin motion-reduce:animate-none" />
        </div>
        <div className="min-w-0">
          <p role="status" aria-live="polite" className="vd-thinking-text text-sm font-semibold">{status}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
        </div>
      </div>
      <span aria-label="已等待时间" className="shrink-0 font-mono text-xs tabular-nums text-slate-500">{elapsedLabel(elapsedSeconds)}</span>
    </div>
    <div aria-hidden="true" className="mt-4 space-y-2.5">
      <div className="h-2.5 w-[88%] rounded-full bg-slate-100 motion-safe:animate-pulse" />
      <div className="h-2.5 w-[66%] rounded-full bg-slate-100 motion-safe:animate-pulse" />
      <div className="h-2.5 w-[48%] rounded-full bg-slate-100 motion-safe:animate-pulse" />
    </div>
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
      <p className="text-xs text-slate-500">不会自动创建或修改任务，完成后由你确认。</p>
      <button type="button" onClick={onStop} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
        <Square aria-hidden="true" className="h-3 w-3 fill-current" />停止
      </button>
    </div>
  </section>;
}
