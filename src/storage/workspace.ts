import type { StorageAdapter } from './dataSafety.js';
import { STORAGE_CHANGE_EVENT, storageKeys } from './schema.js';

export type WorkspaceOwner = { kind: 'guest' } | { kind: 'user'; userId: string };
export type AuthenticatedWorkspaceOwner = Extract<WorkspaceOwner, { kind: 'user' }>;

const WORKSPACE_OWNER_FORMAT = 'vd.workspace.owner.v1';
export const WORKSPACE_OWNER_CHANGE_EVENT = 'vd-workspace-owner-change';

export function guestWorkspaceOwner(): WorkspaceOwner { return { kind: 'guest' }; }
export function userWorkspaceOwner(userId: string): AuthenticatedWorkspaceOwner {
  if (!userId.trim()) throw new Error('WORKSPACE_OWNER_USER_ID_REQUIRED');
  return { kind: 'user', userId };
}

export function workspaceOwnerKey(owner: WorkspaceOwner): string {
  return owner.kind === 'guest' ? 'guest' : `user:${owner.userId}`;
}

/** Guest compatibility stays on legacy keys; authenticated caches never read or write them. */
export function workspaceStorageKey(owner: WorkspaceOwner, legacyKey: string): string {
  return owner.kind === 'guest' ? legacyKey : `vd.workspace.user.${encodeURIComponent(owner.userId)}.${legacyKey}`;
}

export function readWorkspaceOwner(storage: StorageAdapter): WorkspaceOwner {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(storageKeys.workspaceActiveOwner) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return guestWorkspaceOwner();
    const value = parsed as { format?: unknown; kind?: unknown; userId?: unknown };
    if (value.format !== WORKSPACE_OWNER_FORMAT) return guestWorkspaceOwner();
    if (value.kind === 'guest') return guestWorkspaceOwner();
    if (value.kind === 'user' && typeof value.userId === 'string' && value.userId) return userWorkspaceOwner(value.userId);
  } catch { /* Fail closed to the legacy guest workspace. */ }
  return guestWorkspaceOwner();
}

export function setWorkspaceOwner(storage: StorageAdapter, owner: WorkspaceOwner): void {
  storage.setItem(storageKeys.workspaceActiveOwner, JSON.stringify({ format: WORKSPACE_OWNER_FORMAT, ...owner }));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WORKSPACE_OWNER_CHANGE_EVENT, { detail: { owner } }));
    window.dispatchEvent(new CustomEvent(STORAGE_CHANGE_EVENT, { detail: { key: storageKeys.workspaceActiveOwner } }));
  }
}

export function readWorkspaceValue<T>(storage: StorageAdapter, owner: WorkspaceOwner, legacyKey: string, fallback: T): T {
  const raw = storage.getItem(workspaceStorageKey(owner, legacyKey));
  if (raw === null) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function writeWorkspaceValue<T>(storage: StorageAdapter, owner: WorkspaceOwner, legacyKey: string, value: T): void {
  storage.setItem(workspaceStorageKey(owner, legacyKey), JSON.stringify(value));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STORAGE_CHANGE_EVENT, { detail: { key: workspaceStorageKey(owner, legacyKey) } }));
}

/** An explicit current-workspace reset never reaches another owner's cache. */
export function removeWorkspaceValue(storage: StorageAdapter, owner: WorkspaceOwner, legacyKey: string): void {
  const key = workspaceStorageKey(owner, legacyKey);
  storage.removeItem(key);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STORAGE_CHANGE_EVENT, { detail: { key } }));
}

export function assertWorkspaceSessionOwner(owner: WorkspaceOwner, sessionUserId: string): asserts owner is AuthenticatedWorkspaceOwner {
  if (owner.kind !== 'user' || !sessionUserId || owner.userId !== sessionUserId) throw new Error('WORKSPACE_OWNER_SESSION_MISMATCH');
}

/** Reconciliation is permitted only after both inputs are bound to the same authenticated owner. */
export function mergeAuthenticatedWorkspaceRecords<T extends { id: string }>(owner: WorkspaceOwner, sessionUserId: string, ownerCache: readonly T[], cloudRecords: readonly T[]): T[] {
  assertWorkspaceSessionOwner(owner, sessionUserId);
  const merged = new Map<string, T>();
  ownerCache.forEach((item) => merged.set(item.id, item));
  cloudRecords.forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
}
