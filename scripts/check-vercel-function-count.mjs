import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HOBBY_FUNCTION_LIMIT = 12;
// Conservatively count every supported source entrypoint, including nested API
// files. Helpers belong under server/, not api/, regardless of their filename.
export function apiEntrypoints(root) {
  if (root instanceof URL) root = fileURLToPath(root);
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? apiEntrypoints(path) : /\.(?:[cm]?js|[cm]?ts|tsx|jsx|py|go|rb)$/.test(entry.name) ? [path] : [];
  }).sort();
}
export function assertFunctionLimit(files) {
  assert.ok(files.length <= HOBBY_FUNCTION_LIMIT,
    `Vercel Hobby function limit exceeded: ${files.length}/${HOBBY_FUNCTION_LIMIT}. Reuse a physical API entrypoint; keep internal handlers under server/.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = apiEntrypoints(new URL('../api/', import.meta.url));
  assertFunctionLimit(files);
  console.log(`Vercel physical API entrypoints: ${files.length}/${HOBBY_FUNCTION_LIMIT} passed.`);
}
