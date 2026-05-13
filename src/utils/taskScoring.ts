import type { ActivityType, Achievement, Importance, LifecycleStatus, PressureBreakdown, PressureCalibrationSnapshot, PressureState, Task } from '../types/task';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export const activityTypes: ActivityType[] = ['task', 'schedule', 'entertainment', 'recovery', 'study', 'research', 'fitness', 'exercise', 'work', 'life', 'social', 'other'];
const lifecycleStatuses: LifecycleStatus[] = ['active', 'completed', 'abandoned'];

export function clampProgress(progress?: number): number {
  if (typeof progress !== 'number' || Number.isNaN(progress)) return 0;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

export function clampImportance(importance?: number): Importance {
  if (typeof importance !== 'number' || Number.isNaN(importance)) return 5;

  const rounded = Math.round(importance);
  return Math.min(10, Math.max(1, rounded)) as Importance;
}

export function clampPressure(pressure?: number): number {
  if (typeof pressure !== 'number' || Number.isNaN(pressure)) return 35;
  return Math.min(100, Math.max(0, Math.round(pressure)));
}

export function migrateLegacyImportance(importance?: number): Importance {
  const clampedImportance = clampImportance(importance);
  return clampedImportance <= 5 ? (clampedImportance * 2 as Importance) : clampedImportance;
}

export function normalizeActivityType(activityType?: string): ActivityType {
  const aliases: Record<string, ActivityType> = {
    research: 'research',
    exercise: 'exercise',
    work: 'work',
    life: 'life',
  };
  if (activityType && aliases[activityType]) return aliases[activityType];
  return activityTypes.includes(activityType as ActivityType) ? (activityType as ActivityType) : 'task';
}

export function normalizeLifecycleStatus(status?: string): LifecycleStatus {
  return lifecycleStatuses.includes(status as LifecycleStatus) ? (status as LifecycleStatus) : 'active';
}

export function getActivityTypeLabel(activityType: ActivityType): string {
  const labels: Record<ActivityType, string> = {
    task: '任务',
    schedule: '日程',
    entertainment: '娱乐',
    recovery: '恢复',
    study: '学习',
    research: '研究',
    fitness: '健身',
    exercise: '运动',
    work: '工作',
    life: '生活',
    social: '社交',
    other: '其他',
  };
  return labels[activityType];
}

export function getLifecycleStatusLabel(status: LifecycleStatus): string {
  return status === 'completed' ? '已完成' : status === 'abandoned' ? '已放弃' : '进行中';
}

export function getUrgencyScore(deadline?: string, now = new Date()): number {
  if (!deadline) return 0;

  const deadlineTime = new Date(deadline).getTime();
  if (Number.isNaN(deadlineTime)) return 0;

  const diff = deadlineTime - now.getTime();

  if (diff < 0) return 50;
  if (diff <= MS_PER_DAY) return 40;
  if (diff <= 3 * MS_PER_DAY) return 30;
  if (diff <= 7 * MS_PER_DAY) return 20;
  return 10;
}

export function getUrgencyWeight(deadline?: string, now = new Date()): number {
  if (!deadline) return 0.45;

  const deadlineTime = new Date(deadline).getTime();
  if (Number.isNaN(deadlineTime)) return 0.45;

  const diff = deadlineTime - now.getTime();

  if (diff < 0) return 2;
  if (diff <= 6 * MS_PER_HOUR) return 1.75;
  if (diff <= MS_PER_DAY) return 1.45;
  if (diff <= 3 * MS_PER_DAY) return 1.15;
  if (diff <= 7 * MS_PER_DAY) return 0.85;
  if (diff <= 30 * MS_PER_DAY) return 0.55;
  return 0.35;
}

export function getItemPressure(task: Task, now = new Date()): number {
  const urgencyWeight = getUrgencyWeight(task.deadline, now);
  const importanceWeight = 0.8 + task.importance / 2;
  return urgencyWeight * importanceWeight;
}

export function getTaskScore(task: Task, now = new Date()): number {
  return task.importance * 10 + getUrgencyScore(task.deadline, now);
}

export function isTaskComplete(task: Task): boolean {
  return task.lifecycleStatus === 'completed' || clampProgress(task.progress) >= 100;
}

export function isTaskActive(task: Task): boolean {
  return task.lifecycleStatus === 'active';
}

export function getRecommendedTask(tasks: Task[], now = new Date()): Task | undefined {
  return tasks
    .filter(isTaskActive)
    .sort((a, b) => getTaskScore(b, now) - getTaskScore(a, now))[0];
}

export function getRecommendationReason(task: Task, now = new Date()): string {
  const urgencyScore = getUrgencyScore(task.deadline, now);

  if (task.importance >= 8 && urgencyScore >= 30) return '重要性高，截止时间较近';
  if (urgencyScore >= 40) return '截止时间很近';
  if (task.importance >= 8 && urgencyScore <= 20) return '长期重要任务，适合提前推进';
  if (task.importance >= 7) return '重要性较高，值得优先推进';
  if (urgencyScore >= 30) return '截止时间较近，建议尽快处理';
  return '当前节奏合适，可以稳步推进';
}

export function getUrgencyPosition(deadline?: string, now = new Date()): number {
  if (!deadline) return 6;

  const deadlineTime = new Date(deadline).getTime();
  if (Number.isNaN(deadlineTime)) return 6;

  const diff = deadlineTime - now.getTime();
  if (diff <= 0) return 96;
  if (diff <= MS_PER_DAY) return 90;
  if (diff <= 3 * MS_PER_DAY) return 76;
  if (diff <= 7 * MS_PER_DAY) return 58;
  if (diff <= 30 * MS_PER_DAY) return 32;
  return 14;
}

export function getImportancePosition(importance: Task['importance']): number {
  return 8 + ((importance - 1) / 9) * 84;
}

export function getPulseDuration(task: Task): number {
  if (!isTaskActive(task)) return 0;
  const urgency = getUrgencyScore(task.deadline);
  if (urgency >= 50) return 1.15;
  if (urgency >= 40) return 1.45;
  if (urgency >= 30) return 1.9;
  if (urgency >= 20) return 2.8;
  return 4.2;
}

const DEFAULT_PRESSURE_RATIO = 6;
const MIN_REFERENCE_TASK_LOAD = 1;

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function getPressureState(rawPressure: number): PressureState {
  if (rawPressure > 100) return 'burnout';
  if (rawPressure >= 81) return 'overload';
  if (rawPressure >= 61) return 'high';
  if (rawPressure >= 31) return 'manageable';
  return 'steady';
}

export function calculateTaskLoad(tasks: Task[], now = new Date()): number {
  return tasks.filter(isTaskActive).reduce((sum, task) => sum + getItemPressure(task, now), 0);
}

export function calculateRecoveryRelief(tasks: Task[]): number {
  return tasks.reduce((sum, task) => {
    const recoveryRelief = task.lifecycleStatus !== 'abandoned' && task.activityType === 'recovery' ? 6 : 0;
    const entertainmentRelief = task.lifecycleStatus !== 'abandoned' && task.activityType === 'entertainment' ? 4 : 0;
    return sum + recoveryRelief + entertainmentRelief;
  }, 0);
}

export function createPressureCalibration(referencePressure: number, referenceTaskLoad: number, taskCount: number, capturedAt = new Date().toISOString()): PressureCalibrationSnapshot {
  const safeReferencePressure = clampPressure(referencePressure);
  const safeReferenceTaskLoad = Math.max(0, referenceTaskLoad);
  const pressureRatio = safeReferenceTaskLoad > 0 ? safeReferencePressure / safeReferenceTaskLoad : DEFAULT_PRESSURE_RATIO;

  return {
    referencePressure: safeReferencePressure,
    referenceTaskLoad: roundToTenth(safeReferenceTaskLoad),
    pressureRatio: roundToTenth(pressureRatio),
    taskCount,
    capturedAt,
    note: 'referencePressure describes how the calibrated task set felt; current pressure = currentTaskLoad × pressureRatio - recoveryRelief. Future versions may personalize urgency/importance weights from behavior.',
  };
}

export function normalizePressureCalibration(calibration?: Partial<PressureCalibrationSnapshot> | null, legacyReferencePressure = 35): PressureCalibrationSnapshot {
  const legacyCalibration = calibration as Partial<PressureCalibrationSnapshot> & { baselinePressure?: number; initialTotalTaskLoad?: number } | null | undefined;
  const referencePressure = clampPressure(calibration?.referencePressure ?? legacyCalibration?.baselinePressure ?? legacyReferencePressure);
  const storedReferenceTaskLoad = calibration?.referenceTaskLoad ?? legacyCalibration?.initialTotalTaskLoad;
  const referenceTaskLoad = typeof storedReferenceTaskLoad === 'number' && Number.isFinite(storedReferenceTaskLoad) ? Math.max(0, storedReferenceTaskLoad) : Math.max(MIN_REFERENCE_TASK_LOAD, referencePressure / DEFAULT_PRESSURE_RATIO);
  const pressureRatio = typeof calibration?.pressureRatio === 'number' && Number.isFinite(calibration.pressureRatio) && calibration.pressureRatio > 0 ? calibration.pressureRatio : referencePressure / Math.max(MIN_REFERENCE_TASK_LOAD, referenceTaskLoad);

  return {
    referencePressure,
    referenceTaskLoad: roundToTenth(referenceTaskLoad),
    pressureRatio: roundToTenth(pressureRatio),
    taskCount: typeof calibration?.taskCount === 'number' ? Math.max(0, calibration.taskCount) : 0,
    capturedAt: calibration?.capturedAt || new Date().toISOString(),
    note: calibration?.note || 'Migrated pressure calibration. Subjective pressure is treated as a calibration sample, not a permanent base layer.',
  };
}

export function calculatePressureIndex(tasks: Task[], calibration?: Partial<PressureCalibrationSnapshot> | null, legacyReferencePressure = 35, now = new Date()): PressureBreakdown {
  const normalizedCalibration = normalizePressureCalibration(calibration, legacyReferencePressure);
  const currentTaskLoad = calculateTaskLoad(tasks, now);
  const recoveryRelief = calculateRecoveryRelief(tasks);
  const rawPressure = Math.max(0, currentTaskLoad * normalizedCalibration.pressureRatio - recoveryRelief);
  const roundedRawPressure = Math.round(rawPressure);
  const state = getPressureState(roundedRawPressure);

  const labels: Record<PressureState, string> = {
    steady: '平稳',
    manageable: '可控',
    high: '高压',
    overload: '过载',
    burnout: '压力爆表 / Burnout Risk',
  };

  const recommendations: Record<PressureState, string> = {
    steady: '当前任务负载较轻，可以选择一个小而确定的下一步。',
    manageable: '压力仍在可控区，保持当前节奏并留意恢复。',
    high: '任务负载已经偏高，建议收窄今日目标。',
    overload: '可以减少并行任务，先完成或放弃低价值事项。',
    burnout: '先降低负载：放弃低价值任务，延后非必要事项，并安排恢复时间。',
  };

  return {
    referencePressure: normalizedCalibration.referencePressure,
    referenceTaskLoad: normalizedCalibration.referenceTaskLoad,
    pressureRatio: normalizedCalibration.pressureRatio,
    currentTaskLoad: roundToTenth(currentTaskLoad),
    recoveryRelief: roundToTenth(recoveryRelief),
    rawPressure: roundedRawPressure,
    displayPressure: state === 'burnout' ? roundedRawPressure : Math.min(100, roundedRawPressure),
    state,
    label: labels[state],
    recommendation: recommendations[state],
  };
}

export function getPressureInterpretation(totalPressure: number): string {
  const pressure = clampPressure(totalPressure);
  if (pressure <= 30) return '平稳';
  if (pressure <= 60) return '可控';
  if (pressure <= 80) return '高压';
  return '过载';
}

export const achievementCatalog: Omit<Achievement, 'unlockedAt'>[] = [
  { id: 'first-entry', title: '初次进入 VD', description: '你开始把 Deadline 与压力外化成可以观察的系统。' },
  { id: 'first-task-created', title: '第一次创建任务', description: '第一项压力源已被记录，不再只停留在脑内。' },
  { id: 'first-task-completed', title: '第一次完成任务', description: '完成带来的释放会被计入你的节奏。' },
  { id: 'first-low-value-abandoned', title: '第一次放弃低价值任务', description: '主动卸载低价值事项，也是推进系统稳定的一部分。' },
  { id: 'first-manageable-pressure', title: '第一次压力降到可控区', description: '你的压力指数回到可观察、可调整的范围。' },
  { id: 'first-three-completed', title: '第一次完成 3 个任务', description: '连续完成正在形成可见的秩序感。' },
  { id: 'first-seven-day-progress', title: '第一次完成 7 天内任务推进', description: '你在一周窗口内完成了推进，节奏开始被看见。' },
  { id: 'first-recovery-relief', title: '第一次使用恢复/娱乐活动降低压力', description: '恢复不是逃避，它是让系统继续运转的维护。' },
];
