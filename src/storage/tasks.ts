import type { Task } from '../types/task';
import { storageKeys } from './schema';
import { browserStorageAdapter } from './dataSafety';
import { readWorkspaceOwner, readWorkspaceValue, removeWorkspaceValue, writeWorkspaceValue } from './workspace';

export function loadTasks(): Task[] {
  return readWorkspaceValue<Task[]>(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.tasks, []);
}

export function saveTasks(tasks: Task[]): void {
  writeWorkspaceValue(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.tasks, tasks);
}

export function clearTasks(): void {
  removeWorkspaceValue(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.tasks);
}
