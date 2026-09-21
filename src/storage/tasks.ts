import type { Task } from '../types/task';
import { storageKeys } from './schema';
import { browserStorageAdapter } from './dataSafety';
import { readWorkspaceValue, removeWorkspaceValue, writeWorkspaceValue, type WorkspaceOwner } from './workspace';

export function loadTasks(owner: WorkspaceOwner): Task[] {
  return readWorkspaceValue<Task[]>(browserStorageAdapter, owner, storageKeys.tasks, []);
}

export function saveTasks(owner: WorkspaceOwner, tasks: Task[]): void {
  writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.tasks, tasks);
}

export function clearTasks(owner: WorkspaceOwner): void {
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.tasks);
}
