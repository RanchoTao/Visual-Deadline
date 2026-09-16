export type EntityId = string;
export type UserId = string;
export type Timestamp = string;
export type EntityVersion = number;
export type Importance = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type CanonicalEntityKind = 'goal' | 'milestone' | 'task' | 'task_dependency';
export type LegacySourceSystem = 'visualdeadline-v1' | 'wayline';

export interface LegacyEntityReference {
  readonly system: LegacySourceSystem;
  readonly entityKind: string;
  readonly entityId: string;
  readonly schemaVersion?: number;
}

/** A provider reference is evidence metadata, not permission to persist provider output. */
export interface ProviderEvidenceReference {
  readonly provider: string;
  readonly evidenceId: string;
  readonly model?: string;
  readonly createdAt: Timestamp;
}

export interface EntityProvenance {
  readonly origin: 'user' | 'confirmed_capture' | 'accepted_plan' | 'legacy_import';
  readonly actor: 'user' | 'ai' | 'system' | 'legacy';
  readonly confirmation: 'user_confirmed' | 'not_user_confirmed' | 'unknown';
  readonly legacy?: LegacyEntityReference;
  readonly evidence?: readonly ProviderEvidenceReference[];
}
