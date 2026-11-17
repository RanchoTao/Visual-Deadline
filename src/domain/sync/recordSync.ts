/**
 * Record-level cloud sync for JSON-row tables (tasks, goals).
 *
 * Replaces whole-list merge-duplicate upserts with:
 *  - dirty-only writes: a record is written only if it changed since it was last seen in sync;
 *  - compare-and-swap on the server `updated_at` so a stale client cannot overwrite a newer row;
 *  - soft-delete tombstones (`data[TOMBSTONE_FIELD]`) so deletions propagate across devices
 *    instead of being resurrected by the next load-and-merge;
 *  - a serialized channel so overlapping saves never race against their own writes.
 *
 * The module is transport-agnostic; `cloudSync.ts` supplies the Supabase REST transport.
 */

export const TOMBSTONE_FIELD = '_vdDeletedAt';
/** If inferred deletions would empty a list of at least this many records, treat it as a cache wipe, not user intent. */
export const MASS_DELETE_GUARD = 5;

export interface SyncableRecord { id: string; updatedAt?: string }
export interface RemoteMeta { id: string; updatedAt: string }
export interface RemoteRecord<T> { id: string; updatedAt: string; data: T; deletedAt?: string }
export interface SyncBaseEntry { updatedAt: string; hash: string; deleted?: boolean }
export type SyncBase = Map<string, SyncBaseEntry>;
export interface PendingDelete { id: string; deletedAt: string; data: Record<string, unknown> }

export interface RecordSyncTransport<T> {
  /** Insert rows that do not exist yet; returns metadata only for rows actually inserted. */
  insertIfAbsent(records: T[]): Promise<RemoteMeta[]>;
  /** Update one row only if its server `updated_at` still equals `baseUpdatedAt`; null when the guard fails. */
  updateIfUnchanged(record: T, baseUpdatedAt: string): Promise<RemoteMeta | null>;
  /** Replace a row with a tombstone; null when the row does not exist remotely. */
  writeTombstone(id: string, data: Record<string, unknown>): Promise<RemoteMeta | null>;
  fetch(ids: string[]): Promise<RemoteRecord<T>[]>;
}

export interface PendingDeleteStore {
  read(): PendingDelete[];
  write(entries: PendingDelete[]): void;
}

export interface SyncOutcome<T> {
  /** Newer remote versions that should replace the local copy. */
  adopted: T[];
  /** Records deleted on another device that should be removed locally. */
  removed: string[];
  conflicts: number;
}

export function emptyOutcome<T>(): SyncOutcome<T> { return { adopted: [], removed: [], conflicts: 0 }; }

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

/** 53-bit content hash (cyrb53) of a record's canonical JSON. */
export function recordHash(value: unknown): string {
  const text = stableStringify(value);
  let h1 = 0xdeadbeef; let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function parseRemoteRow<T>(row: { id: string; data: unknown; updated_at?: string | null }): RemoteRecord<T> | null {
  if (!row || typeof row.id !== 'string' || !row.data || typeof row.data !== 'object') return null;
  const data = row.data as Record<string, unknown>;
  const deletedAt = typeof data[TOMBSTONE_FIELD] === 'string' ? data[TOMBSTONE_FIELD] as string : undefined;
  return { id: row.id, updatedAt: row.updated_at ?? '', data: row.data as T, deletedAt };
}

export function tombstoneData(id: string, deletedAt: string, lastKnown?: unknown): Record<string, unknown> {
  const base = lastKnown && typeof lastKnown === 'object' ? { ...(lastKnown as Record<string, unknown>) } : {};
  return { ...base, id, [TOMBSTONE_FIELD]: deletedAt };
}

/** True when the local copy should win over a remote copy that changed concurrently. */
export function localWinsConflict(local: SyncableRecord, remote: SyncableRecord): boolean {
  return (local.updatedAt ?? '') > (remote.updatedAt ?? '');
}

/**
 * Merge a freshly loaded remote snapshot into the local cache and return the new sync base.
 * Remote tombstones remove records; records pending local deletion stay deleted; a locally
 * modified record survives only when the remote copy is unchanged since the last sync or older.
 */
export function mergeRemoteIntoLocal<T extends SyncableRecord>(
  local: readonly T[],
  remote: readonly RemoteRecord<T>[],
  base: SyncBase,
  pendingDeleteIds: ReadonlySet<string> = new Set(),
  normalize: (record: T) => T = (record) => record,
): { records: T[]; base: SyncBase } {
  const hash = (record: T) => recordHash(normalize(record));
  const nextBase: SyncBase = new Map();
  const localById = new Map(local.map((record) => [record.id, record]));
  const result = new Map<string, T>();
  for (const record of local) if (!pendingDeleteIds.has(record.id)) result.set(record.id, record);

  for (const item of remote) {
    if (item.deletedAt) {
      result.delete(item.id);
      nextBase.set(item.id, { updatedAt: item.updatedAt, hash: '', deleted: true });
      continue;
    }
    nextBase.set(item.id, { updatedAt: item.updatedAt, hash: hash(item.data) });
    if (pendingDeleteIds.has(item.id)) continue;
    const localRecord = localById.get(item.id);
    if (!localRecord) { result.set(item.id, item.data); continue; }
    const previous = base.get(item.id);
    const localDirty = previous ? hash(localRecord) !== previous.hash : hash(localRecord) !== hash(item.data);
    if (!localDirty) { result.set(item.id, item.data); continue; }
    const remoteUnchanged = Boolean(previous && !previous.deleted && previous.updatedAt === item.updatedAt);
    result.set(item.id, remoteUnchanged || localWinsConflict(localRecord, item.data) ? localRecord : item.data);
  }
  return { records: [...result.values()], base: nextBase };
}

/**
 * One sync channel per (owner, table). `push` is serialized: calls made while a push is running
 * collapse into one follow-up push of the latest list.
 */
export class RecordSyncChannel<T extends SyncableRecord> {
  private base: SyncBase = new Map();
  private lastKnown = new Map<string, T>();
  private ready = false;
  private running: Promise<SyncOutcome<T>> | undefined;
  private pending: readonly T[] | undefined;
  /** Ids in the previous pushed list; deletions are inferred only against this, never right after hydrate. */
  private lastPushedIds: Set<string> | undefined;

  constructor(
    private readonly transport: RecordSyncTransport<T>,
    private readonly deletes: PendingDeleteStore,
    private readonly normalize: (record: T) => T = (record) => record,
  ) {}

  private hash(record: T): string { return recordHash(this.normalize(record)); }

  get isReady(): boolean { return this.ready; }

  pendingDeleteIds(): Set<string> { return new Set(this.deletes.read().map((entry) => entry.id)); }

  /** Apply a remote snapshot; must run before the first push. */
  hydrate(local: readonly T[], remote: readonly RemoteRecord<T>[]): T[] {
    const merged = mergeRemoteIntoLocal(local, remote, this.base, this.pendingDeleteIds(), this.normalize);
    this.base = merged.base;
    this.lastKnown = new Map(remote.filter((item) => !item.deletedAt).map((item) => [item.id, item.data]));
    // A list queued before this snapshot predates it; drop it so stale copies cannot pass the new CAS base.
    this.pending = undefined;
    this.lastPushedIds = undefined;
    this.ready = true;
    return merged.records;
  }

  /** Explicitly queue deletions (persisted, survives reload/offline). */
  queueDeletes(records: readonly Pick<T, 'id'>[], deletedAt = new Date().toISOString()): void {
    if (!records.length) return;
    const current = this.deletes.read();
    const known = new Set(current.map((entry) => entry.id));
    const additions = records.filter((record) => !known.has(record.id)).map((record) => ({ id: record.id, deletedAt, data: tombstoneData(record.id, deletedAt, this.lastKnown.get(record.id) ?? record) }));
    if (additions.length) this.deletes.write([...current, ...additions]);
  }

  push(records: readonly T[]): Promise<SyncOutcome<T>> {
    if (!this.ready) return Promise.resolve(emptyOutcome<T>());
    this.pending = records;
    if (this.running) return this.running;
    const run = (async () => {
      const total = emptyOutcome<T>();
      while (this.pending) {
        const latest = this.pending;
        this.pending = undefined;
        const outcome = await this.pushOnce(latest);
        total.adopted.push(...outcome.adopted); total.removed.push(...outcome.removed); total.conflicts += outcome.conflicts;
      }
      return total;
    })();
    this.running = run.finally(() => { this.running = undefined; });
    return this.running;
  }

  private inferDeletes(records: readonly T[]): void {
    const present = new Set(records.map((record) => record.id));
    const previous = this.lastPushedIds;
    this.lastPushedIds = present;
    if (!previous) return;
    const missing = [...previous].filter((id) => !present.has(id) && this.base.has(id) && !this.base.get(id)?.deleted).map((id) => ({ id }));
    if (records.length === 0 && missing.length >= MASS_DELETE_GUARD) return;
    this.queueDeletes(missing);
  }

  private async pushOnce(records: readonly T[]): Promise<SyncOutcome<T>> {
    const outcome = emptyOutcome<T>();
    this.inferDeletes(records);

    const queued = this.deletes.read();
    const processed = new Set<string>();
    const clearProcessed = () => { if (processed.size) this.deletes.write(this.deletes.read().filter((entry) => !processed.has(entry.id))); };
    for (const entry of queued) {
      try {
        const meta = await this.transport.writeTombstone(entry.id, entry.data);
        this.base.set(entry.id, { updatedAt: meta?.updatedAt ?? '', hash: '', deleted: true });
        this.lastKnown.delete(entry.id);
        processed.add(entry.id);
      } catch (error) {
        clearProcessed();
        throw error;
      }
    }
    clearProcessed();
    const deletedIds = new Set(queued.map((entry) => entry.id));

    const creates: T[] = [];
    const updates: { record: T; baseUpdatedAt: string }[] = [];
    for (const record of records) {
      if (deletedIds.has(record.id)) continue;
      const previous = this.base.get(record.id);
      if (!previous || previous.deleted) { if (!previous) creates.push(record); continue; }
      if (this.hash(record) !== previous.hash) updates.push({ record, baseUpdatedAt: previous.updatedAt });
    }

    const conflicted: T[] = [];
    if (creates.length) {
      const inserted = new Map((await this.transport.insertIfAbsent(creates)).map((meta) => [meta.id, meta]));
      for (const record of creates) {
        const meta = inserted.get(record.id);
        if (meta) this.markSynced(record, meta.updatedAt); else conflicted.push(record);
      }
    }
    for (const { record, baseUpdatedAt } of updates) {
      const meta = await this.transport.updateIfUnchanged(record, baseUpdatedAt);
      if (meta) this.markSynced(record, meta.updatedAt); else conflicted.push(record);
    }
    if (conflicted.length) await this.resolveConflicts(conflicted, outcome);
    return outcome;
  }

  private markSynced(record: T, updatedAt: string): void {
    this.base.set(record.id, { updatedAt, hash: this.hash(record) });
    this.lastKnown.set(record.id, record);
  }

  private async resolveConflicts(records: T[], outcome: SyncOutcome<T>): Promise<void> {
    outcome.conflicts += records.length;
    const remote = new Map((await this.transport.fetch(records.map((record) => record.id))).map((item) => [item.id, item]));
    for (const record of records) {
      const current = remote.get(record.id);
      if (!current) {
        const inserted = await this.transport.insertIfAbsent([record]);
        if (inserted[0]) this.markSynced(record, inserted[0].updatedAt);
        continue;
      }
      if (current.deletedAt) {
        this.base.set(record.id, { updatedAt: current.updatedAt, hash: '', deleted: true });
        this.lastKnown.delete(record.id);
        outcome.removed.push(record.id);
        continue;
      }
      if (localWinsConflict(record, current.data)) {
        const meta = await this.transport.updateIfUnchanged(record, current.updatedAt);
        if (meta) { this.markSynced(record, meta.updatedAt); continue; }
        // Lost a second race: leave base stale so the next push re-resolves against fresh state.
        continue;
      }
      this.base.set(record.id, { updatedAt: current.updatedAt, hash: this.hash(current.data) });
      this.lastKnown.set(record.id, current.data);
      outcome.adopted.push(current.data);
    }
  }
}

export function applySyncOutcome<T extends SyncableRecord>(records: readonly T[], outcome: SyncOutcome<T>): T[] {
  if (!outcome.adopted.length && !outcome.removed.length) return records as T[];
  const removed = new Set(outcome.removed);
  const adopted = new Map(outcome.adopted.map((record) => [record.id, record]));
  const next = records.filter((record) => !removed.has(record.id)).map((record) => adopted.get(record.id) ?? record);
  const present = new Set(next.map((record) => record.id));
  for (const record of outcome.adopted) if (!present.has(record.id) && !removed.has(record.id)) next.push(record);
  return next;
}
