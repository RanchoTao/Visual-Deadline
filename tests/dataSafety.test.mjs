import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_SCHEMA_VERSION,
  buildRestorePlan,
  checksumValue,
  createCompleteBackup,
  parseBackupText,
  restoreBackup,
  stableStringify,
} from './.compiled/src/storage/dataSafety.js';
import { EXPORTABLE_STORAGE_DOMAINS, STORAGE_DOMAIN_INVENTORY } from './.compiled/src/storage/inventory.js';
import { storageKeys } from './.compiled/src/storage/schema.js';

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); this.failOnceKey = undefined; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.failOnceKey === key) { this.failOnceKey = undefined; throw new Error(`injected failure: ${key}`); } this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
  snapshot() { return Object.fromEntries(this.values); }
}

function seededStorage() {
  const entries = {};
  for (const item of EXPORTABLE_STORAGE_DOMAINS) entries[item.storageKey] = JSON.stringify(item.defaultValue ?? null);
  entries[storageKeys.tasks] = JSON.stringify([{ id: 't1', title: 'Ship PR D' }]);
  entries[storageKeys.goals] = JSON.stringify([{ id: 'g1', title: 'Safe migration' }]);
  entries[storageKeys.aiSettings] = JSON.stringify({ provider: 'openai-compatible', baseUrl: 'https://example.test/v1', model: 'safe-model', apiKey: 'sk-never-export' });
  entries[storageKeys.profile] = JSON.stringify({ nickname: 'R', avatarUrl: 'https://cdn.test/a.png?token=secret&v=2' });
  entries[storageKeys.aiArtifacts] = JSON.stringify([{ id: 'a1', metadata: { storagePath: 'user/intake/file.png' }, sourceRefs: ['user/intake/file.png'] }]);
  entries[storageKeys.planningPlanVersions] = JSON.stringify([{ id: 'p1', version: 1, status: 'accepted' }]);
  entries[storageKeys.roadmaps] = JSON.stringify([{ id: 'r1', title: 'Roadmap' }]);
  entries[storageKeys.notifications] = JSON.stringify([{ id: 'n1', isRead: true }]);
  entries[storageKeys.dailyQuest] = JSON.stringify({ id: 'q1', status: 'active' });
  entries[storageKeys.dailyReview] = JSON.stringify({ id: 'dr1', userNote: 'done' });
  entries[storageKeys.reminderSettings] = JSON.stringify({ reminderEnabled: true, reminderTime: '09:00' });
  entries[storageKeys.lifeMapNodes] = JSON.stringify([{ id: 'lm1' }]);
  entries[storageKeys.lifeMapLayoutVersion] = '3';
  entries[storageKeys.lifeEventsByOwner] = JSON.stringify({ local: [{ id: 'le1', type: 'wake' }] });
  entries[storageKeys.socialNodes] = JSON.stringify([{ id: 's1', name: 'friend' }]);
  entries[storageKeys.socialLayoutVersion] = '2';
  entries[storageKeys.achievements] = JSON.stringify([{ id: 'ach1' }]);
  entries[storageKeys.onboardingComplete] = 'true';
  entries['vd.supabase.session'] = JSON.stringify({ access_token: 'jwt', refresh_token: 'refresh' });
  entries[storageKeys.backup1] = JSON.stringify({ old: true });
  return new MemoryStorage(entries);
}

function refreshed(envelope) {
  envelope.metadata.domainCount = Object.keys(envelope.domains).length;
  envelope.metadata.totalRecordCount = Object.values(envelope.domains).reduce((sum, domain) => sum + domain.recordCount, 0);
  envelope.metadata.contentChecksum = checksumValue({ domains: envelope.domains, attachments: envelope.attachments });
  return envelope;
}

test('inventory classifies every declared storage key', () => {
  const keys = new Set(STORAGE_DOMAIN_INVENTORY.map((item) => item.storageKey));
  for (const key of Object.values(storageKeys)) assert.ok(keys.has(key), key);
});

test('inventory has no duplicate domain IDs', () => {
  const ids = STORAGE_DOMAIN_INVENTORY.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every user-owned domain is exportable', () => {
  assert.ok(STORAGE_DOMAIN_INVENTORY.filter((item) => item.ownership === 'user-owned').every((item) => item.exportPolicy !== 'exclude'));
});

test('complete export includes every exportable domain', () => {
  const envelope = createCompleteBackup(seededStorage(), '2026-09-20T00:00:00.000Z');
  assert.deepEqual(Object.keys(envelope.domains).sort(), EXPORTABLE_STORAGE_DOMAINS.map((item) => item.id).sort());
});

test('complete export includes tasks and goals', () => {
  const domains = createCompleteBackup(seededStorage()).domains;
  assert.equal(domains.tasks.recordCount, 1);
  assert.equal(domains.goals.recordCount, 1);
});

test('complete export includes accepted planning versions', () => {
  const domain = createCompleteBackup(seededStorage()).domains['planning.plan-versions'];
  assert.equal(domain.payload[0].status, 'accepted');
});

test('absent domain remains explicitly absent', () => {
  const envelope = createCompleteBackup(new MemoryStorage());
  assert.equal(envelope.domains.tasks.present, false);
  assert.deepEqual(envelope.domains.tasks.payload, []);
});

test('stable stringify ignores object key insertion order', () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), stableStringify({ a: 1, b: 2 }));
});

test('checksums are deterministic', () => {
  assert.equal(checksumValue({ b: 2, a: 1 }), checksumValue({ a: 1, b: 2 }));
});

test('AI API key is excluded while non-secret settings survive', () => {
  const payload = createCompleteBackup(seededStorage()).domains['ai.settings'].payload;
  assert.equal(payload.apiKey, '');
  assert.equal(payload.model, 'safe-model');
});

test('nested credential fields are excluded', () => {
  const storage = seededStorage();
  storage.setItem(storageKeys.aiArtifacts, JSON.stringify([{ metadata: { secret: 'no', title: 'yes' } }]));
  const text = JSON.stringify(createCompleteBackup(storage));
  assert.doesNotMatch(text, /"secret":"no"/);
});

test('Supabase session and tokens are excluded', () => {
  const text = JSON.stringify(createCompleteBackup(seededStorage()));
  assert.doesNotMatch(text, /sk-never-export|refresh_token|access_token|"jwt"|"refresh"/);
});

test('rolling backups are not recursively exported', () => {
  const text = JSON.stringify(createCompleteBackup(seededStorage()));
  assert.doesNotMatch(text, /"old":true/);
});

test('signed URL credentials are stripped', () => {
  const profile = createCompleteBackup(seededStorage()).domains.profile.payload;
  assert.equal(profile.avatarUrl, 'https://cdn.test/a.png?v=2');
});

test('avatar reference is listed in attachment manifest', () => {
  const envelope = createCompleteBackup(seededStorage());
  assert.ok(envelope.attachments.some((item) => item.kind === 'avatar'));
});

test('intake storage path is listed in attachment manifest', () => {
  const envelope = createCompleteBackup(seededStorage());
  assert.ok(envelope.attachments.some((item) => item.kind === 'intake-asset' && item.storagePath === 'user/intake/file.png'));
});

test('missing attachment metadata produces an explicit warning', () => {
  const storage = seededStorage();
  storage.setItem(storageKeys.aiArtifacts, JSON.stringify([{ id: 'a-missing', metadata: { fileName: 'lost.png', mimeType: 'image/png', size: 12 } }]));
  const envelope = createCompleteBackup(storage);
  assert.ok(envelope.attachments.some((item) => item.availability === 'missing'));
  assert.ok(envelope.warnings.some((warning) => warning.code === 'MISSING_ATTACHMENT_REFERENCE'));
});

test('attachment manifest warns that binaries are not embedded', () => {
  const envelope = createCompleteBackup(seededStorage());
  assert.ok(envelope.warnings.some((warning) => warning.code === 'ATTACHMENT_CONTENT_NOT_EMBEDDED'));
});

test('corrupt local JSON is preserved as evidence and marks export incomplete', () => {
  const storage = seededStorage(); storage.setItem(storageKeys.tasks, '{broken');
  const envelope = createCompleteBackup(storage);
  assert.equal(envelope.metadata.complete, false);
  assert.equal(envelope.domains.tasks.status, 'corrupt');
  assert.equal(envelope.domains.tasks.raw, '{broken');
});

test('invalid JSON input fails before restore planning', () => {
  assert.deepEqual(parseBackupText('{bad'), { ok: false, error: 'File is not valid JSON.' });
});

test('all supported domains round-trip exactly after sanitization', () => {
  const source = seededStorage();
  const envelope = createCompleteBackup(source, '2026-09-20T00:00:00.000Z');
  const target = new MemoryStorage();
  const result = restoreBackup(target, envelope, '2026-09-20T00:01:00.000Z');
  assert.equal(result.ok, true);
  for (const item of EXPORTABLE_STORAGE_DOMAINS) {
    const domain = envelope.domains[item.id];
    assert.equal(target.getItem(item.storageKey), domain.present ? JSON.stringify(domain.payload) : null, item.id);
  }
});

for (const [label, domainId, key, assertion] of [
  ['Roadmap survives round trip', 'roadmaps', storageKeys.roadmaps, (value) => value[0].id === 'r1'],
  ['Notifications survive round trip including read state', 'notifications', storageKeys.notifications, (value) => value[0].isRead === true],
  ['Daily Quest survives round trip', 'daily.quest', storageKeys.dailyQuest, (value) => value.id === 'q1'],
  ['Daily Review survives round trip', 'daily.review', storageKeys.dailyReview, (value) => value.userNote === 'done'],
  ['Reminder settings survive round trip', 'reminders.settings', storageKeys.reminderSettings, (value) => value.reminderEnabled === true],
  ['Life Map data and layout survive round trip', 'life-map.nodes', storageKeys.lifeMapNodes, (value, target) => value[0].id === 'lm1' && JSON.parse(target.getItem(storageKeys.lifeMapLayoutVersion)) === 3],
  ['Life Controller events survive round trip', 'life-controller.events', storageKeys.lifeEventsByOwner, (value) => value.local[0].id === 'le1'],
  ['Social data and layout survive round trip', 'social.nodes', storageKeys.socialNodes, (value, target) => value[0].id === 's1' && JSON.parse(target.getItem(storageKeys.socialLayoutVersion)) === 2],
  ['Achievements and AI artifacts survive round trip', 'achievements', storageKeys.achievements, (value, target) => value[0].id === 'ach1' && JSON.parse(target.getItem(storageKeys.aiArtifacts))[0].id === 'a1'],
  ['Profile and onboarding survive round trip', 'profile', storageKeys.profile, (value, target) => value.nickname === 'R' && JSON.parse(target.getItem(storageKeys.onboardingComplete)) === true],
  ['Current accepted plan survives round trip', 'planning.plan-versions', storageKeys.planningPlanVersions, (value) => value[0].status === 'accepted'],
]) {
  test(label, () => {
    const envelope = createCompleteBackup(seededStorage());
    const target = new MemoryStorage();
    assert.equal(restoreBackup(target, envelope).ok, true);
    assert.ok(assertion(JSON.parse(target.getItem(key)), target), domainId);
  });
}

test('empty account round-trips as an empty account', () => {
  const envelope = createCompleteBackup(new MemoryStorage());
  const target = seededStorage();
  assert.equal(restoreBackup(target, envelope).ok, true);
  for (const item of EXPORTABLE_STORAGE_DOMAINS) assert.equal(target.getItem(item.storageKey), null, item.id);
});

test('export record counts and checksums are internally consistent', () => {
  const envelope = createCompleteBackup(seededStorage());
  const total = Object.values(envelope.domains).reduce((sum, domain) => sum + domain.recordCount, 0);
  assert.equal(envelope.metadata.totalRecordCount, total);
  for (const domain of Object.values(envelope.domains)) if (domain.status === 'ok') assert.equal(domain.checksum, checksumValue(domain.payload));
});

test('domain checksum mismatch causes zero mutations', () => {
  const target = new MemoryStorage({ keep: 'yes' });
  const before = target.snapshot();
  const envelope = createCompleteBackup(seededStorage());
  envelope.domains.tasks.payload = [{ id: 'tampered' }];
  refreshed(envelope);
  envelope.domains.tasks.checksum = 'fnv1a32:00000000';
  const result = restoreBackup(target, envelope);
  assert.equal(result.ok, false);
  assert.deepEqual(target.snapshot(), before);
});

test('envelope checksum mismatch causes zero mutations', () => {
  const target = new MemoryStorage({ keep: 'yes' });
  const envelope = createCompleteBackup(seededStorage());
  envelope.metadata.contentChecksum = 'fnv1a32:00000000';
  assert.equal(restoreBackup(target, envelope).ok, false);
  assert.equal(target.getItem('keep'), 'yes');
});

test('future envelope schema is rejected', () => {
  const envelope = createCompleteBackup(seededStorage()); envelope.schemaVersion = '99.0';
  assert.match(buildRestorePlan(envelope).error, /future backup schema/);
});

test('future domain version is rejected', () => {
  const envelope = createCompleteBackup(seededStorage()); envelope.domains.tasks.version = 99; refreshed(envelope);
  assert.match(buildRestorePlan(envelope).error, /unsupported future version/);
});

test('unknown domains are skipped with a warning', () => {
  const envelope = createCompleteBackup(seededStorage());
  envelope.domains.future = { version: 1, present: true, status: 'ok', recordCount: 1, checksum: checksumValue({ x: 1 }), payload: { x: 1 } }; refreshed(envelope);
  const plan = buildRestorePlan(envelope);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.plan.unknownDomains, ['future']);
});

test('partial backup mutates only included domains', () => {
  const envelope = createCompleteBackup(seededStorage());
  envelope.domains = { tasks: envelope.domains.tasks }; envelope.attachments = []; refreshed(envelope);
  const target = new MemoryStorage({ [storageKeys.goals]: JSON.stringify([{ id: 'keep' }]) });
  assert.equal(restoreBackup(target, envelope).ok, true);
  assert.equal(target.getItem(storageKeys.goals), JSON.stringify([{ id: 'keep' }]));
});

test('explicitly absent domain removes that key', () => {
  const envelope = createCompleteBackup(new MemoryStorage());
  envelope.domains = { tasks: envelope.domains.tasks }; envelope.attachments = []; refreshed(envelope);
  const target = new MemoryStorage({ [storageKeys.tasks]: '[{"id":"old"}]' });
  assert.equal(restoreBackup(target, envelope).ok, true);
  assert.equal(target.getItem(storageKeys.tasks), null);
});

test('restore creates a rollback snapshot before mutation', () => {
  const target = new MemoryStorage({ [storageKeys.tasks]: '[{"id":"before"}]' });
  const envelope = createCompleteBackup(seededStorage());
  assert.equal(restoreBackup(target, envelope).rollbackCreated, true);
  const rollback = JSON.parse(target.getItem(storageKeys.restoreRollback));
  assert.equal(rollback.domains.tasks.payload[0].id, 'before');
});

test('write failure rolls every affected domain back', () => {
  const target = new MemoryStorage({ [storageKeys.tasks]: '[{"id":"before"}]', [storageKeys.goals]: '[{"id":"before-g"}]' });
  target.failOnceKey = storageKeys.goals;
  const result = restoreBackup(target, createCompleteBackup(seededStorage()));
  assert.equal(result.ok, false); assert.equal(result.rolledBack, true);
  assert.equal(target.getItem(storageKeys.tasks), '[{"id":"before"}]');
  assert.equal(target.getItem(storageKeys.goals), '[{"id":"before-g"}]');
});

test('repeated restore is idempotent for user domain values', () => {
  const envelope = createCompleteBackup(seededStorage()); const target = new MemoryStorage();
  assert.equal(restoreBackup(target, envelope, '2026-09-20T00:00:00.000Z').ok, true);
  const once = Object.fromEntries(EXPORTABLE_STORAGE_DOMAINS.map((item) => [item.id, target.getItem(item.storageKey)]));
  assert.equal(restoreBackup(target, envelope, '2026-09-20T00:00:00.000Z').ok, true);
  const twice = Object.fromEntries(EXPORTABLE_STORAGE_DOMAINS.map((item) => [item.id, target.getItem(item.storageKey)]));
  assert.deepEqual(twice, once);
});

test('legacy 0.9 envelope restores supported sections', () => {
  const legacy = { app: 'Visual Deadline', schemaVersion: '0.9', data: { tasks: [{ id: 'old' }], pressure: { history: [{ id: 'ph' }] }, settings: { onboardingComplete: true } } };
  const target = new MemoryStorage(); const result = restoreBackup(target, legacy);
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(target.getItem(storageKeys.tasks))[0].id, 'old');
});

test('legacy partial restore leaves newer domains untouched', () => {
  const target = new MemoryStorage({ [storageKeys.roadmaps]: '[{"id":"keep"}]' });
  restoreBackup(target, { app: 'Visualized-Deadline', data: { tasks: [] } });
  assert.equal(target.getItem(storageKeys.roadmaps), '[{"id":"keep"}]');
});

test('wrong application backup is rejected', () => {
  const envelope = createCompleteBackup(seededStorage()); envelope.app = 'Other App';
  assert.match(buildRestorePlan(envelope).error, /does not belong/);
});

test('secret-bearing restore payload is rejected', () => {
  const envelope = createCompleteBackup(seededStorage());
  envelope.domains['ai.settings'].payload.apiKey = 'restored-secret';
  envelope.domains['ai.settings'].checksum = checksumValue(envelope.domains['ai.settings'].payload); refreshed(envelope);
  assert.match(buildRestorePlan(envelope).error, /secret material/);
});

test('corrupt-marked domain is rejected', () => {
  const envelope = createCompleteBackup(seededStorage()); envelope.domains.tasks.status = 'corrupt'; refreshed(envelope);
  assert.match(buildRestorePlan(envelope).error, /marked corrupt/);
});

test('domain count mismatch is rejected', () => {
  const envelope = createCompleteBackup(seededStorage()); envelope.metadata.domainCount += 1;
  assert.match(buildRestorePlan(envelope).error, /domain count/);
});

test('invalid known-domain payload shape is rejected before mutation', () => {
  const envelope = createCompleteBackup(seededStorage());
  envelope.domains.tasks.payload = { not: 'an array' };
  envelope.domains.tasks.recordCount = 1;
  envelope.domains.tasks.checksum = checksumValue(envelope.domains.tasks.payload);
  refreshed(envelope);
  assert.match(buildRestorePlan(envelope).error, /invalid shape/);
});

test('restore does not start when current data cannot produce a complete rollback snapshot', () => {
  const target = new MemoryStorage({ [storageKeys.tasks]: '{corrupt-current' });
  const result = restoreBackup(target, createCompleteBackup(seededStorage()));
  assert.equal(result.ok, false);
  assert.equal(result.rollbackCreated, true);
  assert.equal(target.getItem(storageKeys.tasks), '{corrupt-current');
});

test('backup with no supported domain is rejected', () => {
  const envelope = createCompleteBackup(seededStorage()); envelope.domains = {}; envelope.attachments = []; refreshed(envelope);
  assert.match(buildRestorePlan(envelope).error, /no supported/);
});

test('restore never deletes rolling backups', () => {
  const target = new MemoryStorage({ [storageKeys.backup1]: '{"old":1}', [storageKeys.backup2]: '{"old":2}' });
  assert.equal(restoreBackup(target, createCompleteBackup(seededStorage())).ok, true);
  assert.equal(target.getItem(storageKeys.backup1), '{"old":1}');
  assert.equal(target.getItem(storageKeys.backup2), '{"old":2}');
});

test('legacy Visualized-Deadline application name is accepted', () => {
  const result = buildRestorePlan({ app: 'Visualized-Deadline', data: { tasks: [] } });
  assert.equal(result.ok, true);
});

test('backup schema version is explicit and current', () => {
  assert.equal(createCompleteBackup(seededStorage()).schemaVersion, BACKUP_SCHEMA_VERSION);
});
