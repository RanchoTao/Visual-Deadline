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

export function isHttpUrl(value: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

/** Stores only navigation-safe metadata; File and Blob objects never enter workspace persistence. */
export function stashPendingCaptureDraft(draft: CaptureDraft, userId?: string): string {
  // Kept as the public-shell boundary; transfer owns safe metadata and owner binding.
  return stageCaptureTransfer(draft, userId);
}

import { stageCaptureTransfer } from '../capture/transfer.js';
