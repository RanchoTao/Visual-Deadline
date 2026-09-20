/** Minimal read-mode switch. `legacy` is intentionally the default and the only production authority. */
export type V2ReadMode = 'legacy' | 'shadow' | 'v2';

export interface ShadowReadResult<T> {
  readonly value: T;
  readonly mode: V2ReadMode;
  readonly compared: boolean;
  readonly diagnostics: readonly string[];
}

export interface V2ReadCompatibilityRepository<T> {
  readonly mode: V2ReadMode;
  read(): Promise<ShadowReadResult<T>>;
}

export function resolveV2ReadMode(value: unknown): V2ReadMode {
  return value === 'shadow' || value === 'v2' ? value : 'legacy';
}

/** Shadow mode must never substitute v2 data: it returns legacy while recording comparison evidence. */
export async function readWithV2Shadow<T>(
  mode: V2ReadMode,
  readLegacy: () => Promise<T>,
  readV2ForComparison: () => Promise<T>,
  compare: (legacy: T, candidate: T) => readonly string[],
): Promise<ShadowReadResult<T>> {
  const legacy = await readLegacy();
  if (mode === 'legacy') return { value: legacy, mode, compared: false, diagnostics: [] };
  const candidate = await readV2ForComparison();
  if (mode === 'shadow') return { value: legacy, mode, compared: true, diagnostics: compare(legacy, candidate) };
  return { value: candidate, mode, compared: true, diagnostics: compare(legacy, candidate) };
}

export function createV2ReadCompatibilityRepository<T>(
  configuredMode: unknown,
  readLegacy: () => Promise<T>,
  readV2ForComparison: () => Promise<T>,
  compare: (legacy: T, candidate: T) => readonly string[],
): V2ReadCompatibilityRepository<T> {
  const mode = resolveV2ReadMode(configuredMode);
  return { mode, read: () => readWithV2Shadow(mode, readLegacy, readV2ForComparison, compare) };
}
