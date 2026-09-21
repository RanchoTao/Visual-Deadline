import { storageKeys } from './schema';
import { browserStorageAdapter } from './dataSafety';
import { readWorkspaceOwner, readWorkspaceValue, removeWorkspaceValue, writeWorkspaceValue } from './workspace';

export function loadLifeMap() {
  return {
    nodes: readWorkspaceValue<unknown[]>(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.lifeMapNodes, []),
    layoutVersion: readWorkspaceValue<number>(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.lifeMapLayoutVersion, 0),
  };
}

export function saveLifeMap(lifeMap: { nodes?: unknown[]; layoutVersion?: number }): void {
  const owner = readWorkspaceOwner(browserStorageAdapter);
  if (lifeMap.nodes !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.lifeMapNodes, lifeMap.nodes);
  if (lifeMap.layoutVersion !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.lifeMapLayoutVersion, lifeMap.layoutVersion);
}

export function clearLifeMap(): void {
  const owner = readWorkspaceOwner(browserStorageAdapter);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.lifeMapNodes);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.lifeMapLayoutVersion);
}
