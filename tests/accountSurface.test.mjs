import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const notifications = await import('./.compiled/src/domain/account/notifications.js');
const preferences = await import('./.compiled/src/domain/account/preferences.js');
const cleanup = await import('./.compiled/src/domain/account/cleanupGates.js');
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const notification = (id, isRead, createdAt = '2026-09-27T10:00:00.000Z') => ({ id, userId: 'user-a', type: 'SYSTEM', title: id, summary: id, isRead, createdAt });

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
  assert.match(profile, /打开 Subscription \/ Billing/);
  assert.match(billing, /Legacy one-time Billing v1/);
  assert.match(dataSafety, /导出数据/);
  assert.match(dataSafety, /导入数据/);
});
