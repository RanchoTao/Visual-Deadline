import type {
  GoalRepository,
  MilestoneRepository,
  TaskDependencyRepository,
  TaskRepository,
} from '../src/domain/v2/repositories.js';
import type { MigrationLedgerEntry } from '../src/domain/v2/migrationLedger.js';

/** Compilation of this type proves that all four implementation-neutral ports are consumable together. */
export interface RepositoryContractSet {
  readonly goals: GoalRepository;
  readonly milestones: MilestoneRepository;
  readonly tasks: TaskRepository;
  readonly taskDependencies: TaskDependencyRepository;
}

/** PR D exposes the ledger shape for later PR F without creating persistence. */
export type DataMigrationLedgerContract = MigrationLedgerEntry;
