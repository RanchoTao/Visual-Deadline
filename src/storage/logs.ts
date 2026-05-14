import type { Achievement, AIArtifact } from '../types/task';
import { clearValue, loadValue, saveValue, storageKeys } from './schema';

export function loadLogs() {
  return {
    achievements: loadValue<Achievement[]>(storageKeys.achievements, []),
    aiArtifacts: loadValue<AIArtifact[]>(storageKeys.aiArtifacts, []),
  };
}

export function saveLogs(logs: { achievements?: Achievement[]; aiArtifacts?: AIArtifact[] }): void {
  if (logs.achievements !== undefined) saveValue(storageKeys.achievements, logs.achievements);
  if (logs.aiArtifacts !== undefined) saveValue(storageKeys.aiArtifacts, logs.aiArtifacts);
}

export function clearLogs(): void {
  clearValue(storageKeys.achievements);
  clearValue(storageKeys.aiArtifacts);
}
