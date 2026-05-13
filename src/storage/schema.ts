import type { Achievement, Goal, PressureCalibrationSnapshot, PressureHistoryRecord, Task, UserProfile } from '../types/task';

export const APP_NAME = 'Visualized-Deadline';
export const SCHEMA_VERSION = '0.7';
export const STORAGE_CHANGE_EVENT = 'vd-storage-change';
export const STORAGE_RECOVERY_EVENT = 'vd-storage-recovery';

let recoveryNotice = '';

export function setRecoveryNotice(message: string): void {
  recoveryNotice = message;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STORAGE_RECOVERY_EVENT, { detail: { message } }));
}

export function getRecoveryNotice(): string {
  return recoveryNotice;
}

export const storageKeys = {
  tasks: 'visualized-deadline.tasks',
  baselinePressure: 'visualized-deadline.baselinePressure',
  achievements: 'visualized-deadline.achievements',
  profile: 'visualized-deadline.profile',
  onboardingComplete: 'visualized-deadline.onboardingComplete',
  welcomeLastActive: 'visualized-deadline.welcomeLastActive',
  aiSettings: 'vd.aiSettings',
  goals: 'visualized-deadline.goals',
  pressureCalibration: 'visualized-deadline.pressureCalibration',
  pressureHistory: 'visualized-deadline.pressureHistory',
  lifeMapNodes: 'visualized-deadline.lifeMap.nodes',
  lifeMapLayoutVersion: 'visualized-deadline.lifeMap.layoutVersion',
  socialNodes: 'visualized-deadline.social.nodes',
  socialLayoutVersion: 'visualized-deadline.social.layoutVersion',
  backupLatest: 'vd_backup_latest',
  backup1: 'vd_backup_1',
  backup2: 'vd_backup_2',
  backup3: 'vd_backup_3',
} as const;

export interface PressureExportData {
  baselinePressure: number | null;
  calibration: PressureCalibrationSnapshot | null;
  history: PressureHistoryRecord[];
}

export interface LifeMapExportData {
  nodes: unknown[];
  layoutVersion: number;
}

export interface SocialExportData {
  nodes: unknown[];
  layoutVersion: number;
}

export interface LogsExportData {
  achievements: Achievement[];
}

export interface SettingsExportData {
  profile: UserProfile | null;
  onboardingComplete: boolean;
}

export interface VisualizedDeadlineData {
  tasks: Task[];
  goals: Goal[];
  pressure: PressureExportData;
  social: SocialExportData;
  lifeMap: LifeMapExportData;
  logs: LogsExportData;
  settings: SettingsExportData;
  metadata: {
    source: 'browser-local';
    futureSafe: true;
  };
}

export interface VisualizedDeadlineExport {
  schemaVersion: string;
  exportedAt: string;
  app: typeof APP_NAME;
  data: VisualizedDeadlineData;
}

export interface MigrationResult {
  ok: boolean;
  data?: VisualizedDeadlineData;
  schemaVersion?: string;
  error?: string;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number(part));
  const rightParts = right.split('.').map((part) => Number(part));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightValue = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
    if (leftValue !== rightValue) return leftValue - rightValue;
  }

  return 0;
}

export function notifyStorageChange(key?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STORAGE_CHANGE_EVENT, { detail: { key } }));
}

export function loadValue<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  const item = window.localStorage.getItem(key);
  if (item === null) return fallback;
  return JSON.parse(item) as T;
}

export function saveValue<T>(key: string, value: T): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
  notifyStorageChange(key);
}

export function clearValue(key: string): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(key);
  notifyStorageChange(key);
}

export function hasValue(key: string): boolean {
  if (!canUseStorage()) return false;
  return window.localStorage.getItem(key) !== null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

export function normalizeExportData(data: Partial<VisualizedDeadlineData> | undefined): VisualizedDeadlineData {
  const pressure = asRecord(data?.pressure);
  const social = asRecord(data?.social);
  const lifeMap = asRecord(data?.lifeMap);
  const logs = asRecord(data?.logs);
  const settings = asRecord(data?.settings);

  return {
    tasks: asArray(data?.tasks) as Task[],
    goals: asArray(data?.goals) as Goal[],
    pressure: {
      baselinePressure: pressure && pressure.baselinePressure !== undefined && pressure.baselinePressure !== null ? asNumber(pressure.baselinePressure, 0) : null,
      calibration: (pressure?.calibration as PressureCalibrationSnapshot | null) ?? null,
      history: asArray(pressure?.history) as PressureHistoryRecord[],
    },
    social: {
      nodes: asArray(social?.nodes),
      layoutVersion: asNumber(social?.layoutVersion),
    },
    lifeMap: {
      nodes: asArray(lifeMap?.nodes),
      layoutVersion: asNumber(lifeMap?.layoutVersion),
    },
    logs: {
      achievements: asArray(logs?.achievements) as Achievement[],
    },
    settings: {
      profile: (settings?.profile as UserProfile | null) ?? null,
      onboardingComplete: asBoolean(settings?.onboardingComplete),
    },
    metadata: { source: 'browser-local', futureSafe: true },
  };
}

export function createExportEnvelope(data: VisualizedDeadlineData, exportedAt = new Date().toISOString()): VisualizedDeadlineExport {
  return { schemaVersion: SCHEMA_VERSION, exportedAt, app: APP_NAME, data: normalizeExportData(data) };
}

export function migrateData(raw: unknown): MigrationResult {
  const envelope = asRecord(raw);
  if (!envelope) return { ok: false, error: '导入文件不是有效的 VD 数据对象。' };

  const app = envelope.app;
  if (app !== undefined && app !== APP_NAME) return { ok: false, error: '导入文件不属于 Visualized-Deadline。' };

  const schemaVersion = typeof envelope.schemaVersion === 'string' ? envelope.schemaVersion : 'legacy';
  if (schemaVersion !== 'legacy' && compareVersions(schemaVersion, SCHEMA_VERSION) > 0) {
    return { ok: false, error: `该备份来自更新的架构版本（${schemaVersion}），当前版本无法安全导入。` };
  }

  if (schemaVersion === SCHEMA_VERSION) {
    const data = asRecord(envelope.data);
    if (!data) return { ok: false, error: '备份缺少 data 字段。' };
    return { ok: true, schemaVersion, data: normalizeExportData(data as Partial<VisualizedDeadlineData>) };
  }

  // Legacy import path: accept either an older envelope or a plain object with known sections.
  const legacyData = asRecord(envelope.data) ?? envelope;
  return { ok: true, schemaVersion, data: normalizeExportData(legacyData as Partial<VisualizedDeadlineData>) };
}

export function parseImportJson(text: string): MigrationResult {
  try {
    return migrateData(JSON.parse(text));
  } catch {
    return { ok: false, error: '文件不是有效 JSON，请选择由 VD 导出的 .json 备份。' };
  }
}

export function formatBackupFilename(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `VD-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}.json`;
}
