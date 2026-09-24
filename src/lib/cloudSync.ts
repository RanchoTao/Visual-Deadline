import type { Goal, PressureCalibrationSnapshot, PressureHistoryRecord, Task, UserProfile } from '../types/task';
import type { LifeEvent } from '../types/lifeController';
import { normalizeLifeEvents } from '../domain/life-controller';
import { SupabaseRestError, supabase, type SupabaseSession } from './supabaseClient';
import { assertWorkspaceSessionOwner, type WorkspaceOwner } from '../storage/workspace';
import type { OpsState } from '../domain/ops/types';
import { mergeReviewStates, normalizeReviewState } from '../domain/review/normalization';
import { collectReviewRowPages } from '../domain/review/pagination';
import type { ReviewHistoryEvent, ReviewRecord, ReviewState } from '../domain/review/types';

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
  socialNodes?: unknown[];
  socialLayoutVersion?: number;
  opsState?: OpsState;
  reviewState?: ReviewState;
}

interface ProfileRow {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_storage_path: string | null;
  data: ProfileData | null;
  updated_at?: string;
}

interface LifeEventRow {
  id: string;
  user_id: string;
  type: string;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface ReviewRecordRow { id: string; user_id: string; data: ReviewRecord; }
interface ReviewEventRow { id: string; user_id: string; data: ReviewHistoryEvent; }
interface ReviewTombstoneRow { review_id: string; user_id: string; deleted_at: string; }

const REVIEW_PAGE_SIZE = 500;

export interface CloudData {
  tasks: Task[];
  goals: Goal[];
  pressureHistory: PressureHistoryRecord[];
  profile: UserProfile | null;
  pressureCalibration: PressureCalibrationSnapshot | null;
  onboardingComplete: boolean | null;
  socialNodes: unknown[] | null;
  socialLayoutVersion: number | null;
  opsState: OpsState | null;
  reviewState: ReviewState | null;
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
    return new Error('数据库结构尚未初始化，请先执行 supabase-schema.sql。');
  }

  if (RLS_DENIED_PATTERNS.some((pattern) => pattern.test(details)) || (error instanceof SupabaseRestError && [401, 403].includes(error.status))) {
    return new Error('云同步权限被拒绝，请检查 RLS 权限策略。');
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
  if (values.length === 0) return;
  await supabase.rest(table, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(values.map((value) => rowFromEntity(value, session.user.id))),
  }, session);
}

export async function loadCloudData(session: SupabaseSession, owner: WorkspaceOwner): Promise<CloudData> {
  assertWorkspaceSessionOwner(owner, session.user.id);
  return withCloudSyncErrors((async () => {
    const [tasks, goals, pressureHistory, profiles, reviewRecords, reviewEvents, reviewTombstones] = await Promise.all([
      loadJsonRows<Task>('tasks', session),
      loadJsonRows<Goal>('goals', session),
      loadJsonRows<PressureHistoryRecord>('pressure_logs', session),
      supabase.rest<ProfileRow[]>(`profiles?select=id,user_id,email,display_name,avatar_url,avatar_storage_path,data,updated_at&user_id=eq.${encode(session.user.id)}&limit=1`, { method: 'GET' }, session),
      loadAllReviewRows<ReviewRecordRow>('review_records', 'id,user_id,data', 'id.asc', session),
      loadAllReviewRows<ReviewEventRow>('review_events', 'id,user_id,data', 'id.asc', session),
      loadAllReviewRows<ReviewTombstoneRow>('review_tombstones', 'review_id,user_id,deleted_at', 'review_id.asc', session),
    ]);
    const profileData = profiles[0]?.data;
    const rowReviewState = normalizeReviewState({ schemaVersion: 2, defaultWindowDays: 7, reviews: reviewRecords.map((row) => row.data), events: reviewEvents.map((row) => row.data), reviewTombstones: reviewTombstones.map((row) => ({ id: row.review_id, deletedAt: row.deleted_at })), updatedAt: [...reviewRecords.map((row) => row.data.updatedAt), ...reviewEvents.map((row) => row.data.recordedAt), ...reviewTombstones.map((row) => row.deleted_at)].sort().at(-1) ?? new Date(0).toISOString() });
    const reviewState = profileData?.reviewState ? mergeReviewStates(profileData.reviewState, rowReviewState) : rowReviewState;
    // Complete the legacy profile-to-row migration before a later profile save can remove the legacy payload.
    if (profileData?.reviewState) await saveCloudReviewState(reviewState, session, owner);
    return {
      tasks,
      goals,
      pressureHistory,
      profile: profileData?.profile ? { ...profileData.profile, avatarUrl: profiles[0]?.avatar_url ?? undefined, avatarDataUrl: undefined } as UserProfile : null,
      pressureCalibration: profileData?.pressureCalibration ?? null,
      onboardingComplete: typeof profileData?.onboardingComplete === 'boolean' ? profileData.onboardingComplete : null,
      socialNodes: Array.isArray(profileData?.socialNodes) ? profileData.socialNodes : null,
      socialLayoutVersion: typeof profileData?.socialLayoutVersion === 'number' ? profileData.socialLayoutVersion : null,
      opsState: profileData?.opsState ?? null,
      reviewState: reviewState.reviews.length || reviewState.events.length || reviewState.reviewTombstones.length ? reviewState : null,
    };
  })());
}

export async function saveCloudTasks(tasks: Task[], session: SupabaseSession, owner: WorkspaceOwner): Promise<void> {
  assertWorkspaceSessionOwner(owner, session.user.id);
  await withCloudSyncErrors(replaceJsonRows('tasks', tasks, session));
}

export async function saveCloudGoals(goals: Goal[], session: SupabaseSession, owner: WorkspaceOwner): Promise<void> {
  assertWorkspaceSessionOwner(owner, session.user.id);
  await withCloudSyncErrors(replaceJsonRows('goals', goals, session));
}

export async function saveCloudPressureHistory(records: PressureHistoryRecord[], session: SupabaseSession, owner: WorkspaceOwner): Promise<void> {
  assertWorkspaceSessionOwner(owner, session.user.id);
  await withCloudSyncErrors(replaceJsonRows('pressure_logs', records, session));
}

export async function loadCloudLifeEvents(session: SupabaseSession, owner: WorkspaceOwner): Promise<LifeEvent[]> {
  assertWorkspaceSessionOwner(owner, session.user.id);
  try {
    const rows = await supabase.rest<LifeEventRow[]>(`life_events?select=id,user_id,type,occurred_at,metadata,created_at,updated_at&user_id=eq.${encode(session.user.id)}&order=occurred_at.asc`, { method: 'GET' }, session);
    return normalizeLifeEvents(rows.map((row) => ({
      id: row.id,
      type: row.type,
      timestamp: row.occurred_at,
      metadata: row.metadata ?? {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
  } catch (error) {
    const details = error instanceof SupabaseRestError
      ? [error.message, error.code, error.details, error.hint, String(error.status)].filter(Boolean).join(' ')
      : error instanceof Error ? error.message : '';
    if (TABLE_OR_COLUMN_MISSING_PATTERNS.some((pattern) => pattern.test(details))) {
      console.error('[Visual Deadline Life Controller cloud sync error]', error);
      throw new Error('Life Controller migration 尚未应用，请执行 supabase/migrations/20260905133915_life_controller_alpha_0_1.sql。');
    }
    throw formatCloudSyncError(error);
  }
}

export async function upsertCloudLifeEvents(events: LifeEvent[], session: SupabaseSession, owner: WorkspaceOwner): Promise<void> {
  assertWorkspaceSessionOwner(owner, session.user.id);
  if (events.length === 0) return;
  await withCloudSyncErrors(supabase.rest('life_events', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(events.map((event) => ({
      id: event.id,
      user_id: session.user.id,
      type: event.type,
      occurred_at: event.timestamp,
      metadata: event.metadata,
      created_at: event.createdAt,
      updated_at: event.updatedAt,
    }))),
  }, session));
}

export async function deleteCloudLifeEvent(eventId: string, session: SupabaseSession, owner: WorkspaceOwner): Promise<void> {
  assertWorkspaceSessionOwner(owner, session.user.id);
  await withCloudSyncErrors(supabase.rest(`life_events?id=eq.${encode(eventId)}&user_id=eq.${encode(session.user.id)}`, { method: 'DELETE' }, session));
}

export async function saveCloudReviewState(state: ReviewState, session: SupabaseSession, owner: WorkspaceOwner): Promise<void> {
  assertWorkspaceSessionOwner(owner, session.user.id);
  const normalized = normalizeReviewState(state);
  const batches = <T,>(values: T[]) => Array.from({ length: Math.ceil(values.length / 100) }, (_, index) => values.slice(index * 100, index * 100 + 100));
  await withCloudSyncErrors((async () => {
    for (const records of batches(normalized.reviews)) await supabase.rest('review_records', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(records.map((record) => ({ id: record.id, user_id: session.user.id, data: record, created_at: record.createdAt, updated_at: record.updatedAt }))) }, session);
    for (const events of batches(normalized.events)) await supabase.rest('review_events', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(events.map((event) => ({ id: event.id, user_id: session.user.id, data: event, occurred_at: event.timestamp, recorded_at: event.recordedAt }))) }, session);
    for (const tombstones of batches(normalized.reviewTombstones)) await supabase.rest('review_tombstones', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(tombstones.map((entry) => ({ review_id: entry.id, user_id: session.user.id, deleted_at: entry.deletedAt }))) }, session);
  })());
}

async function loadAllReviewRows<T>(table: 'review_records' | 'review_events' | 'review_tombstones', select: string, order: string, session: SupabaseSession): Promise<T[]> {
  return collectReviewRowPages((offset) => supabase.restPage<T[]>(`${table}?select=${select}&user_id=eq.${encode(session.user.id)}&order=${order}&limit=${REVIEW_PAGE_SIZE}&offset=${offset}`, { method: 'GET' }, session));
}

export async function saveCloudProfile(input: { profile: UserProfile; pressureCalibration: PressureCalibrationSnapshot; onboardingComplete: boolean; socialNodes: unknown[]; socialLayoutVersion: number; opsState: OpsState }, session: SupabaseSession, owner: WorkspaceOwner): Promise<void> {
  assertWorkspaceSessionOwner(owner, session.user.id);
  await withCloudSyncErrors(supabase.rest('profiles', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id: session.user.id,
      user_id: session.user.id,
      email: session.user.email ?? null,
      display_name: input.profile.nickname || null,
      avatar_url: input.profile.avatarUrl || null,
      avatar_storage_path: input.profile.avatarUrl ? `${session.user.id}/avatar.webp` : null,
      data: {
        profile: { ...input.profile, avatarUrl: undefined },
        pressureCalibration: input.pressureCalibration,
        onboardingComplete: input.onboardingComplete,
        socialNodes: input.socialNodes,
        socialLayoutVersion: input.socialLayoutVersion,
        opsState: input.opsState,
      },
      updated_at: new Date().toISOString(),
    }),
  }, session));
}
