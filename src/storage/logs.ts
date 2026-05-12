import type { Achievement } from '../types/task';
import { clearValue, loadValue, saveValue, storageKeys } from './schema';

export function loadLogs() {
  return {
    achievements: loadValue<Achievement[]>(storageKeys.achievements, []),
  };
}

export function saveLogs(logs: { achievements?: Achievement[] }): void {
  if (logs.achievements !== undefined) saveValue(storageKeys.achievements, logs.achievements);
}

export function clearLogs(): void {
  clearValue(storageKeys.achievements);
}
