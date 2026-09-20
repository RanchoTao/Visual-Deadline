export type MigrationLedgerStatus = 'pending' | 'mapped' | 'migrated' | 'quarantined' | 'failed' | 'rolled_back';

/** Contract only. PR D does not persist or execute migration ledger entries. */
export interface MigrationLedgerEntry {
  importJobId: string;
  sourceSystem: 'browser-local' | 'legacy-cloud' | 'visualdeadline-v1';
  sourceSchemaVersion: string;
  sourceDomain: string;
  sourceId: string;
  targetEntityType?: string;
  targetId?: string;
  sourceVersion: string;
  targetVersion?: string;
  sourceChecksum: string;
  targetChecksum?: string;
  status: MigrationLedgerStatus;
  attemptCount: number;
  lastAttemptedAt?: string;
  migratedAt?: string;
  errorCode?: string;
  errorDetail?: string;
  warnings: string[];
  unresolvedReferences: string[];
  rollbackReference?: string;
  createdAt: string;
  updatedAt: string;
}
