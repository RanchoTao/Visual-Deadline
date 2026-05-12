import { loadLifeMap, saveLifeMap } from './lifeMap';
import { loadLogs, saveLogs } from './logs';
import { loadPressure, savePressure } from './pressure';
import { loadSettings, saveSettings } from './settings';
import { loadSocial, saveSocial } from './social';
import { loadTasks, saveTasks } from './tasks';
import { createExportEnvelope, loadValue, notifyStorageChange, saveValue, storageKeys, type VisualizedDeadlineData, type VisualizedDeadlineExport } from './schema';

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
    pressure: safeLoad(loadPressure, { baselinePressure: null, calibration: null, history: [] }),
    social: safeLoad(loadSocial, { nodes: [], layoutVersion: 0 }),
    lifeMap: safeLoad(loadLifeMap, { nodes: [], layoutVersion: 0 }),
    logs: safeLoad(loadLogs, { achievements: [] }),
    settings: safeLoad(loadSettings, { profile: null, onboardingComplete: false }),
    metadata: { source: 'browser-local', futureSafe: true },
  };
}

export function createBackupSnapshot(): VisualizedDeadlineExport {
  return createExportEnvelope(collectCurrentData());
}

export function saveAutoBackup(): void {
  const latest = createBackupSnapshot();
  const safeLoad = (key: string) => {
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

export function loadLatestBackup(): VisualizedDeadlineExport | null {
  try {
    return loadValue<VisualizedDeadlineExport | null>(storageKeys.backupLatest, null);
  } catch {
    return null;
  }
}

export function restoreData(data: VisualizedDeadlineData): void {
  saveTasks(data.tasks);
  savePressure(data.pressure);
  saveSocial(data.social);
  saveLifeMap(data.lifeMap);
  saveLogs(data.logs);
  saveSettings(data.settings);
  notifyStorageChange();
}

export function restoreLatestBackup(): boolean {
  const latest = loadLatestBackup();
  if (!latest?.data) return false;
  restoreData(latest.data);
  return true;
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
