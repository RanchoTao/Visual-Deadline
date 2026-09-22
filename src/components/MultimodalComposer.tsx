import { useEffect, useRef, useState } from 'react';
import { isHttpUrl } from '../domain/public/captureDraft';
import { ACCEPTED_INTAKE_TYPES, classifyIntakeFile, MAX_INTAKE_FILE_SIZE, removeIntakeFile, uploadIntakeFile } from '../services/intakeStorage';
import type { IntakeAsset, MultimodalIntake } from '../types/intake';
import type { CaptureInput } from '../domain/capture/types';

interface MultimodalComposerProps {
  disabled?: boolean;
  onSubmit: (intake: MultimodalIntake) => Promise<boolean> | boolean;
  placeholder?: string;
  initialCapture?: CaptureInput;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const statusLabels: Record<IntakeAsset['status'], string> = { queued: '排队中', uploading: '上传中', uploaded: '已上传', processing: '处理中', ready: '可用', error: '失败' };

export function MultimodalComposer({ disabled = false, onSubmit, placeholder, initialCapture }: MultimodalComposerProps) {
  const [text, setText] = useState('');
  const [links, setLinks] = useState<string[]>([]);
  const [linkInput, setLinkInput] = useState('');
  const [linkNotice, setLinkNotice] = useState<string | undefined>();
  const [intakeId, setIntakeId] = useState<string>(() => crypto.randomUUID());
  const [assets, setAssets] = useState<IntakeAsset[]>([]);
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const initialCaptureRef = useRef<string | undefined>(undefined);
  const previewUrlsRef = useRef(new Set<string>());
  const unmountedRef = useRef(false);

  useEffect(() => () => {
    unmountedRef.current = true;
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current.clear();
    disposeActiveRecorder();
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (!initialCapture || initialCaptureRef.current === initialCapture.id) return;
    initialCaptureRef.current = initialCapture.id;
    setIntakeId(initialCapture.id);
    setText(initialCapture.text);
    setLinks(initialCapture.links);
    const files = initialCapture.assets.flatMap((asset) => asset.file ? [asset.file] : []);
    if (files.length) void queueFiles(files, initialCapture.id);
  }, [initialCapture]);

  function patchAsset(id: string, patch: Partial<IntakeAsset>) {
    if (unmountedRef.current) return;
    setAssets((current) => current.map((asset) => asset.id === id ? { ...asset, ...patch } : asset));
  }

  async function queueFiles(files: File[], targetIntakeId = intakeId) {
    for (const file of files) {
      if (unmountedRef.current) return;
      const kind = classifyIntakeFile(file);
      const id = crypto.randomUUID();
      if (!kind || file.size > MAX_INTAKE_FILE_SIZE) {
        setAssets((current) => [...current, { id, intakeId: targetIntakeId, kind: kind ?? 'document', fileName: file.name, mimeType: file.type || 'unknown', size: file.size, status: 'error', error: !kind ? '不支持此文件类型' : '文件不能超过 20 MB' }]);
        continue;
      }
      const previewUrl = kind === 'image' ? URL.createObjectURL(file) : undefined;
      if (previewUrl) previewUrlsRef.current.add(previewUrl);
      const asset: IntakeAsset = { id, intakeId: targetIntakeId, kind, fileName: file.name, mimeType: file.type, size: file.size, status: 'queued', previewUrl, file };
      setAssets((current) => [...current, asset]);
      patchAsset(id, { status: 'uploading', progress: 0 });
      try {
        const storagePath = await uploadIntakeFile(file, targetIntakeId, (progress) => patchAsset(id, { progress }));
        patchAsset(id, { status: 'ready', storagePath, progress: 100, file: undefined });
      } catch (error) {
        patchAsset(id, { status: 'error', error: error instanceof Error ? error.message : '上传失败' });
      }
    }
  }

  async function deleteAsset(asset: IntakeAsset) {
    if (asset.storagePath) await removeIntakeFile(asset.storagePath).catch(() => undefined);
    if (asset.previewUrl) { URL.revokeObjectURL(asset.previewUrl); previewUrlsRef.current.delete(asset.previewUrl); }
    setAssets((current) => current.filter((item) => item.id !== asset.id));
  }

  async function retryAsset(asset: IntakeAsset) {
    if (!asset.file) return deleteAsset(asset);
    patchAsset(asset.id, { status: 'uploading', error: undefined });
    try {
      const storagePath = await uploadIntakeFile(asset.file, intakeId, (progress) => patchAsset(asset.id, { progress }));
      patchAsset(asset.id, { status: 'ready', storagePath, progress: 100, file: undefined });
    } catch (error) {
      patchAsset(asset.id, { status: 'error', error: error instanceof Error ? error.message : '上传失败' });
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (unmountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
    disposeActiveRecorder();
    const recorder = new MediaRecorder(stream);
    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (event) => { if (!unmountedRef.current && event.data.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => stream.getTracks().forEach((track) => track.stop());
    setRecordingSeconds(0);
    setRecording(true);
    recorder.start();
  }

  function stopRecording(cancel = false) {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const stream = streamRef.current;
    recorderRef.current = null;
    streamRef.current = null;
    recorder.onstop = () => {
      stream?.getTracks().forEach((track) => track.stop());
      if (!unmountedRef.current && !cancel && chunksRef.current.length) {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        void queueFiles([new File([blob], `录音-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`, { type: mimeType.split(';')[0] })]);
      }
      chunksRef.current = [];
    };
    recorder.stop();
    if (!unmountedRef.current) setRecording(false);
  }

  function disposeActiveRecorder() {
    const recorder = recorderRef.current;
    const stream = streamRef.current;
    recorderRef.current = null;
    streamRef.current = null;
    chunksRef.current = [];
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    stream?.getTracks().forEach((track) => track.stop());
  }

  const busy = assets.some((asset) => ['queued', 'uploading', 'processing'].includes(asset.status));
  const readyAssets = assets.filter((asset) => asset.status === 'ready' && asset.storagePath);
  const canSubmit = !disabled && !busy && !recording && Boolean(text.trim() || readyAssets.length || links.length);

  async function submit() {
    if (!canSubmit) return;
    const accepted = await onSubmit({ intakeId, text: text.trim(), links, assets: readyAssets.map(({ storagePath, kind, mimeType, fileName, size }) => ({ storagePath: storagePath!, kind, mimeType, fileName, size })) });
    if (!accepted) return;
    setText('');
    setAssets([]);
    setIntakeId(crypto.randomUUID()); setLinks([]);
  }

  function addLink() { const value = linkInput.trim(); if (!isHttpUrl(value)) { setLinkNotice('请输入有效的 http/https URL。'); return; } if (links.includes(value)) { setLinkNotice('该 URL 已添加。'); return; } if (links.length >= 10) { setLinkNotice('最多可添加 10 个 URL。'); return; } setLinks((current) => [...current, value]); setLinkInput(''); setLinkNotice(undefined); }

  return <div className={`relative rounded-[1.5rem] border bg-white/90 transition ${dragging ? 'border-sky-400 ring-4 ring-sky-100' : 'border-slate-200/80'}`}
    onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void queueFiles(Array.from(event.dataTransfer.files)); }}
    onPaste={(event) => { const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/')); if (images.length) { event.preventDefault(); void queueFiles(images); } }}>
    {links.length ? <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">{links.map((link) => <span key={link} className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"><span className="max-w-[18rem] truncate">{link}</span><button type="button" onClick={() => setLinks((current) => current.filter((item) => item !== link))}>×</button></span>)}</div> : null}
    {assets.length ? <div className="grid gap-2 border-b border-slate-100 p-3 sm:grid-cols-2">
      {assets.map((asset) => <div key={asset.id} className="flex min-w-0 items-center gap-3 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-100">
        {asset.previewUrl ? <img src={asset.previewUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white text-xl">{asset.kind === 'audio' ? '🎙' : '📄'}</span>}
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{asset.fileName}</p><p className="mt-1 truncate text-[11px] text-slate-400">{asset.mimeType} · {formatSize(asset.size)}</p><p className={`mt-1 text-[11px] ${asset.status === 'error' ? 'text-rose-600' : 'text-sky-600'}`}>{asset.error || `${statusLabels[asset.status]}${asset.status === 'uploading' ? ` ${asset.progress ?? 0}%` : ''}`}</p></div>
        {asset.status === 'error' && asset.file ? <button type="button" onClick={() => void retryAsset(asset)} className="text-xs text-sky-600">重试</button> : null}
        <button type="button" aria-label={`删除 ${asset.fileName}`} onClick={() => void deleteAsset(asset)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white">×</button>
      </div>)}
    </div> : null}
    <textarea value={text} onChange={(event) => setText(event.target.value)} disabled={disabled} rows={3} className="min-h-28 w-full resize-none bg-transparent px-4 py-3 pb-14 text-sm leading-6 outline-none placeholder:text-slate-400" placeholder={placeholder || '描述任务，也可以添加图片、文档或录音…'} />
    {dragging ? <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-[1.5rem] bg-sky-50/90 text-sm font-semibold text-sky-700">松开以添加附件</div> : null}
    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
      <div className="relative"><button type="button" aria-label="添加附件" onClick={() => setMenuOpen((value) => !value)} disabled={disabled} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xl text-slate-600 hover:bg-slate-200">+</button>
        {menuOpen ? <div className="absolute bottom-11 left-0 z-10 w-64 rounded-xl bg-white p-2 text-sm shadow-xl ring-1 ring-slate-200"><button type="button" className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50" onClick={() => { inputRef.current?.click(); setMenuOpen(false); }}>上传图片或文件</button><div className="mt-1 flex gap-1"><input value={linkInput} onChange={(event) => setLinkInput(event.target.value)} placeholder="https://…" className="min-w-0 flex-1 rounded-lg bg-slate-50 px-2 py-1 text-xs" /><button type="button" onClick={addLink} className="rounded-lg bg-slate-900 px-2 py-1 text-xs text-white">添加链接</button></div>{linkNotice ? <p className="mt-1 text-xs text-rose-600">{linkNotice}</p> : null}</div> : null}
        <input ref={inputRef} hidden multiple type="file" accept={ACCEPTED_INTAKE_TYPES} onChange={(event) => { void queueFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
      </div>
      {recording ? <div className="flex items-center gap-2 text-xs font-semibold text-rose-600"><span className="animate-pulse">● {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}</span><button type="button" onClick={() => stopRecording(false)} className="rounded-full bg-rose-50 px-3 py-2">停止</button><button type="button" onClick={() => stopRecording(true)} className="px-2 py-2 text-slate-500">取消</button></div> : <div className="flex gap-2"><button type="button" aria-label="开始录音" onClick={() => void startRecording()} disabled={disabled || busy} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-40">🎙</button><button type="button" aria-label="提交" onClick={() => void submit()} disabled={!canSubmit} className="grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-white disabled:bg-slate-200">↑</button></div>}
    </div>
    {busy ? <p className="absolute bottom-1 left-14 text-[10px] text-sky-600">附件上传或处理中，请稍候…</p> : null}
  </div>;
}
