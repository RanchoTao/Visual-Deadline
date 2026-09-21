import { storageKeys } from './schema';
import { browserStorageAdapter } from './dataSafety';
import { readWorkspaceOwner, readWorkspaceValue, removeWorkspaceValue, writeWorkspaceValue } from './workspace';

export function loadSocial() {
  return {
    nodes: readWorkspaceValue<unknown[]>(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.socialNodes, []),
    layoutVersion: readWorkspaceValue<number>(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.socialLayoutVersion, 0),
  };
}

export function saveSocial(social: { nodes?: unknown[]; layoutVersion?: number }): void {
  const owner = readWorkspaceOwner(browserStorageAdapter);
  if (social.nodes !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.socialNodes, social.nodes);
  if (social.layoutVersion !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.socialLayoutVersion, social.layoutVersion);
}

export function clearSocial(): void {
  const owner = readWorkspaceOwner(browserStorageAdapter);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.socialNodes);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.socialLayoutVersion);
}
