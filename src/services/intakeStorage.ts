import { supabase } from '../lib/supabaseClient';
import type { IntakeAssetKind } from '../types/intake';

export const INTAKE_BUCKET = 'intake-assets';
export const MAX_INTAKE_FILE_SIZE = 20 * 1024 * 1024;

const MIME_KINDS: Record<string, IntakeAssetKind> = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/gif': 'image', 'image/webp': 'image',
  'application/pdf': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'text/plain': 'document', 'text/markdown': 'document', 'text/csv': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'audio/webm': 'audio', 'audio/ogg': 'audio', 'audio/mp4': 'audio', 'audio/mpeg': 'audio',
};

export const ACCEPTED_INTAKE_TYPES = Object.keys(MIME_KINDS).join(',');

export function classifyIntakeFile(file: File): IntakeAssetKind | undefined {
  return MIME_KINDS[file.type];
}

export function sanitizeFileName(fileName: string): string {
  const normalized = fileName.normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  return normalized.replace(/^[-.]+|[-.]+$/g, '').slice(0, 120) || 'attachment';
}

export async function uploadIntakeFile(file: File, intakeId: string, onProgress?: (progress: number) => void): Promise<string> {
  const session = await supabase.auth.getSession();
  if (!session) throw new Error('请先登录后上传附件。');
  const path = `${session.user.id}/${intakeId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
  onProgress?.(10);
  await supabase.uploadStorageObject(INTAKE_BUCKET, path, file, session);
  onProgress?.(100);
  return path;
}

export async function removeIntakeFile(path: string): Promise<void> {
  const session = await supabase.auth.getSession();
  if (!session) return;
  await supabase.removeStorageObject(INTAKE_BUCKET, path, session);
}
