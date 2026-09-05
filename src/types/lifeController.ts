export const BUILT_IN_LIFE_EVENT_TYPES = ['wake', 'meal', 'sleep_start'] as const;

export type BuiltInLifeEventType = (typeof BUILT_IN_LIFE_EVENT_TYPES)[number];
export type LifeEventType = BuiltInLifeEventType | (string & {});

export interface LifeEvent {
  id: string;
  type: LifeEventType;
  /** Absolute timestamp. Persisted as ISO-8601 and rendered in the user's IANA timezone. */
  timestamp: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type SleepState = 'awake' | 'sleeping' | 'unknown';

export type LifeStateWarningCode =
  | 'invalid_timestamp'
  | 'future_event'
  | 'duplicate_wake'
  | 'duplicate_sleep_start';

export interface LifeStateWarning {
  code: LifeStateWarningCode;
  eventId: string;
}

export interface LifeState {
  currentSleepState: SleepState;
  lastWakeAt: string | null;
  lastSleepStartAt: string | null;
  awakeDurationMinutes: number | null;
  lastSleepDurationMinutes: number | null;
  lastMealAt: string | null;
  timeSinceLastMealMinutes: number | null;
  mealsToday: number;
  warnings: LifeStateWarning[];
}

export interface LifePreferences {
  timezone: string;
  targetSleepDurationMinutes: number;
  preferredSleepTime: string;
  preferredWakeTime: string;
  mealIntervalMinMinutes: number;
  mealIntervalMaxMinutes: number;
}

export type LifePlanItemKind = 'meal' | 'sleep' | 'wake' | 'state';

export interface LifePlanItem {
  id: string;
  kind: LifePlanItemKind;
  title: string;
  detail: string;
  urgency: 'now' | 'next' | 'later';
  scheduledLocalTime?: string;
  actionEventType?: BuiltInLifeEventType;
}

export interface LifeControllerPlan {
  stateSummary: string;
  now: LifePlanItem | null;
  next: LifePlanItem[];
  later: LifePlanItem[];
  notices: string[];
}

export interface LifeControllerPlannerInput {
  currentTime: Date;
  lifeState: LifeState;
  lifePreferences: LifePreferences;
  /** Reserved for Alpha 0.2. Alpha 0.1 deliberately does not select work tasks. */
  availableTasks?: unknown[];
  calendar?: unknown[];
  projects?: unknown[];
  deadlines?: unknown[];
}

export type LifeEventStore = Record<string, LifeEvent[]>;
