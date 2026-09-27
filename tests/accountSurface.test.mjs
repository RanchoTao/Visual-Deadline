import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const notifications = await import('./.compiled/src/domain/account/notifications.js');
const preferences = await import('./.compiled/src/domain/account/preferences.js');
const cleanup = await import('./.compiled/src/domain/account/cleanupGates.js');
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const notification = (id, isRead, createdAt = '2026-09-27T10:00:00.000Z') => ({ id, userId: 'user-a', type: 'SYSTEM', title: id, summary: id, isRead, createdAt });
const notificationRow = (id, createdAt, isRead = false) => ({ id, user_id: 'user-a', type: 'SYSTEM', title: id, summary: id, content: null, metadata: null, is_read: isRead, read_at: isRead ? '2026-09-28T10:00:00.000Z' : null, created_at: createdAt, related_entity_type: null, related_entity_id: null });

test('global account triggers route to non-primary settings, billing, and notifications surfaces', () => {
  const shell = source('src/components/V2AppShell.tsx');
  const routes = source('src/lib/appRoutes.ts');
  assert.match(shell, /onNavigate\('\/settings'\)/);
  assert.match(shell, /onNavigate\('\/billing'\)/);
  assert.match(shell, /onNavigate\('\/notifications'\)/);
  assert.match(routes, /globalAccountPaths = \['\/settings', '\/billing', '\/notifications'\]/);
  assert.match(routes, /primaryWorkspacePaths = \['\/app', '\/app\/tasks', '\/app\/plan', '\/app\/ops', '\/app\/review'\]/);
});

test('notification cross-device merge keeps a read receipt monotonic and deterministic', () => {
  const local = [notification('a', true), notification('legacy-local', false, '2026-09-26T10:00:00.000Z')];
  const cloud = [notification('a', false), notification('b', false, '2026-09-28T10:00:00.000Z')];
  const merged = notifications.mergeNotifications(local, cloud);
  assert.deepEqual(merged.map((item) => [item.id, item.isRead]), [['b', false], ['a', true], ['legacy-local', false]]);
  assert.deepEqual(notifications.markNotificationRead(merged, 'b').map((item) => [item.id, item.isRead]), [['b', true], ['a', true], ['legacy-local', false]]);
});

test('failed cloud notification receipt remains queued and a retry acknowledges it exactly once', async () => {
  const queue = new notifications.NotificationReadReceiptQueue();
  queue.enqueue({ notificationId: 'receipt-a', readAt: '2026-09-28T10:00:00.000Z' });
  let attempts = 0;
  const firstFailures = await queue.flush(async () => {
    attempts += 1;
    throw new Error('temporary network failure');
  });
  assert.equal(attempts, 1);
  assert.equal(firstFailures.length, 1);
  assert.deepEqual(queue.pending(), [{ notificationId: 'receipt-a', readAt: '2026-09-28T10:00:00.000Z' }]);

  const retryFailures = await queue.flush(async (receipt) => {
    attempts += 1;
    assert.deepEqual(receipt, { notificationId: 'receipt-a', readAt: '2026-09-28T10:00:00.000Z' });
  });
  assert.equal(attempts, 2);
  assert.deepEqual(retryFailures, []);
  assert.deepEqual(queue.pending(), []);
});

test('hydrated local-read/cloud-unread receipt converges without ever regressing cloud read state', async () => {
  const queue = new notifications.NotificationReadReceiptQueue();
  const local = [notification('shared', true)];
  const cloudUnread = [notification('shared', false)];
  queue.enqueueHydratedLocalReads(local, cloudUnread, '2026-09-28T10:00:00.000Z');
  assert.deepEqual(queue.pending(), [{ notificationId: 'shared', readAt: '2026-09-28T10:00:00.000Z' }]);

  const writes = [];
  await queue.flush(async (receipt) => { writes.push({ ...receipt, isRead: true }); });
  assert.deepEqual(writes, [{ notificationId: 'shared', readAt: '2026-09-28T10:00:00.000Z', isRead: true }]);
  assert.deepEqual(notifications.mergeNotifications([notification('shared', false)], [notification('shared', true)]).map((item) => item.isRead), [true]);
  assert.deepEqual(queue.pending(), []);
});

test('notification history pagination loads every page, removes overlaps, and has deterministic newest-first ordering', async () => {
  const pages = new Map([
    [0, [notificationRow('d', '2026-09-28T10:00:00.000Z'), notificationRow('c', '2026-09-28T09:00:00.000Z')]],
    [2, [notificationRow('b', '2026-09-28T08:00:00.000Z'), notificationRow('a', '2026-09-28T07:00:00.000Z')]],
    // An adjacent page overlap must not duplicate b; its later read state must still win monotonically.
    [4, [notificationRow('b', '2026-09-28T08:00:00.000Z', true), notificationRow('z', '2026-09-28T07:00:00.000Z')]],
  ]);
  const offsets = [];
  const rows = await notifications.collectNotificationRows(async (offset) => {
    offsets.push(offset);
    return { data: pages.get(offset) ?? [], total: 6 };
  });
  assert.deepEqual(offsets, [0, 2, 4]);
  assert.deepEqual(rows.map((row) => row.id), ['d', 'c', 'b', 'z', 'a']);
  assert.equal(rows.find((row) => row.id === 'b')?.is_read, true);
});

test('cloud notification loader uses Content-Range pagination rather than a single unpaged request', () => {
  const cloudSync = source('src/lib/cloudSync.ts');
  assert.match(cloudSync, /loadAllNotificationRows\(session\)/);
  assert.match(cloudSync, /supabase\.restPage<NotificationRow\[]>\(`notifications\?select=\$\{select\}.*order=created_at\.desc,id\.desc.*limit=\$\{REVIEW_PAGE_SIZE\}.*offset=\$\{offset\}/s);
});

test('account reminder preferences sync only account choices and retain browser permission on each device', () => {
  const deviceSettings = { reminderEnabled: false, reminderTime: '08:30', reminderType: ['daily_quest', 'deadline'], notificationPermission: 'denied' };
  const stored = preferences.toAccountReminderPreferences({ ...deviceSettings, reminderEnabled: true, reminderTime: '09:15' });
  assert.deepEqual(stored, { reminderEnabled: true, reminderTime: '09:15', reminderType: ['daily_quest', 'deadline'] });
  assert.deepEqual(preferences.mergeAccountReminderPreferences(deviceSettings, stored), { ...deviceSettings, reminderEnabled: true, reminderTime: '09:15' });
});

test('cleanup gates retain legacy paths unless all required observation and rollback evidence exists', () => {
  const blocked = cleanup.evaluateLegacyCleanupGate();
  assert.equal(blocked.mayDisableLegacyWrites, false);
  assert.equal(blocked.mayDisableLegacyReads, false);
  const ready = cleanup.evaluateLegacyCleanupGate({ matchingReadWriteRelease: true, unexplainedDivergenceCount: 0, legacyFallbackReads: 0, supportRunbookReady: true, rollbackRehearsed: true });
  assert.equal(ready.mayDisableLegacyWrites, true);
  assert.equal(ready.mayDisableLegacyReads, true);
});

test('account settings hide developer controls in production while retaining export and billing compatibility surfaces', () => {
  const profile = source('src/components/ProfilePage.tsx');
  const billing = source('src/components/BillingPage.tsx');
  const dataSafety = source('src/components/DataSafetyPanel.tsx');
  assert.match(profile, /import\.meta\.env\.DEV \? <DeveloperToolsPanel \/> : null/);
  assert.equal(profile.includes('<MembershipPanel'), false);
  assert.match(profile, /打开订阅与账单/);
  assert.match(billing, /旧版一次性会员（兼容）/);
  assert.match(dataSafety, /导出数据/);
  assert.match(dataSafety, /导入数据/);
});
