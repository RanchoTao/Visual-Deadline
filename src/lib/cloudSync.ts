import type { Goal, PressureCalibrationSnapshot, PressureHistoryRecord, Task, UserProfile } from '../types/task';
import { SupabaseRestError, supabase, type SupabaseSession } from './supabaseClient';

interface JsonRow<T> {
  id: string;
  user_id: string;
  data: T;
  updated_at?: string;
}

interface ProfileData {
  profile: UserProfile | null;
  pressureCalibration: PressureCalibrationSnapshot | null;
  onboardingComplete: boolean | null;
}

interface ProfileRow {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  data: ProfileData | null;
  updated_at?: string;
}

export interface CloudData {
  tasks: Task[];
  goals: Goal[];
  pressureHistory: PressureHistoryRecord[];
  profile: UserProfile | null;
  pressureCalibration: PressureCalibrationSnapshot | null;
  onboardingComplete: boolean | null;
}

const encode = (value: string) => encodeURIComponent(value).replace(/'/g, '%27');

const TABLE_OR_COLUMN_MISSING_PATTERNS = [
  /relation .* does not exist/i,
  /table .* does not exist/i,
  /column .* does not exist/i,
  /could not find .* in the schema cache/i,
  /schema cache/i,
];

const RLS_DENIED_PATTERNS = [
  /permission denied/i,
  /row-level security/i,
  /violates row-level security policy/i,
  /not authorized/i,
];

function formatCloudSyncError(error: unknown): Error {
  if (!(error instanceof Error)) return new Error('云同步失败。');

  const details = error instanceof SupabaseRestError
    ? [error.message, error.code, error.details, error.hint, String(error.status)].filter(Boolean).join(' ')
    : error.message;

  console.error('[Visual Deadline cloud sync error]', error);

  if (TABLE_OR_COLUMN_MISSING_PATTERNS.some((pattern) => pattern.test(details))) {
    return new Error('Database schema is not initialized. Run supabase-schema.sql.');
  }

  if (RLS_DENIED_PATTERNS.some((pattern) => pattern.test(details)) || (error instanceof SupabaseRestError && [401, 403].includes(error.status))) {
    return new Error('Cloud sync permission denied. Check RLS policies.');
  }

  return error;
}

async function withCloudSyncErrors<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    throw formatCloudSyncError(error);
  }
}

function rowFromEntity<T extends { id: string }>(entity: T, userId: string) {
  return { id: entity.id, user_id: userId, data: entity, updated_at: new Date().toISOString() };
}

async function loadJsonRows<T>(table: 'tasks' | 'goals' | 'pressure_logs', session: SupabaseSession): Promise<T[]> {
  const rows = await supabase.rest<JsonRow<T>[]>(`${table}?select=id,user_id,data,updated_at&user_id=eq.${encode(session.user.id)}`, { method: 'GET' }, session);
  return rows.map((row) => row.data).filter(Boolean);
}

async function replaceJsonRows<T extends { id: string }>(table: 'tasks' | 'goals' | 'pressure_logs', values: T[], session: SupabaseSession): Promise<void> {
  await supabase.rest(`${table}?user_id=eq.${encode(session.user.id)}`, { method: 'DELETE' }, session);
  if (values.length === 0) return;
  await supabase.rest(table, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(values.map((value) => rowFromEntity(value, session.user.id))),
  }, session);
}

export async function loadCloudData(session: SupabaseSession): Promise<CloudData> {
  return withCloudSyncErrors((async () => {
    const [tasks, goals, pressureHistory, profiles] = await Promise.all([
      loadJsonRows<Task>('tasks', session),
      loadJsonRows<Goal>('goals', session),
      loadJsonRows<PressureHistoryRecord>('pressure_logs', session),
      supabase.rest<ProfileRow[]>(`profiles?select=id,user_id,email,display_name,data,updated_at&user_id=eq.${encode(session.user.id)}&limit=1`, { method: 'GET' }, session),
    ]);
    const profileData = profiles[0]?.data;
    return {
      tasks,
      goals,
      pressureHistory,
      profile: profileData?.profile ?? null,
      pressureCalibration: profileData?.pressureCalibration ?? null,
      onboardingComplete: typeof profileData?.onboardingComplete === 'boolean' ? profileData.onboardingComplete : null,
    };
  })());
}

export async function saveCloudTasks(tasks: Task[], session: SupabaseSession): Promise<void> {
  await withCloudSyncErrors(replaceJsonRows('tasks', tasks, session));
}

export async function saveCloudGoals(goals: Goal[], session: SupabaseSession): Promise<void> {
  await withCloudSyncErrors(replaceJsonRows('goals', goals, session));
}

export async function saveCloudPressureHistory(records: PressureHistoryRecord[], session: SupabaseSession): Promise<void> {
  await withCloudSyncErrors(replaceJsonRows('pressure_logs', records, session));
}

export async function saveCloudProfile(input: { profile: UserProfile; pressureCalibration: PressureCalibrationSnapshot; onboardingComplete: boolean }, session: SupabaseSession): Promise<void> {
  await withCloudSyncErrors(supabase.rest('profiles', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id: session.user.id,
      user_id: session.user.id,
      email: session.user.email ?? null,
      display_name: input.profile.nickname || null,
      data: {
        profile: input.profile,
        pressureCalibration: input.pressureCalibration,
        onboardingComplete: input.onboardingComplete,
      },
      updated_at: new Date().toISOString(),
    }),
  }, session));
}
