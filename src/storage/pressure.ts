import type { PressureCalibrationSnapshot, PressureHistoryRecord } from '../types/task';
import { storageKeys } from './schema';
import { browserStorageAdapter } from './dataSafety';
import { readWorkspaceValue, removeWorkspaceValue, writeWorkspaceValue, type WorkspaceOwner } from './workspace';

export function loadPressure(owner: WorkspaceOwner) {
  return {
    baselinePressure: readWorkspaceValue<number | null>(browserStorageAdapter, owner, storageKeys.baselinePressure, null),
    calibration: readWorkspaceValue<PressureCalibrationSnapshot | null>(browserStorageAdapter, owner, storageKeys.pressureCalibration, null),
    history: readWorkspaceValue<PressureHistoryRecord[]>(browserStorageAdapter, owner, storageKeys.pressureHistory, []),
  };
}

export function savePressure(owner: WorkspaceOwner, pressure: { baselinePressure?: number | null; calibration?: PressureCalibrationSnapshot | null; history?: PressureHistoryRecord[] }): void {
  if (pressure.baselinePressure !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.baselinePressure, pressure.baselinePressure);
  if (pressure.calibration !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.pressureCalibration, pressure.calibration);
  if (pressure.history !== undefined) writeWorkspaceValue(browserStorageAdapter, owner, storageKeys.pressureHistory, pressure.history);
}

export function clearPressure(owner: WorkspaceOwner): void {
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.baselinePressure);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.pressureCalibration);
  removeWorkspaceValue(browserStorageAdapter, owner, storageKeys.pressureHistory);
}
