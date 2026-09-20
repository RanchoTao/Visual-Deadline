import { loadLifeMap } from './lifeMap';
import { loadLifeEventStore } from './lifeController';
import { loadLogs } from './logs';
import { loadPressure } from './pressure';
import { loadSettings } from './settings';
import { loadSocial } from './social';
import { loadTasks } from './tasks';
import { APP_NAME, loadValue, notifyStorageChange, saveValue, storageKeys, type VisualizedDeadlineData, type VisualizedDeadlineExport } from './schema';
import { browserStorageAdapter, createCompleteBackup, restoreBackup, type CompleteBackupEnvelope } from './dataSafety';

const rollingBackupKeys = [storageKeys.backup1, storageKeys.backup2, storageKeys.backup3] as const;

export function collectCurrentData(): VisualizedDeadlineData {
  const safeLoad = <T,>(reader: () => T, fallback: T): T => {
    try {
      return reader();
    } catch {
      return fallback;
    }
  };

  return {
    tasks: safeLoad(loadTasks, []),
    goals: safeLoad(() => loadValue(storageKeys.goals, []), []),
    pressure: safeLoad(loadPressure, { baselinePressure: null, calibration: null, history: [] }),
    social: safeLoad(loadSocial, { nodes: [], layoutVersion: 0 }),
    lifeMap: safeLoad(loadLifeMap, { nodes: [], layoutVersion: 0 }),
    lifeController: { eventsByOwner: safeLoad(loadLifeEventStore, {}) },
    logs: safeLoad(loadLogs, { achievements: [], aiArtifacts: [] }),
    settings: safeLoad(loadSettings, { profile: null, onboardingComplete: false }),
    metadata: { source: 'browser-local', futureSafe: false },
  };
}

export function createBackupSnapshot(): CompleteBackupEnvelope {
  return createCompleteBackup(browserStorageAdapter);
}

export function saveAutoBackup(): void {
  const latest = createBackupSnapshot();
  const safeLoad = (key: string): unknown => {
    try {
      return loadValue<VisualizedDeadlineExport | null>(key, null);
    } catch {
      return null;
    }
  };
  const previousLatest = safeLoad(storageKeys.backupLatest);
  const previous1 = safeLoad(storageKeys.backup1);
  const previous2 = safeLoad(storageKeys.backup2);

  if (previous2) saveValue(storageKeys.backup3, previous2);
  if (previous1) saveValue(storageKeys.backup2, previous1);
  if (previousLatest) saveValue(storageKeys.backup1, previousLatest);
  saveValue(storageKeys.backupLatest, latest);
}

export function loadLatestBackup(): unknown | null {
  try {
    return loadValue<VisualizedDeadlineExport | null>(storageKeys.backupLatest, null);
  } catch {
    return null;
  }
}

export function restoreData(data: VisualizedDeadlineData): void {
  const result = restoreBackup(browserStorageAdapter, { app: APP_NAME, schemaVersion: '0.9', data });
  if (!result.ok) throw new Error(result.error || 'Legacy restore failed.');
  notifyStorageChange();
}

export function restoreLatestBackup(): boolean {
  const latest = loadLatestBackup();
  if (!latest) return false;
  const result = restoreBackup(browserStorageAdapter, latest);
  if (result.ok) notifyStorageChange();
  return result.ok;
}

export function getAvailableBackupCount(): number {
  return [storageKeys.backupLatest, ...rollingBackupKeys].filter((key) => {
    try {
      return loadValue<VisualizedDeadlineExport | null>(key, null);
    } catch {
      return false;
    }
  }).length;
}
