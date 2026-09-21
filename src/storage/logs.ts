import type { Achievement, AIArtifact } from '../types/task';
import { storageKeys } from './schema';
import { browserStorageAdapter } from './dataSafety';
import { readWorkspaceOwner, readWorkspaceValue, removeWorkspaceValue, writeWorkspaceValue } from './workspace';

export function loadLogs() {
  return {
    achievements: readWorkspaceValue<Achievement[]>(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.achievements, []),
    aiArtifacts: readWorkspaceValue<AIArtifact[]>(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.aiArtifacts, []),
  };
}

export function saveLogs(logs: { achievements?: Achievement[]; aiArtifacts?: AIArtifact[] }): void {
  const owner = readWorkspaceOwner(browserStorageAdapter);
  if (logs.achievements !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.achievements, logs.achievements);
  if (logs.aiArtifacts !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.aiArtifacts, logs.aiArtifacts);
}

export function clearLogs(): void {
  const owner = readWorkspaceOwner(browserStorageAdapter);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.achievements);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.aiArtifacts);
}
