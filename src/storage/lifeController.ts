import type { LifeEventStore } from '../types/lifeController';
import { normalizeLifeEventStore } from '../domain/life-controller';
import { clearValue, loadValue, saveValue, storageKeys } from './schema';

export function loadLifeEventStore(): LifeEventStore {
  return normalizeLifeEventStore(loadValue<unknown>(storageKeys.lifeEventsByOwner, {}));
}

export function saveLifeEventStore(store: LifeEventStore): void {
  saveValue(storageKeys.lifeEventsByOwner, normalizeLifeEventStore(store));
}

export function clearLifeEventStore(): void {
  clearValue(storageKeys.lifeEventsByOwner);
}
