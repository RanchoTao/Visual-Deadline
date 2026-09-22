import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routes = await import('./.compiled/src/lib/appRoutes.js');
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the app route contract protects only private workspace and account surfaces', () => {
  for (const path of ['/app', '/app/tasks', '/app/plan', '/app/ops', '/app/review', '/settings', '/billing']) assert.equal(routes.isAuthenticatedPath(path), true);
  for (const path of ['/', '/login', '/privacy', '/terms', '/auth/callback']) assert.equal(routes.isAuthenticatedPath(path), false);
  assert.equal(routes.safeAuthenticatedNext('/app/tasks'), '/app/tasks');
  assert.equal(routes.safeAuthenticatedNext('//attacker.invalid'), '/app');
  assert.equal(routes.safeAuthenticatedNext('/privacy'), '/app');
  assert.equal(routes.legacyRouteRedirect('/map'), '/app/plan');
});

test('the public entry is a localized composer, not a planning or marketing demo', () => {
  const home = source('src/components/PublicHome.tsx');
  assert.match(home, /vd\.locale/);
  assert.match(home, /navigator\.language/);
  assert.match(home, /<textarea/);
  assert.match(home, /Privacy/);
  assert.match(home, /Terms/);
  for (const prohibitedDemoTerm of ['Gantt', 'DAG', 'testimonial', 'fake metric', 'chart-data']) assert.equal(home.includes(prohibitedDemoTerm), false);
});

test('the app shell has the frozen five-page primary navigation and global account controls', () => {
  const shell = source('src/components/V2AppShell.tsx');
  for (const [path, label] of [['/app', 'NOW'], ['/app/tasks', 'TASKS'], ['/app/plan', 'PLAN'], ['/app/ops', 'OPS'], ['/app/review', 'REVIEW']]) assert.match(shell, new RegExp(`\\['${path.replaceAll('/', '\\/')}', '${label}'\\]`));
  assert.match(shell, /Notifications/);
  assert.match(shell, /Profile and settings/);
  assert.match(shell, /\/billing/);
  assert.equal(shell.includes("'ME'"), false);
});

test('the auth surface has no guest entry and keeps debug controls development-only', () => {
  const auth = source('src/components/AuthPanel.tsx');
  assert.equal(auth.includes('继续使用本地模式'), false);
  assert.match(auth, /import\.meta\.env\.DEV && authDebugInfo/);
  assert.match(auth, /验证码登录/);
  assert.match(auth, /密码登录/);
});
