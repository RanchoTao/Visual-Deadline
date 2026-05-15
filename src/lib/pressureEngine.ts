import type { PressureCalibrationSnapshot, Task } from '../types/task';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const DEFAULT_PRESSURE_COEFFICIENT = 1;

export type PressureTaskSnapshot = {
  taskId: string;
  title: string;
  importance: number;
  deadline?: string;
  activityType: Task['activityType'];
  lifecycleStatus: Task['lifecycleStatus'];
  urgencyWeight: number;
  taskPressure: number;
};

export type PressureModelWeights = {
  importanceWeight: number;
  urgencyWeight: number;
  interactionWeight: number;
};

export const defaultPressureModelWeights: PressureModelWeights = {
  importanceWeight: 0,
  urgencyWeight: 0,
  interactionWeight: 1,
};

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundToHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundToFourDecimals(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function normalizeDateTime(value?: string | number | Date): number | undefined {
  if (!value) return undefined;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function calculateUrgency(deadline?: string | number | Date, now: string | number | Date = new Date()): number {
  const deadlineTimestamp = normalizeDateTime(deadline);
  if (deadlineTimestamp === undefined) return 0.5;

  const nowTimestamp = normalizeDateTime(now) ?? Date.now();
  const remaining = deadlineTimestamp - nowTimestamp;

  if (remaining < 0) return 7;
  if (remaining <= MS_PER_HOUR) return 6;
  if (remaining <= 6 * MS_PER_HOUR) return 5;
  if (remaining <= MS_PER_DAY) return 4;
  if (remaining <= 3 * MS_PER_DAY) return 3;
  if (remaining <= 7 * MS_PER_DAY) return 2;
  if (remaining <= 30 * MS_PER_DAY) return 1;
  return 0.75;
}

export function isUnfinishedPressureTask(task: Task): boolean {
  return task.lifecycleStatus === 'active' && task.progress < 100;
}

function normalizeProgressPressure(progress?: number): number {
  if (typeof progress !== 'number' || Number.isNaN(progress)) return 0;
  return Math.min(100, Math.max(0, progress));
}

export function calculateTaskPressure(task: Task, now: string | number | Date = new Date(), weights: PressureModelWeights = defaultPressureModelWeights): number {
  const urgency = calculateUrgency(task.deadline, now);
  const progressNormalized = normalizeProgressPressure(task.progress) / 100;
  const remainingWorkMultiplier = 1 - progressNormalized;
  const importanceTerm = weights.importanceWeight * task.importance;
  const urgencyTerm = weights.urgencyWeight * urgency;
  const interactionTerm = weights.interactionWeight * task.importance * urgency * remainingWorkMultiplier;

  // Default VD v1 model: taskPressure = importance × urgency × remaining work.
  // The additive terms are intentionally present for future personalization:
  // α × importance + β × urgency + γ × interactionTerm.
  return roundToHundredth(importanceTerm + urgencyTerm + interactionTerm);
}

export function calculateRawPressure(tasks: Task[], now: string | number | Date = new Date(), weights: PressureModelWeights = defaultPressureModelWeights): number {
  return roundToHundredth(tasks.filter(isUnfinishedPressureTask).reduce((sum, task) => sum + calculateTaskPressure(task, now, weights), 0));
}

export function createTaskSnapshotAtCalibration(tasks: Task[], now: string | number | Date = new Date(), weights: PressureModelWeights = defaultPressureModelWeights): PressureTaskSnapshot[] {
  return tasks.filter(isUnfinishedPressureTask).map((task) => ({
    taskId: task.id,
    title: task.title,
    importance: task.importance,
    deadline: task.deadline,
    activityType: task.activityType,
    lifecycleStatus: task.lifecycleStatus,
    urgencyWeight: roundToHundredth(calculateUrgency(task.deadline, now)),
    taskPressure: roundToHundredth(calculateTaskPressure(task, now, weights)),
  }));
}

export function calibratePressure(tasks: Task[], subjectivePressure: number, now: string | number | Date = new Date(), weights: PressureModelWeights = defaultPressureModelWeights): PressureCalibrationSnapshot {
  const safeSubjectivePressure = Math.max(0, Math.round(subjectivePressure));
  const calibratedAt = new Date(normalizeDateTime(now) ?? Date.now()).toISOString();
  const rawPressureAtCalibration = calculateRawPressure(tasks, calibratedAt, weights);
  const pressureCoefficient = rawPressureAtCalibration <= 0 ? DEFAULT_PRESSURE_COEFFICIENT : safeSubjectivePressure / rawPressureAtCalibration;

  return {
    lastSubjectivePressure: safeSubjectivePressure,
    rawPressureAtCalibration: roundToTenth(rawPressureAtCalibration),
    pressureCoefficient: roundToFourDecimals(pressureCoefficient),
    calibratedAt,
    taskSnapshotAtCalibration: createTaskSnapshotAtCalibration(tasks, calibratedAt, weights),
    modelVersion: 'importance-urgency-v1',
    modelWeights: weights,

    // Backward-compatible aliases used by existing UI/storage migrations.
    referencePressure: safeSubjectivePressure,
    referenceTaskLoad: roundToTenth(rawPressureAtCalibration),
    pressureRatio: roundToFourDecimals(pressureCoefficient),
    taskCount: tasks.filter(isUnfinishedPressureTask).length,
    capturedAt: calibratedAt,
    note: 'subjective pressure calibrates the current raw task pressure: realtimePressure = currentRawPressure × pressureCoefficient.',
  };
}

export function calculateRealtimePressure(tasks: Task[], pressureCoefficient: number, _recoveryRelease = 0, now: string | number | Date = new Date(), weights: PressureModelWeights = defaultPressureModelWeights): number {
  const safeCoefficient = Number.isFinite(pressureCoefficient) && pressureCoefficient >= 0 ? pressureCoefficient : DEFAULT_PRESSURE_COEFFICIENT;
  return Math.max(0, calculateRawPressure(tasks, now, weights) * safeCoefficient);
}
