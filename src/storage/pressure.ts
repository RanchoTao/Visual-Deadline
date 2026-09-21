import type { PressureCalibrationSnapshot, PressureHistoryRecord } from '../types/task';
import { storageKeys } from './schema';
import { browserStorageAdapter } from './dataSafety';
import { readWorkspaceOwner, readWorkspaceValue, removeWorkspaceValue, writeWorkspaceValue } from './workspace';

export function loadPressure() {
  return {
    baselinePressure: readWorkspaceValue<number | null>(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.baselinePressure, null),
    calibration: readWorkspaceValue<PressureCalibrationSnapshot | null>(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.pressureCalibration, null),
    history: readWorkspaceValue<PressureHistoryRecord[]>(browserStorageAdapter, readWorkspaceOwner(browserStorageAdapter), storageKeys.pressureHistory, []),
  };
}

export function savePressure(pressure: { baselinePressure?: number | null; calibration?: PressureCalibrationSnapshot | null; history?: PressureHistoryRecord[] }): void {
  const owner = readWorkspaceOwner(browserStorageAdapter);
  if (pressure.baselinePressure !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.baselinePressure, pressure.baselinePressure);
  if (pressure.calibration !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.pressureCalibration, pressure.calibration);
  if (pressure.history !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.pressureHistory, pressure.history);
}

export function clearPressure(): void {
  const owner = readWorkspaceOwner(browserStorageAdapter);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.baselinePressure);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.pressureCalibration);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.pressureHistory);
}
