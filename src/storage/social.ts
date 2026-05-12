import { clearValue, loadValue, saveValue, storageKeys } from './schema';

export function loadSocial() {
  return {
    nodes: loadValue<unknown[]>(storageKeys.socialNodes, []),
    layoutVersion: loadValue<number>(storageKeys.socialLayoutVersion, 0),
  };
}

export function saveSocial(social: { nodes?: unknown[]; layoutVersion?: number }): void {
  if (social.nodes !== undefined) saveValue(storageKeys.socialNodes, social.nodes);
  if (social.layoutVersion !== undefined) saveValue(storageKeys.socialLayoutVersion, social.layoutVersion);
}

export function clearSocial(): void {
  clearValue(storageKeys.socialNodes);
  clearValue(storageKeys.socialLayoutVersion);
}
