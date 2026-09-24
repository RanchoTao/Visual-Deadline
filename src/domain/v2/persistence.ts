export type PersistenceStage = 'BETA_REQUIRED' | 'CONDITIONAL' | 'DEFERRED';

export interface PersistenceCapability {
  readonly id: string;
  readonly stage: PersistenceStage;
  readonly rationale: string;
  readonly becomesRequiredWhen?: string;
}

/**
 * Planning metadata only. This does not create tables or require a persistence
 * implementation. Deferred capabilities remain outside the Beta runtime.
 */
export const V2_PERSISTENCE_STAGING = [
  {
    id: 'canonical_execution_core',
    stage: 'BETA_REQUIRED',
    rationale: 'Goal, Milestone, Task and dependency state needed by the current product, via canonical storage or a compatibility layer.',
  },
  {
    id: 'advanced_capture_artifacts',
    stage: 'CONDITIONAL',
    rationale: 'Only durable capture evidence beyond the current confirmed-task flow needs separate persistence.',
    becomesRequiredWhen: 'The Capture migration retains provider artifacts or resumable drafts.',
  },
  {
    id: 'notifications',
    stage: 'CONDITIONAL',
    rationale: 'Notification preferences and delivery records are global account concerns.',
    becomesRequiredWhen: 'The notification surface requires durable delivery state.',
  },
  {
    id: 'recurring_billing',
    stage: 'CONDITIONAL',
    rationale: 'Billing is a global account surface and is not required by the domain contract.',
    becomesRequiredWhen: 'A recurring subscription product is implemented.',
  },
  {
    id: 'ops_resource_model',
    stage: 'BETA_REQUIRED',
    rationale: 'OPS now consumes owner-scoped compatibility OpsState, persisted locally and in profile JSON; canonical OPS tables remain later work.',
  },
  {
    id: 'review_history',
    stage: 'BETA_REQUIRED',
    rationale: 'REVIEW now persists durable immutable snapshots and reports in owner-scoped row-level tables, with append-only tombstones for archive intent.',
  },
] as const satisfies readonly PersistenceCapability[];
