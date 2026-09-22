import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routes = await import('./.compiled/src/lib/appRoutes.js');
const capture = await import('./.compiled/src/domain/public/captureDraft.js');
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the app route contract protects only private workspace and account surfaces', () => {
  for (const path of ['/app', '/app/tasks', '/app/plan', '/app/ops', '/app/review', '/settings', '/billing']) assert.equal(routes.isAuthenticatedPath(path), true);
  for (const path of ['/', '/login', '/privacy', '/terms', '/auth/callback']) assert.equal(routes.isAuthenticatedPath(path), false);
  assert.equal(routes.safeAuthenticatedNext('/app/tasks'), '/app/tasks');
  assert.equal(routes.safeAuthenticatedNext('//attacker.invalid'), '/app');
  assert.equal(routes.safeAuthenticatedNext('/privacy'), '/app');
  assert.equal(routes.legacyRouteRedirect('/map'), '/app/plan');
});

test('the public entry is a localized multimodal composer, not a planning or marketing demo', () => {
  const home = source('src/components/PublicHome.tsx');
  const composer = source('src/components/CaptureComposer.tsx');
  assert.match(home, /CaptureComposer/);
  assert.match(home, /明确方向，/);
  assert.match(home, /有序前行。/);
  assert.match(home, /Find direction\./);
  assert.match(home, /Move with clarity\./);
  assert.match(home, /min-h-\[clamp\(34rem,64vh,44rem\)\]/);
  assert.equal(home.includes('min-h-[calc(100vh'), false);
  assert.match(composer, /type="file"/);
  assert.match(composer, /MediaRecorder/);
  assert.match(composer, /URL\.createObjectURL/);
  assert.match(composer, /aria-label=\{labels\.remove\}/);
  assert.equal(capture.isHttpUrl('https://example.com/plan'), true);
  assert.equal(capture.isHttpUrl('ftp://example.com'), false);
  for (const prohibitedDemoTerm of ['Gantt', 'DAG', 'testimonial', 'fake metric', 'chart-data']) assert.equal(home.includes(prohibitedDemoTerm), false);
});

test('public pages bypass authenticated initialization and expose complete localized footer groups', () => {
  const app = source('src/App.tsx');
  const publicSite = source('src/components/PublicSite.tsx');
  assert.ok(app.indexOf('if (isPublicSurface(path)) return <PublicSite') < app.indexOf('return <AuthenticatedApp'));
  assert.match(publicSite, /vd\.locale/);
  assert.match(publicSite, /navigator\.language/);
  for (const path of ['/research', '/security', '/report-security', '/transparency', '/careers', '/contact', '/docs', '/pricing']) assert.match(publicSite, new RegExp(`'${path}'`));
  for (const footerGroup of ['PRODUCT', 'RESEARCH', 'LEGAL & SECURITY', 'JOIN US']) assert.match(publicSite, new RegExp(footerGroup));
  assert.match(publicSite, /max-w-\[1280px\]/);
  assert.match(publicSite, /<FaGithub/);
  assert.match(publicSite, /<Mail/);
  assert.match(publicSite, /Coming Soon/);
  assert.match(publicSite, /stashPendingCaptureDraft/);
  assert.equal(publicSite.includes('SOC2'), false);
  assert.equal(publicSite.includes('ISO'), false);
  assert.equal(publicSite.includes('ICP备'), false);
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
