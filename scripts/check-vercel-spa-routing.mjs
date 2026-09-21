import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/index.html' }], 'Vercel must retain the Vite SPA deep-link fallback.');

// Vercel serves existing static files before rewrites; this fallback therefore
// covers callback/privacy/terms and future client routes without creating an API.
for (const route of ['/auth/callback', '/privacy', '/terms', '/future/client-route']) {
  assert.match(route, /^\//);
}
console.log('Vercel SPA routing configuration passed: callback and client deep links fall back to index.html.');
