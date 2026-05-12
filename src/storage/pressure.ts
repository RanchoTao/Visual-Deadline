import type { PressureCalibrationSnapshot, PressureHistoryRecord } from '../types/task';
import { clearValue, loadValue, saveValue, storageKeys } from './schema';

export function loadPressure() {
  return {
    baselinePressure: loadValue<number | null>(storageKeys.baselinePressure, null),
    calibration: loadValue<PressureCalibrationSnapshot | null>(storageKeys.pressureCalibration, null),
    history: loadValue<PressureHistoryRecord[]>(storageKeys.pressureHistory, []),
  };
}

export function savePressure(pressure: { baselinePressure?: number | null; calibration?: PressureCalibrationSnapshot | null; history?: PressureHistoryRecord[] }): void {
  if (pressure.baselinePressure !== undefined) saveValue(storageKeys.baselinePressure, pressure.baselinePressure);
  if (pressure.calibration !== undefined) saveValue(storageKeys.pressureCalibration, pressure.calibration);
  if (pressure.history !== undefined) saveValue(storageKeys.pressureHistory, pressure.history);
}

export function clearPressure(): void {
  clearValue(storageKeys.baselinePressure);
  clearValue(storageKeys.pressureCalibration);
  clearValue(storageKeys.pressureHistory);
}
