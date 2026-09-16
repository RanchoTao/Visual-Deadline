import type {
  GoalRepository,
  MilestoneRepository,
  TaskDependencyRepository,
  TaskRepository,
} from '../src/domain/v2/repositories.js';

/** Compilation of this type proves that all four implementation-neutral ports are consumable together. */
export interface RepositoryContractSet {
  readonly goals: GoalRepository;
  readonly milestones: MilestoneRepository;
  readonly tasks: TaskRepository;
  readonly taskDependencies: TaskDependencyRepository;
}
