import { storageKeys } from './schema.js';

export type StorageOwnership = 'user-owned' | 'derived-cache' | 'session-secret' | 'backup-internal';
export type CloudSyncState = 'synced' | 'partially-synced' | 'local-only' | 'not-applicable';
export type BetaMigrationState = 'candidate' | 'keep-local' | 'deferred' | 'excluded';

export interface StorageDomainInventoryItem {
  id: string;
  storageKey: string;
  domainVersion: number;
  ownership: StorageOwnership;
  exportPolicy: 'include' | 'sanitized' | 'exclude';
  restorePolicy: 'replace-key' | 'exclude';
  sensitivity: 'normal' | 'personal' | 'sensitive' | 'secret';
  attachmentPolicy: 'none' | 'references-only';
  cloudSync: CloudSyncState;
  betaMigration: BetaMigrationState;
  notes: string;
  defaultValue?: unknown;
}

const userDomain = (
  id: string,
  storageKey: string,
  defaultValue: unknown,
  options: Partial<StorageDomainInventoryItem> = {},
): StorageDomainInventoryItem => ({
  id,
  storageKey,
  domainVersion: 1,
  ownership: 'user-owned',
  exportPolicy: 'include',
  restorePolicy: 'replace-key',
  sensitivity: 'normal',
  attachmentPolicy: 'none',
  cloudSync: 'local-only',
  betaMigration: 'keep-local',
  notes: 'Current browser-local user domain.',
  defaultValue,
  ...options,
});

/**
 * Frozen inventory of every browser-storage domain currently owned by VD.
 * Adding a new storage key requires adding an inventory decision here.
 */
export const STORAGE_DOMAIN_INVENTORY: readonly StorageDomainInventoryItem[] = [
  userDomain('tasks', storageKeys.tasks, [], { cloudSync: 'synced', betaMigration: 'candidate', notes: 'Task CRUD and lifecycle records.' }),
  userDomain('goals', storageKeys.goals, [], { cloudSync: 'synced', betaMigration: 'candidate', notes: 'Goal records and Task links.' }),
  userDomain('pressure.baseline', storageKeys.baselinePressure, null, { cloudSync: 'synced', sensitivity: 'personal' }),
  userDomain('pressure.calibration', storageKeys.pressureCalibration, null, { cloudSync: 'partially-synced', sensitivity: 'personal' }),
  userDomain('pressure.history', storageKeys.pressureHistory, [], { cloudSync: 'synced', sensitivity: 'personal' }),
  userDomain('profile', storageKeys.profile, null, { exportPolicy: 'sanitized', sensitivity: 'sensitive', attachmentPolicy: 'references-only', cloudSync: 'partially-synced', betaMigration: 'candidate' }),
  userDomain('preferences.onboarding', storageKeys.onboardingComplete, false, { cloudSync: 'partially-synced', betaMigration: 'candidate' }),
  userDomain('achievements', storageKeys.achievements, [], { betaMigration: 'deferred' }),
  userDomain('ai.settings', storageKeys.aiSettings, {}, { exportPolicy: 'sanitized', sensitivity: 'secret', notes: 'Provider, base URL, and model are retained; apiKey and credentials are removed.' }),
  userDomain('ai.artifacts', storageKeys.aiArtifacts, [], { sensitivity: 'sensitive', attachmentPolicy: 'references-only', betaMigration: 'deferred' }),
  userDomain('daily.quest', storageKeys.dailyQuest, null, { betaMigration: 'deferred' }),
  userDomain('daily.review', storageKeys.dailyReview, null, { sensitivity: 'personal', betaMigration: 'deferred' }),
  userDomain('reminders.settings', storageKeys.reminderSettings, null, { sensitivity: 'personal' }),
  userDomain('notifications', storageKeys.notifications, [], { betaMigration: 'candidate' }),
  userDomain('roadmaps', storageKeys.roadmaps, [], { betaMigration: 'deferred' }),
  userDomain('life-map.nodes', storageKeys.lifeMapNodes, [], { sensitivity: 'personal', betaMigration: 'deferred' }),
  userDomain('life-map.layout', storageKeys.lifeMapLayoutVersion, 0, { betaMigration: 'deferred' }),
  userDomain('life-controller.events', storageKeys.lifeEventsByOwner, {}, { sensitivity: 'personal', cloudSync: 'synced', betaMigration: 'deferred' }),
  userDomain('social.nodes', storageKeys.socialNodes, [], { sensitivity: 'sensitive', cloudSync: 'partially-synced', betaMigration: 'keep-local' }),
  userDomain('social.layout', storageKeys.socialLayoutVersion, 0, { cloudSync: 'partially-synced', betaMigration: 'keep-local' }),
  userDomain('planning.life-nodes', storageKeys.planningLifeNodes, [], { betaMigration: 'deferred' }),
  userDomain('planning.dependencies', storageKeys.planningDependencies, [], { betaMigration: 'deferred' }),
  userDomain('operations.resource-snapshot', storageKeys.planningResource, null, { sensitivity: 'personal', betaMigration: 'deferred' }),
  userDomain('review.execution-events', storageKeys.planningExecutionEvents, [], { sensitivity: 'personal', betaMigration: 'deferred' }),
  userDomain('planning.plan-versions', storageKeys.planningPlanVersions, [], { sensitivity: 'personal', betaMigration: 'deferred' }),
  {
    id: 'cache.welcome-activity', storageKey: storageKeys.welcomeLastActive, domainVersion: 1, ownership: 'derived-cache', exportPolicy: 'exclude', restorePolicy: 'exclude', sensitivity: 'normal', attachmentPolicy: 'none', cloudSync: 'not-applicable', betaMigration: 'excluded', notes: 'Ephemeral inactivity timestamp; safe to regenerate.',
  },
  ...[storageKeys.backupLatest, storageKeys.backup1, storageKeys.backup2, storageKeys.backup3, storageKeys.restoreRollback].map((storageKey, index) => ({
    id: `backup.internal.${index}`, storageKey, domainVersion: 1, ownership: 'backup-internal' as const, exportPolicy: 'exclude' as const, restorePolicy: 'exclude' as const, sensitivity: 'sensitive' as const, attachmentPolicy: 'none' as const, cloudSync: 'not-applicable' as const, betaMigration: 'excluded' as const, notes: 'Backup containers are not recursively embedded in exports.',
  })),
  {
    id: 'auth.supabase.session', storageKey: 'vd.supabase.session', domainVersion: 1, ownership: 'session-secret', exportPolicy: 'exclude', restorePolicy: 'exclude', sensitivity: 'secret', attachmentPolicy: 'none', cloudSync: 'not-applicable', betaMigration: 'excluded', notes: 'Access and refresh tokens are never exported or restored.',
  },
  {
    id: 'auth.supabase.code-verifier', storageKey: 'vd.supabase.code_verifier', domainVersion: 1, ownership: 'session-secret', exportPolicy: 'exclude', restorePolicy: 'exclude', sensitivity: 'secret', attachmentPolicy: 'none', cloudSync: 'not-applicable', betaMigration: 'excluded', notes: 'PKCE verifier is session security material.',
  },
  {
    id: 'auth.supabase.legacy-session-prefix', storageKey: 'sb-*', domainVersion: 1, ownership: 'session-secret', exportPolicy: 'exclude', restorePolicy: 'exclude', sensitivity: 'secret', attachmentPolicy: 'none', cloudSync: 'not-applicable', betaMigration: 'excluded', notes: 'Legacy Supabase auth keys may exist in localStorage or sessionStorage and are never enumerated into a backup.',
  },
] as const;

export const EXPORTABLE_STORAGE_DOMAINS = STORAGE_DOMAIN_INVENTORY.filter(
  (item) => item.ownership === 'user-owned' && item.exportPolicy !== 'exclude',
);

export const STORAGE_INVENTORY_VERSION = 1;

export const SECURITY_EXCLUSIONS = [
  'Supabase access and refresh tokens',
  'Supabase service-role keys',
  'OAuth secrets and PKCE verifiers',
  'Paddle provider secrets',
  'browser-stored AI provider API keys',
  'session credentials',
] as const;
