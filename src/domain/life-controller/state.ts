import type { LifeEvent, LifeState, LifeStateWarning } from '../../types/lifeController.js';
import { normalizeLifeEvents } from './events.js';
import { getZonedDateKey, resolveTimezone } from './time.js';

const minutesBetween = (later: number, earlier: number) => Math.max(0, Math.floor((later - earlier) / 60_000));

export function deriveLifeState(events: LifeEvent[], currentTime: Date, timezone: string): LifeState {
  const nowMs = currentTime.getTime();
  const safeTimezone = resolveTimezone(timezone);
  const warnings: LifeStateWarning[] = [];
  let currentSleepState: LifeState['currentSleepState'] = 'unknown';
  let lastWakeAt: string | null = null;
  let lastSleepStartAt: string | null = null;
  let lastSleepDurationMinutes: number | null = null;
  let lastMealAt: string | null = null;

  const usableEvents = normalizeLifeEvents(events).filter((event) => {
    const eventMs = Date.parse(event.timestamp);
    if (!Number.isFinite(eventMs)) {
      warnings.push({ code: 'invalid_timestamp', eventId: event.id });
      return false;
    }
    if (eventMs > nowMs) {
      warnings.push({ code: 'future_event', eventId: event.id });
      return false;
    }
    return true;
  });

  for (const event of usableEvents) {
    if (event.type === 'meal') {
      lastMealAt = event.timestamp;
      continue;
    }
    if (event.type === 'wake') {
      if (currentSleepState === 'awake') {
        warnings.push({ code: 'duplicate_wake', eventId: event.id });
        continue;
      }
      if (currentSleepState === 'sleeping' && lastSleepStartAt) {
        lastSleepDurationMinutes = minutesBetween(Date.parse(event.timestamp), Date.parse(lastSleepStartAt));
      }
      currentSleepState = 'awake';
      lastWakeAt = event.timestamp;
      continue;
    }
    if (event.type === 'sleep_start') {
      if (currentSleepState === 'sleeping') {
        warnings.push({ code: 'duplicate_sleep_start', eventId: event.id });
        continue;
      }
      currentSleepState = 'sleeping';
      lastSleepStartAt = event.timestamp;
    }
  }

  const today = getZonedDateKey(currentTime, safeTimezone);
  const mealsToday = usableEvents.filter((event) => event.type === 'meal' && getZonedDateKey(new Date(event.timestamp), safeTimezone) === today).length;

  return {
    currentSleepState,
    lastWakeAt,
    lastSleepStartAt,
    awakeDurationMinutes: currentSleepState === 'awake' && lastWakeAt ? minutesBetween(nowMs, Date.parse(lastWakeAt)) : null,
    lastSleepDurationMinutes,
    lastMealAt,
    timeSinceLastMealMinutes: lastMealAt ? minutesBetween(nowMs, Date.parse(lastMealAt)) : null,
    mealsToday,
    warnings,
  };
}
