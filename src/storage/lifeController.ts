import type { LifeEventStore } from '../types/lifeController';
import { normalizeLifeEventStore } from '../domain/life-controller';
import { storageKeys } from './schema';
import { browserStorageAdapter } from './dataSafety';
import { readWorkspaceValue, removeWorkspaceValue, writeWorkspaceValue, type WorkspaceOwner } from './workspace';

export function loadLifeEventStore(owner: WorkspaceOwner): LifeEventStore {
  return normalizeLifeEventStore(readWorkspaceValue<unknown>(browserStorageAdapter, owner, storageKeys.lifeEventsByOwner, {}));
}

export function saveLifeEventStore(owner: WorkspaceOwner, store: LifeEventStore): void {
  writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.lifeEventsByOwner, normalizeLifeEventStore(store));
}

export function clearLifeEventStore(owner: WorkspaceOwner): void {
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.lifeEventsByOwner);
}
