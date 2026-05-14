import { calculateRawPressure, calculateRealtimePressure, calculateTaskPressure, calculateUrgency, calibratePressure } from '../lib/pressureEngine';
import type { ActivityType, Achievement, Importance, LifecycleStatus, PressureBreakdown, PressureCalibrationSnapshot, PressureState, Task } from '../types/task';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export const activityTypes: ActivityType[] = ['task', 'schedule', 'entertainment', 'recovery', 'study', 'research', 'fitness', 'exercise', 'work', 'life', 'social', 'other'];
const lifecycleStatuses: LifecycleStatus[] = ['active', 'completed', 'abandoned'];

export function clampProgress(progress?: number): number {
  if (typeof progress !== 'number' || Number.isNaN(progress)) return 0;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

export function normalizeProgressMode(progressMode: unknown, progress: number, deadline?: string): 'manual' | 'auto' {
  if (progressMode === 'manual') return 'manual';
  if (progressMode === 'auto') return deadline ? 'auto' : 'manual';
  return progress === 0 && Boolean(deadline) ? 'auto' : 'manual';
}

export function getTaskProgress(task: Task): number {
  return clampProgress(task.taskProgress ?? task.progress);
}

export function getTimeProgress(task: Task, now = new Date()): number {
  const rawProgress = getTaskProgress(task);
  if (task.lifecycleStatus !== 'active') return rawProgress;
  if (!task.deadline || !task.createdAt) return rawProgress;

  const start = new Date(task.createdAt).getTime();
  const end = new Date(task.deadline).getTime();
  const current = now.getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return rawProgress;
  if (current <= start) return 0;
  if (current >= end) return 100;

  return clampProgress(((current - start) / (end - start)) * 100);
}

export function isProgressAuto(task: Task): boolean {
  return normalizeProgressMode(task.progressMode, clampProgress(task.progress), task.deadline) === 'auto';
}

export function getDisplayProgress(task: Task, now = new Date()): number {
  return isProgressAuto(task) ? getTimeProgress(task, now) : getTaskProgress(task);
}

export function clampImportance(importance?: number): Importance {
  if (typeof importance !== 'number' || Number.isNaN(importance)) return 5;

  const rounded = Math.round(importance);
  return Math.min(10, Math.max(1, rounded)) as Importance;
}

export function clampPressure(pressure?: number): number {
  if (typeof pressure !== 'number' || Number.isNaN(pressure)) return 5;
  return Math.min(100, Math.max(0, Math.round(pressure)));
}

export function clampSubjectivePressure(pressure?: number): number {
  if (typeof pressure !== 'number' || Number.isNaN(pressure)) return 5;
  const rounded = Math.round(pressure);
  if (rounded > 10) return Math.min(10, Math.max(1, Math.round(rounded / 10)));
  return Math.min(10, Math.max(1, rounded));
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
  return Math.round(calculateUrgency(deadline, now) * 10);
}

export function getUrgencyWeight(deadline?: string, now = new Date()): number {
  return calculateUrgency(deadline, now);
}

export function getItemPressure(task: Task, now = new Date()): number {
  return calculateTaskPressure(task, now);
}

export function getTaskScore(task: Task, now = new Date()): number {
  return calculateTaskPressure(task, now) * 10 + task.importance;
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

const DEFAULT_PRESSURE_RATIO = 1;
const MIN_REFERENCE_TASK_LOAD = 1;

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundToFourDecimals(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function getPressureState(rawPressure: number): PressureState {
  if (rawPressure > 10) return 'burnout';
  if (rawPressure >= 8) return 'overload';
  if (rawPressure >= 6) return 'high';
  if (rawPressure >= 3) return 'manageable';
  return 'steady';
}

export function calculateTaskLoad(tasks: Task[], now = new Date()): number {
  return calculateRawPressure(tasks, now);
}

export function calculateRecoveryRelief(tasks: Task[]): number {
  return tasks.reduce((sum, task) => {
    const recoveryRelief = task.lifecycleStatus !== 'abandoned' && task.activityType === 'recovery' ? 6 : 0;
    const entertainmentRelief = task.lifecycleStatus !== 'abandoned' && task.activityType === 'entertainment' ? 4 : 0;
    return sum + recoveryRelief + entertainmentRelief;
  }, 0);
}

export function createPressureCalibration(referencePressure: number, sourceTasksOrRawPressure: Task[] | number, taskCount = 0, capturedAt = new Date().toISOString()): PressureCalibrationSnapshot {
  if (Array.isArray(sourceTasksOrRawPressure)) return calibratePressure(sourceTasksOrRawPressure, clampSubjectivePressure(referencePressure), capturedAt);

  const safeReferencePressure = clampSubjectivePressure(referencePressure);
  const safeRawPressure = Math.max(0, sourceTasksOrRawPressure);
  const pressureCoefficient = safeRawPressure > 0 ? safeReferencePressure / safeRawPressure : DEFAULT_PRESSURE_RATIO;

  return {
    lastSubjectivePressure: safeReferencePressure,
    rawPressureAtCalibration: roundToTenth(safeRawPressure),
    pressureCoefficient: roundToFourDecimals(pressureCoefficient),
    calibratedAt: capturedAt,
    taskSnapshotAtCalibration: [],
    modelVersion: 'importance-urgency-v1',
    referencePressure: safeReferencePressure,
    referenceTaskLoad: roundToTenth(safeRawPressure),
    pressureRatio: roundToFourDecimals(pressureCoefficient),
    taskCount,
    capturedAt,
    note: 'subjective pressure calibrates the current raw task pressure: realtimePressure = currentRawPressure × pressureCoefficient - recoveryRelease.',
  };
}

export function normalizePressureCalibration(calibration?: Partial<PressureCalibrationSnapshot> | null, legacyReferencePressure = 35): PressureCalibrationSnapshot {
  const legacyCalibration = calibration as Partial<PressureCalibrationSnapshot> & { baselinePressure?: number; initialTotalTaskLoad?: number } | null | undefined;
  const lastSubjectivePressure = clampSubjectivePressure(calibration?.lastSubjectivePressure ?? calibration?.referencePressure ?? legacyCalibration?.baselinePressure ?? legacyReferencePressure);
  const storedRawPressure = calibration?.rawPressureAtCalibration ?? calibration?.referenceTaskLoad ?? legacyCalibration?.initialTotalTaskLoad;
  const rawPressureAtCalibration = typeof storedRawPressure === 'number' && Number.isFinite(storedRawPressure) ? Math.max(0, storedRawPressure) : Math.max(MIN_REFERENCE_TASK_LOAD, lastSubjectivePressure / DEFAULT_PRESSURE_RATIO);
  const pressureCoefficient = typeof calibration?.pressureCoefficient === 'number' && Number.isFinite(calibration.pressureCoefficient) && calibration.pressureCoefficient > 0
    ? calibration.pressureCoefficient
    : typeof calibration?.pressureRatio === 'number' && Number.isFinite(calibration.pressureRatio) && calibration.pressureRatio > 0
      ? calibration.pressureRatio
      : lastSubjectivePressure / Math.max(MIN_REFERENCE_TASK_LOAD, rawPressureAtCalibration);
  const calibratedAt = calibration?.calibratedAt || calibration?.capturedAt || new Date().toISOString();

  return {
    lastSubjectivePressure,
    rawPressureAtCalibration: roundToTenth(rawPressureAtCalibration),
    pressureCoefficient: roundToFourDecimals(pressureCoefficient),
    calibratedAt,
    taskSnapshotAtCalibration: Array.isArray(calibration?.taskSnapshotAtCalibration) ? calibration.taskSnapshotAtCalibration : [],
    modelVersion: calibration?.modelVersion || 'importance-urgency-v1',
    modelWeights: calibration?.modelWeights,
    referencePressure: lastSubjectivePressure,
    referenceTaskLoad: roundToTenth(rawPressureAtCalibration),
    pressureRatio: roundToFourDecimals(pressureCoefficient),
    taskCount: typeof calibration?.taskCount === 'number' ? Math.max(0, calibration.taskCount) : Array.isArray(calibration?.taskSnapshotAtCalibration) ? calibration.taskSnapshotAtCalibration.length : 0,
    capturedAt: calibratedAt,
    note: calibration?.note || 'Migrated pressure calibration. Subjective pressure is treated as a calibration sample for the current raw task pressure.',
  };
}

export function calculatePressureIndex(tasks: Task[], calibration?: Partial<PressureCalibrationSnapshot> | null, legacyReferencePressure = 35, now = new Date()): PressureBreakdown {
  const normalizedCalibration = normalizePressureCalibration(calibration, legacyReferencePressure);
  const currentTaskLoad = calculateTaskLoad(tasks, now);
  const recoveryRelief = calculateRecoveryRelief(tasks);
  const rawPressure = calculateRealtimePressure(tasks, normalizedCalibration.pressureCoefficient, recoveryRelief, now);
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
    referencePressure: normalizedCalibration.lastSubjectivePressure,
    referenceTaskLoad: normalizedCalibration.rawPressureAtCalibration,
    pressureRatio: normalizedCalibration.pressureCoefficient,
    currentTaskLoad: roundToTenth(currentTaskLoad),
    recoveryRelief: roundToTenth(recoveryRelief),
    rawPressure: roundedRawPressure,
    displayPressure: state === 'burnout' ? roundedRawPressure : Math.min(10, roundedRawPressure),
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
  { id: 'first-entry', title: '初见', description: '你第一次把生活压力放进 VD。系统开始记住你如何活着。' },
  { id: 'first-task-completed', title: '闭环', description: '一件事被完成。不是胜利，只是一个回路终于合上。' },
  { id: 'first-manageable-pressure', title: '首次校准', description: '你承认了此刻的压力，并让系统重新贴近真实体感。' },
  { id: 'ai-first-connection', title: '流水线', description: '外部模型接入。你的任务开始进入另一条认知流水线。' },
  { id: 'ai-report-generated', title: '第三人称', description: '你第一次从旁观者视角看见自己的任务结构。' },
  { id: 'roadmap-generated', title: '为您导航', description: '长期目标获得路线。方向不等于命运，但至少不再是一团雾。' },
  { id: 'social-graph-opened', title: '我爱的人们', description: '你打开关系图谱，把那些重要的人从记忆噪声里重新标出来。' },
  { id: 'life-tree-opened', title: '系统已启动', description: '你进入人生结构视图。VD 开始像系统一样观察你的生活。' },
  { id: 'first-six-in-day', title: '六发左轮', description: '同一天连续闭环 6 件事。效率有时像武器，也像风险。' },
  { id: 'seven-day-streak', title: '七日杀', description: '你连续 7 天回到 VD。习惯开始留下可追踪的痕迹。' },
  { id: 'first-low-value-abandoned', title: '断舍离', description: '你主动放弃低价值事项，为真正重要的任务释放空间。' },
  { id: 'last-survivor', title: '最后生还者', description: '你在最后一小时内完成了高重要性任务。活下来了，但系统记住了这次贴线。' },
  { id: 'knife-edge-streak', title: '刀尖舔血', description: '连续 10 次在最后一小时闭环。你不是在管理时间，你是在和时间互相威胁。' },
  { id: 'rotting', title: '摆烂', description: '逾期任务超过 5 个。系统不审判，只记录这段坍缩。' },
  { id: 'hedonism', title: '享乐主义', description: '娱乐型事项达到 5 个。恢复、逃避和快乐有时长得很像。' },
  { id: 'pressure-cooker', title: '高压锅', description: '压力连续 3 天停留在 100 以上。你需要的可能不是更努力，而是泄压阀。' },
];
