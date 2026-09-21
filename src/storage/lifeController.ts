import type { LifeEventStore } from '../types/lifeController';
import { normalizeLifeEventStore } from '../domain/life-controller';
import { storageKeys } from './schema';
import { browserStorageAdapter } from './dataSafety';
import { readWorkspaceOwner, readWorkspaceValue, removeWorkspaceValue, writeWorkspaceValue } from './workspace';

export function loadLifeEventStore(): LifeEventStore {
  return normalizeLifeEventStore(readWorkspaceValue<unknown>(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.lifeEventsByOwner, {}));
}

export function saveLifeEventStore(store: LifeEventStore): void {
  writeWorkspaceValue(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.lifeEventsByOwner, normalizeLifeEventStore(store));
}

export function clearLifeEventStore(): void {
  removeWorkspaceValue(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.lifeEventsByOwner);
}
