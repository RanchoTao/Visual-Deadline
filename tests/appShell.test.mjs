import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routes = await import('./.compiled/src/lib/appRoutes.js');
const capture = await import('./.compiled/src/domain/public/captureDraft.js');
const publicRouteTargets = await import('./.compiled/src/domain/public/publicRouteTargets.js');
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the app route contract protects only private workspace and account surfaces', () => {
  for (const path of ['/app', '/app/tasks', '/app/plan', '/app/ops', '/app/review', '/settings', '/billing', '/notifications']) assert.equal(routes.isAuthenticatedPath(path), true);
  for (const path of ['/', '/login', '/privacy', '/terms', '/auth/callback']) assert.equal(routes.isAuthenticatedPath(path), false);
  assert.equal(routes.safeAuthenticatedNext('/app/tasks'), '/app/tasks');
  assert.equal(routes.safeAuthenticatedNext('//attacker.invalid'), '/app');
  assert.equal(routes.safeAuthenticatedNext('/privacy'), '/app');
  assert.equal(routes.legacyRouteRedirect('/map'), '/app/plan');
  assert.equal(routes.isKnownAuthenticatedEntryPath('/login'), true);
  assert.equal(routes.isKnownAuthenticatedEntryPath('/definitely-not-a-route'), false);
});

test('the public entry is a localized multimodal composer, not a planning or marketing demo', () => {
  const home = source('src/components/PublicHome.tsx');
  const composer = source('src/components/CaptureComposer.tsx');
  assert.match(home, /CaptureComposer/);
  assert.match(home, /明确方向，/);
  assert.match(home, /有序前行。/);
  assert.match(home, /告诉我你正在处理什么。/);
  assert.match(home, /min-h-\[clamp\(34rem,64vh,44rem\)\]/);
  assert.match(home, /onClick=\{onLogin\}/);
  assert.equal(home.includes("onSubmit({ text: '', attachments: [], links: [] })"), false);
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
  assert.match(publicSite, /return 'zh-CN';/);
  for (const path of ['/research', '/security', '/report-security', '/transparency', '/careers', '/contact', '/docs', '/pricing']) assert.match(publicSite, new RegExp(`'${path}'`));
  for (const footerGroup of ['产品', '研究', '法务与安全', '加入我们']) assert.match(publicSite, new RegExp(footerGroup));
  assert.match(publicSite, /max-w-\[1280px\]/);
  assert.match(publicSite, /<FaGithub/);
  assert.match(publicSite, /<Mail/);
  assert.match(publicSite, /即将推出/);
  assert.match(publicSite, /stashPendingCaptureDraft/);
  assert.match(publicSite, /footerLinkTypography = 'whitespace-nowrap text-left text-sm font-normal leading-\[1\.75\] tracking-normal/);
  assert.match(publicSite, /footerHeadingTypography = 'text-sm font-semibold leading-\[1\.5\] tracking-normal/);
  assert.match(publicSite, /footerProductRow = 'inline-flex items-baseline gap-1\.5 whitespace-nowrap'/);
  assert.match(publicSite, /className=\{`border-0 bg-transparent p-0 \$\{footerLinkTypography\}`\}/);
  assert.match(publicSite, /text-xs font-normal leading-\[1\.5\] tracking-normal text-zinc-400/);
  assert.match(publicSite, /Visual Deadline 移动端/);
  assert.equal(publicSite.includes('Visual Deadline 移动端 · 即将推出'), false);
  assert.equal(publicSite.includes('SOC2'), false);
  assert.equal(publicSite.includes('ISO'), false);
  assert.equal(publicSite.includes('ICP备'), false);
});

test('public routing preserves canonical legal documents and never sends unknown paths into OPS', () => {
  const app = source('src/App.tsx');
  const publicSite = source('src/components/PublicSite.tsx');
  assert.match(publicSite, /import \{ PrivacyPolicyPage \} from '.\/PrivacyPolicyPage';/);
  assert.match(publicSite, /import \{ TermsPage \} from '.\/TermsPage';/);
  assert.match(publicSite, /path === '\/privacy' \|\| path === '\/privacy\.html'.*<PrivacyPolicyPage/s);
  assert.match(publicSite, /path === '\/terms'.*<TermsPage/s);
  assert.match(app, /if \(!isKnownAuthenticatedEntryPath\(path\)\) return <PublicNotFound onNavigate=\{navigate\} \/>;/);
  assert.equal(app.indexOf('if (!isKnownAuthenticatedEntryPath(path))') < app.indexOf('return <AuthenticatedApp />'), true);
  assert.equal(app.includes("publicPath === '/definitely-not-a-route'"), false);
});

test('public auth awareness is lazy, safe without configuration, and preserves the correct capture destination', () => {
  const publicSite = source('src/components/PublicSite.tsx');
  assert.match(publicSite, /if \(!supabase\.isConfigured\) return/);
  assert.match(publicSite, /supabase\.auth\.getSession\(\)/);
  assert.match(publicSite, /isAuthenticated=\{isAuthenticated\}/);
  assert.equal(publicRouteTargets.publicAccountTarget(true), '/app');
  assert.equal(publicRouteTargets.publicAccountTarget(false), '/login');
  assert.equal(publicRouteTargets.publicCaptureTarget(true), '/app');
  assert.equal(publicRouteTargets.publicCaptureTarget(false), '/login?next=%2Fapp');
});

test('public recorder cleanup releases the active stream and suppresses teardown drafts', () => {
  const composer = source('src/components/CaptureComposer.tsx');
  assert.match(composer, /const mediaStream = useRef<MediaStream/);
  assert.match(composer, /discardActiveRecording\(\);/);
  assert.match(composer, /activeRecorder\.onstop = null/);
  assert.match(composer, /stream\?\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(composer, /if \(isUnmounted\.current\) return;/);
  assert.match(composer, /requestId !== recordingRequestId\.current/);
});

test('public branding links to the active Visual Deadline repository', () => {
  const branding = source('src/constants/branding.ts');
  assert.match(branding, /githubRepo: 'RanchoTao\/Visual-Deadline'/);
  assert.match(branding, /githubUrl: 'https:\/\/github\.com\/RanchoTao\/Visual-Deadline'/);
});

test('the app shell has the frozen five-page primary navigation and global account controls', () => {
  const shell = source('src/components/V2AppShell.tsx');
  for (const [path, label] of [['/app', '现在'], ['/app/tasks', '任务'], ['/app/plan', '计划'], ['/app/ops', '执行'], ['/app/review', '回顾']]) assert.match(shell, new RegExp(`\\['${path.replaceAll('/', '\\/')}', '${label}'\\]`));
  assert.match(shell, /通知/);
  assert.match(shell, /个人资料与设置/);
  assert.match(shell, /\/billing/);
  assert.match(shell, /\/notifications/);
  assert.equal(shell.includes("'ME'"), false);
});

test('production browser copy rejects audited English UI phrases while allowing proper nouns and internal identifiers', () => {
  const productionUiFiles = [
    'src/components/V2AppShell.tsx', 'src/components/BillingPage.tsx', 'src/components/NotificationsPage.tsx',
    'src/components/ProfilePage.tsx', 'src/components/MembershipPanel.tsx', 'src/components/RecommendationCard.tsx',
    'src/components/TaskForm.tsx', 'src/components/PublicHome.tsx',
    'src/components/PublicSite.tsx', 'src/components/PlanPage.tsx', 'src/components/OpsPage.tsx',
    'src/components/ReviewPage.tsx', 'src/components/HomePage.tsx', 'src/components/AuthPanel.tsx', 'src/App.tsx', 'src/lib/cloudSync.ts',
  ];
  const obviousUntranslatedPhrases = [
    'Subscription & billing', 'Profile & settings', 'Sign out', 'All notifications', 'Manage subscription',
    'Update payment method', 'Cancel / manage billing', 'Recent payments', 'Subscription renewal',
    'Subscription payment', 'Legacy one-time Billing v1', 'Payment received / synchronizing subscription',
    'recurring subscription', 'recurring payment references', 'Blocked by', 'Find direction.', 'Move with clarity.',
    'Mobile is coming soon', 'Page not found', 'Back home', 'VD MEMBERSHIP', 'Paddle Client-side Token',
    '支付 UI', 'Sandbox Checkout', '云端 migration', 'Life Controller migration', 'REVIEW 历史', 'Capture 整理', 'additive migration',
  ];
  const copy = productionUiFiles.map(source).join('\n');
  for (const phrase of obviousUntranslatedPhrases) assert.equal(copy.includes(phrase), false, `untranslated production UI phrase: ${phrase}`);
  // Proper nouns, stable capability identifiers, and routes are intentionally retained.
  assert.match(source('src/components/V2AppShell.tsx'), /Visual Deadline/);
  assert.match(source('src/components/BillingPage.tsx'), /Paddle/);
  assert.match(source('src/components/PublicSite.tsx'), /GitHub/);
  assert.match(source('src/services/billing.ts'), /vd\.plus\.monthly\.v1/);
  assert.match(source('src/lib/appRoutes.ts'), /'\/app\/review'/);
  assert.match(source('src/components/ReviewPage.tsx'), />已归档<\/button>/);
  assert.equal(source('src/components/ReviewPage.tsx').includes('>Archive</button>'), false);
  assert.match(source('src/components/RecommendationCard.tsx'), />优先三项<\/span>/);
  assert.equal(source('src/components/RecommendationCard.tsx').includes('Top 3'), false);
  assert.match(source('src/components/MembershipPanel.tsx'), /Paddle 客户端令牌/);
  assert.match(source('src/App.tsx'), /回顾历史已同步到云端/);
  assert.match(source('src/lib/cloudSync.ts'), /回顾云端表尚未初始化/);
});

test('user-facing AI prompts require concise Simplified Chinese while preserving wire contracts', () => {
  for (const path of ['src/services/reviewPrompt.ts', 'src/services/taskIntakePrompt.ts', 'src/services/goals/roadmapPrompt.ts']) {
    const prompt = source(path);
    assert.match(prompt, /简体中文/);
    assert.match(prompt, /JSON/);
  }
});

test('the auth surface has no guest entry and keeps debug controls development-only', () => {
  const auth = source('src/components/AuthPanel.tsx');
  assert.equal(auth.includes('继续使用本地模式'), false);
  assert.match(auth, /import\.meta\.env\.DEV && authDebugInfo/);
  assert.match(auth, /验证码登录/);
  assert.match(auth, /密码登录/);
});
