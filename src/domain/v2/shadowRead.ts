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

/**
 * A deliberately small, persistence-free contract for comparing the legacy
 * VisualDeadline projection with a mapped canonical projection.  Callers must
 * provide the legacy IDs (rather than relying on array order or database IDs).
 */
export interface VisualDeadlineShadowSnapshot {
  readonly goals: readonly {
    legacyId: string; status: string; importance: number; parentGoalLegacyId?: string;
  }[];
  readonly tasks: readonly {
    legacyId: string; status: string; importance: number; progress: number;
    deadline?: string; startAfter?: string; goalLegacyId?: string; parentTaskLegacyId?: string;
  }[];
  readonly dependencies: readonly {
    predecessorLegacyId: string; successorLegacyId: string; type: string;
  }[];
}

const diagnostic = (code: string, legacyId: string, field?: string) =>
  field ? `${code}:${legacyId}:${field}` : `${code}:${legacyId}`;

/**
 * Pure comparison only. It does not select data for callers and does not make
 * v2 authoritative; it is suitable for shadow diagnostics and local tests.
 */
export function compareVisualDeadlineShadow(
  legacy: VisualDeadlineShadowSnapshot,
  canonical: VisualDeadlineShadowSnapshot,
): readonly string[] {
  const diagnostics: string[] = [];
  const canonicalGoals = new Map(canonical.goals.map((item) => [item.legacyId, item]));
  const canonicalTasks = new Map(canonical.tasks.map((item) => [item.legacyId, item]));
  if (legacy.goals.length !== canonical.goals.length) diagnostics.push('GOAL_COUNT_MISMATCH');
  if (legacy.tasks.length !== canonical.tasks.length) diagnostics.push('TASK_COUNT_MISMATCH');
  if (legacy.dependencies.length !== canonical.dependencies.length) diagnostics.push('DEPENDENCY_COUNT_MISMATCH');
  for (const item of legacy.goals) {
    const candidate = canonicalGoals.get(item.legacyId);
    if (!candidate) { diagnostics.push(diagnostic('GOAL_MAPPING_MISSING', item.legacyId)); continue; }
    for (const field of ['status', 'importance', 'parentGoalLegacyId'] as const) if (item[field] !== candidate[field]) diagnostics.push(diagnostic('GOAL_MISMATCH', item.legacyId, field));
  }
  for (const item of legacy.tasks) {
    const candidate = canonicalTasks.get(item.legacyId);
    if (!candidate) { diagnostics.push(diagnostic('TASK_MAPPING_MISSING', item.legacyId)); continue; }
    for (const field of ['status', 'importance', 'progress', 'deadline', 'startAfter', 'goalLegacyId', 'parentTaskLegacyId'] as const) if (item[field] !== candidate[field]) diagnostics.push(diagnostic('TASK_MISMATCH', item.legacyId, field));
  }
  const legacyGoalIds = new Set(legacy.goals.map((item) => item.legacyId));
  const legacyTaskIds = new Set(legacy.tasks.map((item) => item.legacyId));
  for (const item of canonical.goals) if (!legacyGoalIds.has(item.legacyId)) diagnostics.push(diagnostic('GOAL_MAPPING_EXTRA', item.legacyId));
  for (const item of canonical.tasks) if (!legacyTaskIds.has(item.legacyId)) diagnostics.push(diagnostic('TASK_MAPPING_EXTRA', item.legacyId));
  const keys = (items: readonly { predecessorLegacyId: string; successorLegacyId: string; type: string }[]) => new Set(items.map((item) => `${item.predecessorLegacyId}->${item.successorLegacyId}:${item.type}`));
  const legacyDependencies = keys(legacy.dependencies);
  const canonicalDependencies = keys(canonical.dependencies);
  for (const key of legacyDependencies) if (!canonicalDependencies.has(key)) diagnostics.push(`DEPENDENCY_MISSING:${key}`);
  for (const key of canonicalDependencies) if (!legacyDependencies.has(key)) diagnostics.push(`DEPENDENCY_EXTRA:${key}`);
  return diagnostics.sort((left, right) => left.localeCompare(right));
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
