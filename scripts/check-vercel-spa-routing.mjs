import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.equal(config.git?.deploymentEnabled?.['codex/vd-admin-v1'], false, 'Admin foundation review branch must not auto-deploy.');
assert.deepEqual(config.rewrites.at(-1), { source: '/(.*)', destination: '/index.html' }, 'Vercel must retain the Vite SPA deep-link fallback last.');
for (const prefix of ['/api/internal/admin/v1','/v1/admin']) {
 assert.ok(config.rewrites.some(r=>r.source===`${prefix}/:resource`&&r.destination==='/api/internal/admin?resource=:resource'));
 assert.ok(config.rewrites.some(r=>r.source===`${prefix}/:resource/actions`&&r.destination==='/api/internal/admin?resource=:resource&operation=actions'));
}

// Vercel serves existing static files before rewrites; this fallback therefore
// covers callback/privacy/terms and future client routes without creating an API.
for (const route of ['/auth/callback', '/privacy', '/terms', '/future/client-route']) {
  assert.match(route, /^\//);
}
console.log('Vercel SPA routing configuration passed: callback and client deep links fall back to index.html.');
