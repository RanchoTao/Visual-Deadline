export type CaptureAttachmentKind = 'image' | 'file';

export interface CaptureAttachment {
  id: string;
  kind: CaptureAttachmentKind;
  file: File;
  previewUrl?: string;
}

export interface CaptureAudio {
  blob: Blob;
  durationSeconds: number;
}

export interface CaptureDraft {
  text: string;
  attachments: CaptureAttachment[];
  links: string[];
  audio?: CaptureAudio;
}

export interface PendingCaptureDraft {
  text: string;
  attachments: Array<Pick<CaptureAttachment, 'id' | 'kind'> & { name: string; type: string; size: number }>;
  links: string[];
  audioDurationSeconds?: number;
}

export const EMPTY_CAPTURE_DRAFT: CaptureDraft = { text: '', attachments: [], links: [] };
const PENDING_CAPTURE_KEY = 'vd.pending-capture-draft';

export function isHttpUrl(value: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

/** Stores only navigation-safe metadata; File and Blob objects never enter workspace persistence. */
export function stashPendingCaptureDraft(draft: CaptureDraft): void {
  const pending: PendingCaptureDraft = {
    text: draft.text,
    attachments: draft.attachments.map(({ id, kind, file }) => ({ id, kind, name: file.name, type: file.type, size: file.size })),
    links: draft.links,
    audioDurationSeconds: draft.audio?.durationSeconds,
  };
  try { window.sessionStorage.setItem(PENDING_CAPTURE_KEY, JSON.stringify(pending)); } catch { /* Session storage is optional. */ }
}

export function readPendingCaptureDraft(): PendingCaptureDraft | undefined {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(PENDING_CAPTURE_KEY) ?? 'null');
    return value && typeof value === 'object' ? value as PendingCaptureDraft : undefined;
  } catch { return undefined; }
}
