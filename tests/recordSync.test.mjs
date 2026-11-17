import test from 'node:test';
import assert from 'node:assert/strict';
import { MASS_DELETE_GUARD, RecordSyncChannel, TOMBSTONE_FIELD, applySyncOutcome, mergeRemoteIntoLocal, parseRemoteRow } from './.compiled/src/domain/sync/recordSync.js';
import { collectReviewRowPages } from './.compiled/src/domain/review/pagination.js';

/** In-memory stand-in for the Supabase JSON-row table, including the updated_at trigger and CAS filter. */
class FakeServer {
  constructor(records = []) { this.rows = new Map(); this.clock = 0; this.calls = { insert: 0, update: 0, tombstone: 0, fetch: 0 }; for (const record of records) this.rows.set(record.id, { data: record, updatedAt: this.tick() }); }
  tick() { this.clock += 1; return `2026-11-17T00:00:${String(this.clock).padStart(2, '0')}.000000+00:00`; }
  snapshot() { return [...this.rows.entries()].map(([id, row]) => parseRemoteRow({ id, data: row.data, updated_at: row.updatedAt })); }
  data(id) { return this.rows.get(id)?.data; }
  transport() {
    return {
      insertIfAbsent: async (records) => { this.calls.insert += 1; const inserted = []; for (const record of records) { if (this.rows.has(record.id)) continue; const updatedAt = this.tick(); this.rows.set(record.id, { data: record, updatedAt }); inserted.push({ id: record.id, updatedAt }); } return inserted; },
      updateIfUnchanged: async (record, base) => { this.calls.update += 1; const row = this.rows.get(record.id); if (!row || row.updatedAt !== base) return null; row.data = record; row.updatedAt = this.tick(); return { id: record.id, updatedAt: row.updatedAt }; },
      writeTombstone: async (id, data) => { this.calls.tombstone += 1; const row = this.rows.get(id); if (!row) return null; row.data = data; row.updatedAt = this.tick(); return { id, updatedAt: row.updatedAt }; },
      fetch: async (ids) => { this.calls.fetch += 1; return this.snapshot().filter((row) => ids.includes(row.id)); },
    };
  }
}

class MemoryDeletes { constructor() { this.entries = []; } read() { return [...this.entries]; } write(entries) { this.entries = [...entries]; } }

const task = (id, title, updatedAt = '2026-11-01T00:00:00.000Z') => ({ id, title, updatedAt });

function client(server, local = [], deletes = new MemoryDeletes()) {
  const channel = new RecordSyncChannel(server.transport(), deletes);
  const records = channel.hydrate(local, server.snapshot());
  return { channel, records, deletes };
}

test('a stale client editing task A does not overwrite a newer task B (F02)', async () => {
  const server = new FakeServer([task('a', 'A1'), task('b', 'B1')]);
  const one = client(server);
  const two = client(server);
  await two.channel.push(two.records.map((t) => t.id === 'b' ? task('b', 'B2', '2026-11-02T00:00:00.000Z') : t));
  await one.channel.push(one.records.map((t) => t.id === 'a' ? task('a', 'A2', '2026-11-02T00:00:00.000Z') : t));
  assert.equal(server.data('a').title, 'A2');
  assert.equal(server.data('b').title, 'B2');
});

test('only changed records are written', async () => {
  const server = new FakeServer(Array.from({ length: 20 }, (_, i) => task(`t${i}`, `T${i}`)));
  const one = client(server);
  await one.channel.push(one.records);
  assert.equal(server.calls.update, 0, 'unchanged list writes nothing');
  await one.channel.push(one.records.map((t) => t.id === 't3' ? { ...t, title: 'changed', updatedAt: '2026-11-03T00:00:00.000Z' } : t));
  assert.equal(server.calls.update, 1);
  assert.equal(server.calls.insert, 0);
});

test('same-row conflict adopts the newer remote copy instead of overwriting it', async () => {
  const server = new FakeServer([task('b', 'B1')]);
  const one = client(server);
  const two = client(server);
  await two.channel.push([task('b', 'B-remote', '2026-11-05T00:00:00.000Z')]);
  const outcome = await one.channel.push([task('b', 'B-stale', '2026-11-04T00:00:00.000Z')]);
  assert.equal(server.data('b').title, 'B-remote');
  assert.equal(outcome.conflicts, 1);
  assert.deepEqual(outcome.adopted.map((t) => t.title), ['B-remote']);
  assert.deepEqual(applySyncOutcome([task('b', 'B-stale')], outcome).map((t) => t.title), ['B-remote']);
});

test('same-row conflict keeps the local copy when it is newer', async () => {
  const server = new FakeServer([task('b', 'B1')]);
  const one = client(server);
  const two = client(server);
  await two.channel.push([task('b', 'B-remote', '2026-11-04T00:00:00.000Z')]);
  const outcome = await one.channel.push([task('b', 'B-local', '2026-11-05T00:00:00.000Z')]);
  assert.equal(server.data('b').title, 'B-local');
  assert.equal(outcome.adopted.length, 0);
});

test('a deleted task is tombstoned and does not come back on another device', async () => {
  const server = new FakeServer([task('a', 'A'), task('b', 'B')]);
  const one = client(server);
  await one.channel.push(one.records);
  await one.channel.push(one.records.filter((t) => t.id !== 'a'));
  assert.equal(typeof server.data('a')[TOMBSTONE_FIELD], 'string');
  assert.equal(server.data('a').title, 'A', 'tombstone keeps the last known entity for older clients');
  const otherDeviceCache = [task('a', 'A'), task('b', 'B')];
  const two = client(server, otherDeviceCache);
  assert.deepEqual(two.records.map((t) => t.id), ['b']);
});

test('remote deletion during a push removes the record locally', async () => {
  const server = new FakeServer([task('a', 'A')]);
  const one = client(server);
  const two = client(server);
  await two.channel.push(two.records);
  await two.channel.push([]);
  const outcome = await one.channel.push([task('a', 'A-edit', '2026-11-09T00:00:00.000Z')]);
  assert.deepEqual(outcome.removed, ['a']);
  assert.equal(typeof server.data('a')[TOMBSTONE_FIELD], 'string');
});

test('explicitly queued deletion survives a reload and is never resurrected by hydrate', async () => {
  const server = new FakeServer([task('a', 'A'), task('b', 'B')]);
  const deletes = new MemoryDeletes();
  const first = client(server, [], deletes);
  first.channel.queueDeletes([task('a', 'A')]);
  // reload before the push ran: a brand-new channel shares only the persisted queue
  const second = client(server, first.records, deletes);
  assert.deepEqual(second.records.map((t) => t.id), ['b']);
  await second.channel.push(second.records);
  assert.equal(typeof server.data('a')[TOMBSTONE_FIELD], 'string');
  assert.equal(deletes.read().length, 0);
});

test('a failed tombstone stays queued for retry', async () => {
  const server = new FakeServer([task('a', 'A')]);
  const deletes = new MemoryDeletes();
  const one = client(server, [], deletes);
  const transport = server.transport();
  transport.writeTombstone = async () => { throw new Error('offline'); };
  const offline = new RecordSyncChannel(transport, deletes);
  offline.hydrate([], server.snapshot());
  offline.queueDeletes([task('a', 'A')]);
  await assert.rejects(offline.push([]), /offline/);
  assert.deepEqual(deletes.read().map((entry) => entry.id), ['a']);
  await one.channel.push([]);
  assert.equal(deletes.read().length, 0);
});

test('an emptied cache is not treated as mass deletion', async () => {
  const records = Array.from({ length: MASS_DELETE_GUARD }, (_, i) => task(`t${i}`, `T${i}`));
  const server = new FakeServer(records);
  const one = client(server);
  await one.channel.push(one.records);
  await one.channel.push([]);
  assert.equal(server.calls.tombstone, 0);
});

test('offline-created records are inserted after hydrate', async () => {
  const server = new FakeServer([task('a', 'A')]);
  const one = client(server, [task('local', 'made offline')]);
  assert.deepEqual(one.records.map((t) => t.id).sort(), ['a', 'local']);
  await one.channel.push(one.records);
  assert.equal(server.data('local').title, 'made offline');
});

test('no deletions are inferred from the first push after hydrate', async () => {
  const server = new FakeServer([task('a', 'A'), task('b', 'B')]);
  const one = client(server);
  await one.channel.push([task('a', 'A')]);
  assert.equal(server.calls.tombstone, 0);
});

test('hydrate keeps an unsynced local edit only when it is newer than the remote copy', () => {
  const remote = [parseRemoteRow({ id: 'a', data: task('a', 'remote', '2026-11-02T00:00:00.000Z'), updated_at: 'x' })];
  assert.equal(mergeRemoteIntoLocal([task('a', 'local', '2026-11-03T00:00:00.000Z')], remote, new Map()).records[0].title, 'local');
  assert.equal(mergeRemoteIntoLocal([task('a', 'local', '2026-11-01T00:00:00.000Z')], remote, new Map()).records[0].title, 'remote');
});

test('paged loading returns every row past the 1000-row server cap (F03)', async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({ id: `r${String(i).padStart(4, '0')}` }));
  const loaded = await collectReviewRowPages(async (offset) => ({ data: rows.slice(offset, offset + 500), total: rows.length }));
  assert.equal(loaded.length, 1001);
  assert.equal(new Set(loaded.map((row) => row.id)).size, 1001);
});
