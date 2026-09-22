import { useEffect, useRef, useState } from 'react';
import { EMPTY_CAPTURE_DRAFT, isHttpUrl, type CaptureAttachment, type CaptureDraft } from '../domain/public/captureDraft';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function fileSizeLabel(size: number): string { return size < 1_048_576 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1_048_576).toFixed(1)} MB`; }

export interface CaptureLabels { file: string; image: string; url: string; voice: string; stop: string; add: string; voiceItem: string; invalidUrl: string; microphoneUnavailable: string; fileTooLarge: (name: string) => string; remove: string; }

export function CaptureComposer({ placeholder, submitLabel, labels, onSubmit }: { placeholder: string; submitLabel: string; labels: CaptureLabels; onSubmit: (draft: CaptureDraft) => void }) {
  const [draft, setDraft] = useState<CaptureDraft>(EMPTY_CAPTURE_DRAFT);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const recordingStartedAt = useRef(0);
  const currentAttachments = useRef<CaptureAttachment[]>([]);

  useEffect(() => {
    setVoiceSupported(typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined');
    return () => currentAttachments.current.forEach((attachment) => { if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl); });
  }, []);

  useEffect(() => { currentAttachments.current = draft.attachments; }, [draft.attachments]);

  function stageFiles(files: FileList | null) {
    if (!files) return;
    const staged: CaptureAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE_BYTES) { setNotice(labels.fileTooLarge(file.name)); continue; }
      const kind = file.type.startsWith('image/') ? 'image' : 'file';
      staged.push({ id: crypto.randomUUID(), kind, file, previewUrl: kind === 'image' ? URL.createObjectURL(file) : undefined });
    }
    if (staged.length) setDraft((current) => ({ ...current, attachments: [...current.attachments, ...staged] }));
  }

  function removeAttachment(id: string) {
    setDraft((current) => {
      const attachment = current.attachments.find((item) => item.id === id);
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      return { ...current, attachments: current.attachments.filter((item) => item.id !== id) };
    });
  }

  function addUrl() {
    const normalized = urlInput.trim();
    if (!isHttpUrl(normalized)) { setNotice(labels.invalidUrl); return; }
    setDraft((current) => current.links.includes(normalized) ? current : { ...current, links: [...current.links, normalized] });
    setUrlInput(''); setNotice(undefined);
  }

  async function startVoiceRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const nextRecorder = new MediaRecorder(stream);
      recorder.current = nextRecorder;
      recordingStartedAt.current = Date.now();
      nextRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      nextRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: nextRecorder.mimeType || 'audio/webm' });
        setDraft((current) => ({ ...current, audio: { blob, durationSeconds: Math.max(1, Math.round((Date.now() - recordingStartedAt.current) / 1000)) } }));
        setIsRecording(false);
      };
      nextRecorder.start(); setIsRecording(true); setNotice(undefined);
    } catch { setNotice(labels.microphoneUnavailable); }
  }

  function stopVoiceRecording() { recorder.current?.stop(); }
  const hasDraft = Boolean(draft.text.trim() || draft.attachments.length || draft.links.length || draft.audio);

  return <form className="mt-10 w-full text-left sm:mt-12" onSubmit={(event) => { event.preventDefault(); if (hasDraft) onSubmit({ ...draft, text: draft.text.trim() }); }}>
    <label htmlFor="vd-capture" className="sr-only">{placeholder}</label>
    <div className="rounded-[1.6rem] border border-zinc-200/90 bg-white/90 p-3 shadow-[0_22px_70px_-46px_rgba(83,34,25,.34)] backdrop-blur-sm transition focus-within:border-zinc-400 sm:p-4">
      <textarea id="vd-capture" value={draft.text} onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))} rows={4} placeholder={placeholder} className="min-h-28 w-full resize-none bg-transparent px-2 py-1 text-base leading-7 outline-none placeholder:text-zinc-400 sm:text-lg" />
      {draft.attachments.length || draft.links.length || draft.audio ? <div className="flex flex-wrap gap-2 px-2 pb-2">{draft.attachments.map((attachment) => <span key={attachment.id} className="flex max-w-full items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 py-1.5 pl-2 pr-1.5 text-xs text-zinc-600">{attachment.previewUrl ? <img src={attachment.previewUrl} alt="" className="h-7 w-7 rounded object-cover" /> : null}<span className="truncate">{attachment.file.name} · {attachment.file.type || attachment.kind} · {fileSizeLabel(attachment.file.size)}</span><button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={`${labels.remove} ${attachment.file.name}`} className="rounded px-1 text-zinc-400 hover:text-zinc-800">×</button></span>)}{draft.links.map((link) => <span key={link} className="flex max-w-full items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 py-1.5 pl-2 pr-1.5 text-xs text-zinc-600"><span className="truncate">{link}</span><button type="button" onClick={() => setDraft((current) => ({ ...current, links: current.links.filter((item) => item !== link) }))} aria-label={`${labels.remove} ${link}`} className="rounded px-1 text-zinc-400 hover:text-zinc-800">×</button></span>)}{draft.audio ? <span className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 py-1.5 pl-2 pr-1.5 text-xs text-zinc-600">{labels.voiceItem} · {draft.audio.durationSeconds}s<button type="button" onClick={() => setDraft((current) => ({ ...current, audio: undefined }))} aria-label={labels.remove} className="rounded px-1 text-zinc-400 hover:text-zinc-800">×</button></span> : null}</div> : null}
      {showUrlInput ? <div className="flex gap-2 px-2 pb-2"><input value={urlInput} onChange={(event) => setUrlInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addUrl(); } }} placeholder="https://" className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" /><button type="button" onClick={addUrl} className="rounded-lg px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100">{labels.add}</button></div> : null}
      {notice ? <p className="px-2 pb-2 text-xs text-amber-700" role="status">{notice}</p> : null}
      <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-1 pt-3"><div className="flex flex-wrap items-center gap-1"><input ref={imageInput} type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { stageFiles(event.target.files); event.currentTarget.value = ''; }} /><input ref={fileInput} type="file" multiple className="sr-only" onChange={(event) => { stageFiles(event.target.files); event.currentTarget.value = ''; }} /><button type="button" onClick={() => fileInput.current?.click()} className="rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-500 hover:bg-zinc-100">{labels.file}</button><button type="button" onClick={() => imageInput.current?.click()} className="rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-500 hover:bg-zinc-100">{labels.image}</button><button type="button" onClick={() => setShowUrlInput((open) => !open)} className="rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-500 hover:bg-zinc-100">{labels.url}</button>{voiceSupported ? <button type="button" onClick={isRecording ? stopVoiceRecording : () => void startVoiceRecording()} className={`rounded-lg px-2.5 py-2 text-xs font-medium ${isRecording ? 'bg-red-50 text-red-700' : 'text-zinc-500 hover:bg-zinc-100'}`}>{isRecording ? labels.stop : labels.voice}</button> : null}</div><button type="submit" aria-label={submitLabel} disabled={!hasDraft} className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-[#d94a43] px-3 text-sm font-semibold text-white transition hover:bg-[#c43b35] disabled:cursor-not-allowed disabled:bg-zinc-200">{submitLabel}</button></div>
    </div>
  </form>;
}
