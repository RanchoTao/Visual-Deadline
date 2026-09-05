import type { LifePreferences } from '../../types/lifeController.js';
import { resolveTimezone } from './time.js';

export function createDefaultLifePreferences(timezone?: string): LifePreferences {
  return {
    timezone: resolveTimezone(timezone),
    targetSleepDurationMinutes: 8 * 60,
    preferredSleepTime: '23:30',
    preferredWakeTime: '07:30',
    mealIntervalMinMinutes: 4 * 60,
    mealIntervalMaxMinutes: 6 * 60,
  };
}
