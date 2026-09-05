import type { BuiltInLifeEventType, LifeEvent, LifeEventStore } from '../../types/lifeController.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createLifeEvent(type: BuiltInLifeEventType, at = new Date(), id = crypto.randomUUID()): LifeEvent {
  const timestamp = at.toISOString();
  return { id, type, timestamp, metadata: {}, createdAt: timestamp, updatedAt: timestamp };
}

export function normalizeLifeEvent(value: unknown): LifeEvent | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.type !== 'string' || typeof value.timestamp !== 'string') return null;
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : value.timestamp;
  return {
    id: value.id,
    type: value.type,
    timestamp: value.timestamp,
    metadata: isRecord(value.metadata) ? value.metadata : {},
    createdAt,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : createdAt,
  };
}

export function normalizeLifeEvents(values: unknown): LifeEvent[] {
  if (!Array.isArray(values)) return [];
  const byId = new Map<string, LifeEvent>();
  values.forEach((value) => {
    const event = normalizeLifeEvent(value);
    if (event) byId.set(event.id, event);
  });
  return [...byId.values()].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

export function mergeLifeEvents(localEvents: LifeEvent[], cloudEvents: LifeEvent[]): LifeEvent[] {
  return normalizeLifeEvents([...cloudEvents, ...localEvents]);
}

export function normalizeLifeEventStore(value: unknown): LifeEventStore {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([owner, events]) => [owner, normalizeLifeEvents(events)]));
}

export function getLifeEventsForOwner(store: LifeEventStore, owner: string): LifeEvent[] {
  return normalizeLifeEvents(normalizeLifeEventStore(store)[owner] ?? []);
}

export function setLifeEventsForOwner(store: LifeEventStore, owner: string, events: LifeEvent[]): LifeEventStore {
  return { ...normalizeLifeEventStore(store), [owner]: normalizeLifeEvents(events) };
}

export function latestLifeEvent(events: LifeEvent[]): LifeEvent | null {
  return [...normalizeLifeEvents(events)].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))[0] ?? null;
}

export function undoLatestLifeEvent(events: LifeEvent[]): { events: LifeEvent[]; removed: LifeEvent | null } {
  const removed = latestLifeEvent(events);
  return removed
    ? { events: normalizeLifeEvents(events).filter((event) => event.id !== removed.id), removed }
    : { events: normalizeLifeEvents(events), removed: null };
}
