import type { Goal as LegacyGoal, Task as LegacyTask } from '../../types/task.js';
import { createCompleteBackup, type CompleteBackupEnvelope, type StorageAdapter } from '../../storage/dataSafety.js';
import { planV2Backfill, type V2BackfillPlan } from './backfill.js';
import type { UserId } from './shared.js';

export type GuestImportState = 'guest_detected' | 'inventory_created' | 'preview_ready' | 'user_confirmed' | 'failed_recoverable';
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

/** Pure local snapshot plus PR F plan. It cannot issue cloud writes or select an owner from browser input. */
export function createGuestImportPreview(storage: StorageAdapter, destinationUserId: UserId): GuestImportPreview {
  const backup = createCompleteBackup(storage);
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

/** Deliberate production gate: browser confirmation never enables canonical v2 writes. */
export function assertGuestCloudImportRuntimeEnabled(): never {
  throw new Error('GUEST_IMPORT_RUNTIME_DISABLED_UNTIL_V2_SCHEMA_DEPLOYMENT');
}
