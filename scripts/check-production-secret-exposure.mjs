import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['src', 'public'];
const files = [];
function visit(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const next = join(path, entry.name);
    if (entry.isDirectory()) visit(next);
    else if (/\.(?:ts|tsx|js|jsx|html|css)$/.test(entry.name)) files.push(next);
  }
}
roots.forEach(visit);

const forbiddenBrowserEnvironmentNames = [
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'VITE_PADDLE_API_KEY',
  'VITE_PADDLE_WEBHOOK_SECRET',
  'VITE_CRON_SECRET',
];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const name of forbiddenBrowserEnvironmentNames) {
    if (text.includes(name)) throw new Error(`Browser bundle source references forbidden server secret environment variable ${name}: ${file}`);
  }
}

console.log(`Production secret exposure scan passed for ${files.length} browser-source files.`);
