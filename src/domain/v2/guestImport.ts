import type { Goal as LegacyGoal, Task as LegacyTask } from '../../types/task.js';
import { createCompleteBackup, type CompleteBackupEnvelope, type StorageAdapter } from '../../storage/dataSafety.js';
import { storageKeys } from '../../storage/schema.js';
import { planV2Backfill, type V2BackfillPlan } from './backfill.js';
import type { UserId } from './shared.js';

export type GuestImportState = 'NO_GUEST_SOURCE' | 'GUEST_SOURCE_PENDING' | 'GUEST_IMPORT_DISABLED' | 'guest_detected' | 'inventory_created' | 'preview_ready' | 'user_confirmed' | 'import_running' | 'verifying' | 'completed' | 'needs_resolution' | 'failed_recoverable';
export interface PendingGuestImportSnapshot {
  readonly format: 'vd.guest-import.pending.v1';
  readonly state: GuestImportState;
  readonly snapshotId: string;
  readonly snapshotChecksum: string;
  readonly createdAt: string;
  readonly backupSchemaVersion: string;
  readonly backup: CompleteBackupEnvelope;
  readonly clientRequestId?: string;
}
export interface GuestImportPreview {
  readonly state: 'preview_ready';
  readonly snapshotId: string;
  readonly snapshotChecksum: string;
  readonly destinationUserId: UserId;
  readonly backup: CompleteBackupEnvelope;
  readonly plan: V2BackfillPlan;
  readonly unsupportedDomains: readonly string[];
}
export interface GuestImportConfirmation {
  readonly snapshotId: string;
  readonly snapshotChecksum: string;
  readonly destinationUserId: UserId;
  readonly clientRequestId: string;
}

const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

export function readPendingGuestImport(storage: StorageAdapter): PendingGuestImportSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(storageKeys.guestImportPending) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Partial<PendingGuestImportSnapshot>;
    if (value.format !== 'vd.guest-import.pending.v1' || typeof value.snapshotId !== 'string' || typeof value.snapshotChecksum !== 'string' || !value.backup || typeof value.createdAt !== 'string') return null;
    return value as PendingGuestImportSnapshot;
  } catch { return null; }
}

/** Capture is only called while conclusively unauthenticated, before an auth action starts. */
export function captureGuestImportSource(storage: StorageAdapter, now = new Date().toISOString()): PendingGuestImportSnapshot | null {
  const existing = readPendingGuestImport(storage);
  if (existing) return existing;
  const backup = createCompleteBackup(storage, now);
  const tasks = asArray<LegacyTask>(backup.domains.tasks?.payload);
  const goals = asArray<LegacyGoal>(backup.domains.goals?.payload);
  if (tasks.length === 0 && goals.length === 0) return null;
  const snapshot: PendingGuestImportSnapshot = { format: 'vd.guest-import.pending.v1', state: 'GUEST_SOURCE_PENDING', snapshotId: `local:${backup.metadata.contentChecksum}`, snapshotChecksum: backup.metadata.contentChecksum, createdAt: now, backupSchemaVersion: backup.schemaVersion, backup };
  storage.setItem(storageKeys.guestImportPending, JSON.stringify(snapshot));
  return snapshot;
}

export function guestSourceChanged(storage: StorageAdapter, snapshot: PendingGuestImportSnapshot): boolean {
  return createCompleteBackup(storage).metadata.contentChecksum !== snapshot.snapshotChecksum;
}

/** The recovery record is immutable in content; only orchestration state/request metadata advances. */
export function advanceGuestImportState(storage: StorageAdapter, snapshot: PendingGuestImportSnapshot, state: GuestImportState, clientRequestId = snapshot.clientRequestId): PendingGuestImportSnapshot {
  const next: PendingGuestImportSnapshot = { ...snapshot, state, ...(clientRequestId ? { clientRequestId } : {}) };
  storage.setItem(storageKeys.guestImportPending, JSON.stringify(next));
  return next;
}

/** Pure local snapshot plus PR F plan. It cannot issue cloud writes or select an owner from browser input. */
export function createGuestImportPreview(storage: StorageAdapter, destinationUserId: UserId): GuestImportPreview {
  const backup = createCompleteBackup(storage);
  return createGuestImportPreviewFromBackup(backup, destinationUserId);
}

export function createGuestImportPreviewFromPending(snapshot: PendingGuestImportSnapshot, destinationUserId: UserId): GuestImportPreview {
  return createGuestImportPreviewFromBackup(snapshot.backup, destinationUserId);
}

function createGuestImportPreviewFromBackup(backup: CompleteBackupEnvelope, destinationUserId: UserId): GuestImportPreview {
  const tasks = asArray<LegacyTask>(backup.domains.tasks?.payload);
  const goals = asArray<LegacyGoal>(backup.domains.goals?.payload);
  const plan = planV2Backfill({ userId: destinationUserId, sourceSystem: 'visualdeadline-v1', sourceSchemaVersion: backup.metadata.storageSchemaVersion, goals, tasks });
  const unsupportedDomains = Object.entries(backup.domains)
    .filter(([domain, entry]) => entry.present && !['tasks', 'goals'].includes(domain))
    .map(([domain]) => domain)
    .sort();
  return { state: 'preview_ready', snapshotId: `local:${backup.metadata.contentChecksum}`, snapshotChecksum: backup.metadata.contentChecksum, destinationUserId, backup, plan, unsupportedDomains };
}

export function validateGuestImportConfirmation(preview: GuestImportPreview, confirmation: GuestImportConfirmation, authenticatedUserId: UserId): void {
  if (authenticatedUserId !== preview.destinationUserId || confirmation.destinationUserId !== authenticatedUserId) throw new Error('GUEST_IMPORT_OWNER_MISMATCH');
  if (confirmation.snapshotId !== preview.snapshotId || confirmation.snapshotChecksum !== preview.snapshotChecksum) throw new Error('GUEST_IMPORT_SNAPSHOT_CHANGED');
  if (!confirmation.clientRequestId.trim()) throw new Error('GUEST_IMPORT_REQUEST_ID_REQUIRED');
}

export function validatePendingGuestImportConfirmation(storage: StorageAdapter, snapshot: PendingGuestImportSnapshot, preview: GuestImportPreview, confirmation: GuestImportConfirmation, authenticatedUserId: UserId): void {
  if (guestSourceChanged(storage, snapshot)) throw new Error('GUEST_IMPORT_SOURCE_CHANGED');
  validateGuestImportConfirmation(preview, confirmation, authenticatedUserId);
}

/** Deliberate production gate: browser confirmation never enables canonical v2 writes. */
export function assertGuestCloudImportRuntimeEnabled(): never {
  throw new Error('GUEST_IMPORT_RUNTIME_DISABLED_UNTIL_V2_SCHEMA_DEPLOYMENT');
}
