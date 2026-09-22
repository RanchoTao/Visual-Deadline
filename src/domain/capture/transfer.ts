import type { CaptureDraft } from '../public/captureDraft.js';
import type { CaptureInput, CaptureOwnerKey } from './types.js';

interface StoredPendingCapture {
  id: string;
  ownerKey: CaptureOwnerKey;
  text: string;
  links: string[];
  attachments: Array<{ id: string; kind: 'image' | 'document'; name: string; type: string; size: number }>;
  audioDurationSeconds?: number;
}

const KEY = 'vd.pending-capture-draft';
const memory = new Map<string, CaptureDraft>();
const owner = (userId?: string): CaptureOwnerKey => userId ? `user:${userId}` : 'guest';
function read(): StoredPendingCapture | undefined { try { const value = JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null') as unknown; return value && typeof value === 'object' ? value as StoredPendingCapture : undefined; } catch { return undefined; } }
function write(value: StoredPendingCapture): void { try { window.sessionStorage.setItem(KEY, JSON.stringify(value)); } catch { /* safe handoff is best effort */ } }

/** File/Blob stay only in module memory; session storage holds reattach-safe metadata. */
export function stageCaptureTransfer(draft: CaptureDraft, userId?: string): string {
  const id = crypto.randomUUID(); memory.set(id, draft);
  write({ id, ownerKey: owner(userId), text: draft.text, links: draft.links, attachments: draft.attachments.map(({ id: attachmentId, kind, file }) => ({ id: attachmentId, kind: kind === 'image' ? 'image' : 'document', name: file.name, type: file.type, size: file.size })), audioDurationSeconds: draft.audio?.durationSeconds });
  return id;
}

/** Guest drafts may be claimed once by the next authenticated capture flow; another user cannot read user-bound drafts. */
export function claimCaptureTransfer(userId: string): CaptureInput | undefined {
  const pending = read(); if (!pending) return undefined;
  const destination = owner(userId);
  if (pending.ownerKey !== 'guest' && pending.ownerKey !== destination) return undefined;
  if (pending.ownerKey === 'guest') { pending.ownerKey = destination; write(pending); }
  const draft = memory.get(pending.id);
  const files = new Map(draft?.attachments.map((attachment) => [attachment.id, attachment]) ?? []);
  const assets: CaptureInput['assets'] = pending.attachments.map((attachment) => { const source = files.get(attachment.id); return { id: attachment.id, kind: attachment.kind, name: attachment.name, mimeType: attachment.type, size: attachment.size, status: source ? 'ready' as const : 'needs_reattach' as const, file: source?.file }; });
  if (draft?.audio) assets.push({ id: 'audio', kind: 'audio', name: '录音', mimeType: draft.audio.blob.type, size: draft.audio.blob.size, durationSeconds: draft.audio.durationSeconds, status: 'ready', file: new File([draft.audio.blob], '录音.webm', { type: draft.audio.blob.type || 'audio/webm' }) });
  return { id: pending.id, ownerKey: destination, text: pending.text, links: pending.links, assets };
}

export function clearCaptureTransfer(userId: string, captureId: string): void {
  const pending = read(); if (!pending || pending.id !== captureId || pending.ownerKey !== owner(userId)) return;
  memory.delete(captureId); try { window.sessionStorage.removeItem(KEY); } catch { /* optional */ }
}
