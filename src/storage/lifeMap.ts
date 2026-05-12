import { clearValue, loadValue, saveValue, storageKeys } from './schema';

export function loadLifeMap() {
  return {
    nodes: loadValue<unknown[]>(storageKeys.lifeMapNodes, []),
    layoutVersion: loadValue<number>(storageKeys.lifeMapLayoutVersion, 0),
  };
}

export function saveLifeMap(lifeMap: { nodes?: unknown[]; layoutVersion?: number }): void {
  if (lifeMap.nodes !== undefined) saveValue(storageKeys.lifeMapNodes, lifeMap.nodes);
  if (lifeMap.layoutVersion !== undefined) saveValue(storageKeys.lifeMapLayoutVersion, lifeMap.layoutVersion);
}

export function clearLifeMap(): void {
  clearValue(storageKeys.lifeMapNodes);
  clearValue(storageKeys.lifeMapLayoutVersion);
}
