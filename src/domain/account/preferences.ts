import type { ReminderSettings, ReminderType } from '../../types/task.js';

export interface AccountReminderPreferences {
  reminderEnabled: boolean;
  reminderTime: string;
  reminderType: ReminderType[];
}

const reminderTypes: ReadonlySet<ReminderType> = new Set(['daily_quest', 'evening_review', 'deadline']);

export function toAccountReminderPreferences(settings: ReminderSettings): AccountReminderPreferences {
  return {
    reminderEnabled: settings.reminderEnabled === true,
    reminderTime: /^\d{2}:\d{2}$/.test(settings.reminderTime) ? settings.reminderTime : '08:30',
    reminderType: settings.reminderType.filter((type): type is ReminderType => reminderTypes.has(type)),
  };
}

export function mergeAccountReminderPreferences(current: ReminderSettings, stored: unknown): ReminderSettings {
  if (!stored || typeof stored !== 'object') return current;
  const candidate = stored as Partial<AccountReminderPreferences>;
  return {
    ...current,
    reminderEnabled: candidate.reminderEnabled === true,
    reminderTime: typeof candidate.reminderTime === 'string' && /^\d{2}:\d{2}$/.test(candidate.reminderTime) ? candidate.reminderTime : current.reminderTime,
    reminderType: Array.isArray(candidate.reminderType)
      ? candidate.reminderType.filter((type): type is ReminderType => typeof type === 'string' && reminderTypes.has(type as ReminderType))
      : current.reminderType,
  };
}
