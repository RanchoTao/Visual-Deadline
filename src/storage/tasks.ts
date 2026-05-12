import type { Task } from '../types/task';
import { clearValue, loadValue, saveValue, storageKeys } from './schema';

export function loadTasks(): Task[] {
  return loadValue<Task[]>(storageKeys.tasks, []);
}

export function saveTasks(tasks: Task[]): void {
  saveValue(storageKeys.tasks, tasks);
}

export function clearTasks(): void {
  clearValue(storageKeys.tasks);
}
