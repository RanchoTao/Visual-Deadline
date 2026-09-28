import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.deepEqual(config.rewrites, [
  { source:'/api/v1/admin/:resource/actions',destination:'/api/admin?vdAdminV1=true&vdResource=:resource&vdOperation=actions' },
  { source:'/api/v1/admin/:resource',destination:'/api/admin?vdAdminV1=true&vdResource=:resource' },
  { source:'/(.*)',destination:'/index.html' },
], 'Internal admin routing must precede the unchanged Vite SPA fallback.');

// Vercel serves existing static files before rewrites; this fallback therefore
// covers callback/privacy/terms and future client routes without creating an API.
for (const route of ['/auth/callback', '/privacy', '/terms', '/future/client-route']) {
  assert.match(route, /^\//);
}
console.log('Vercel SPA routing configuration passed: callback and client deep links fall back to index.html.');
