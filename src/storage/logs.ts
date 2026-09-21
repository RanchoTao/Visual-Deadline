import type { Achievement, AIArtifact } from '../types/task';
import { storageKeys } from './schema';
import { browserStorageAdapter } from './dataSafety';
import { readWorkspaceValue, removeWorkspaceValue, writeWorkspaceValue, type WorkspaceOwner } from './workspace';

export function loadLogs(owner: WorkspaceOwner) {
  return {
    achievements: readWorkspaceValue<Achievement[]>(browserStorageAdapter, owner, storageKeys.achievements, []),
    aiArtifacts: readWorkspaceValue<AIArtifact[]>(browserStorageAdapter, owner, storageKeys.aiArtifacts, []),
  };
}

export function saveLogs(owner: WorkspaceOwner, logs: { achievements?: Achievement[]; aiArtifacts?: AIArtifact[] }): void {
  if (logs.achievements !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.achievements, logs.achievements);
  if (logs.aiArtifacts !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.aiArtifacts, logs.aiArtifacts);
}

export function clearLogs(owner: WorkspaceOwner): void {
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.achievements);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.aiArtifacts);
}
