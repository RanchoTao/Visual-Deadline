import { storageKeys } from './schema';
import { browserStorageAdapter } from './dataSafety';
import { readWorkspaceValue, removeWorkspaceValue, writeWorkspaceValue, type WorkspaceOwner } from './workspace';

export function loadLifeMap(owner: WorkspaceOwner) {
  return {
    nodes: readWorkspaceValue<unknown[]>(browserStorageAdapter, owner, storageKeys.lifeMapNodes, []),
    layoutVersion: readWorkspaceValue<number>(browserStorageAdapter, owner, storageKeys.lifeMapLayoutVersion, 0),
  };
}

export function saveLifeMap(owner: WorkspaceOwner, lifeMap: { nodes?: unknown[]; layoutVersion?: number }): void {
  if (lifeMap.nodes !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.lifeMapNodes, lifeMap.nodes);
  if (lifeMap.layoutVersion !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.lifeMapLayoutVersion, lifeMap.layoutVersion);
}

export function clearLifeMap(owner: WorkspaceOwner): void {
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.lifeMapNodes);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.lifeMapLayoutVersion);
}
