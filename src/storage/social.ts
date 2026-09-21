import { storageKeys } from './schema';
import { browserStorageAdapter } from './dataSafety';
import { readWorkspaceValue, removeWorkspaceValue, writeWorkspaceValue, type WorkspaceOwner } from './workspace';

export function loadSocial(owner: WorkspaceOwner) {
  return {
    nodes: readWorkspaceValue<unknown[]>(browserStorageAdapter, owner, storageKeys.socialNodes, []),
    layoutVersion: readWorkspaceValue<number>(browserStorageAdapter, owner, storageKeys.socialLayoutVersion, 0),
  };
}

export function saveSocial(owner: WorkspaceOwner, social: { nodes?: unknown[]; layoutVersion?: number }): void {
  if (social.nodes !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.socialNodes, social.nodes);
  if (social.layoutVersion !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.socialLayoutVersion, social.layoutVersion);
}

export function clearSocial(owner: WorkspaceOwner): void {
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.socialNodes);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.socialLayoutVersion);
}
