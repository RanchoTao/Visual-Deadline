import { calculateRawPressure, calculateRealtimePressure, calculateTaskPressure, calculateUrgency, calibratePressure } from '../lib/pressureEngine';
import type { ActivityType, AchievementCategory, AchievementDefinition, Importance, LifecycleStatus, PressureBreakdown, PressureCalibrationSnapshot, PressureState, Task } from '../types/task';

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
  if (rawPressure > 100) return 'burnout';
  if (rawPressure >= 81) return 'overload';
  if (rawPressure >= 61) return 'high';
  if (rawPressure >= 31) return 'manageable';
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
  if (Array.isArray(sourceTasksOrRawPressure)) return calibratePressure(sourceTasksOrRawPressure, clampPressure(referencePressure), capturedAt);

  const safeReferencePressure = clampPressure(referencePressure);
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
    note: 'subjective pressure calibrates the current raw task pressure: realtimePressure = currentRawPressure × pressureCoefficient.',
  };
}

export function normalizePressureCalibration(calibration?: Partial<PressureCalibrationSnapshot> | null, legacyReferencePressure = 35): PressureCalibrationSnapshot {
  const legacyCalibration = calibration as Partial<PressureCalibrationSnapshot> & { baselinePressure?: number; initialTotalTaskLoad?: number } | null | undefined;
  const lastSubjectivePressure = clampPressure(calibration?.lastSubjectivePressure ?? calibration?.referencePressure ?? legacyCalibration?.baselinePressure ?? legacyReferencePressure);
  const storedRawPressure = calibration?.rawPressureAtCalibration ?? calibration?.referenceTaskLoad ?? legacyCalibration?.initialTotalTaskLoad;
  const rawPressureAtCalibration = typeof storedRawPressure === 'number' && Number.isFinite(storedRawPressure) ? Math.max(0, storedRawPressure) : Math.max(MIN_REFERENCE_TASK_LOAD, lastSubjectivePressure / DEFAULT_PRESSURE_RATIO);
  const pressureCoefficient = typeof calibration?.pressureCoefficient === 'number' && Number.isFinite(calibration.pressureCoefficient) && calibration.pressureCoefficient >= 0
    ? calibration.pressureCoefficient
    : typeof calibration?.pressureRatio === 'number' && Number.isFinite(calibration.pressureRatio) && calibration.pressureRatio >= 0
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
    burnout: '压力爆表 / 燃尽风险',
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

const defaultHiddenNarrativeTone = '系统冷静命名这一段生命状态。';

function defineAchievement(id: string, title: string, shortDescription: string, unlockCondition: string, category: AchievementCategory): AchievementDefinition {
  return {
    id,
    title,
    shortDescription,
    description: shortDescription,
    unlockCondition,
    category,
    hiddenNarrativeTone: defaultHiddenNarrativeTone,
    unlockTime: undefined,
    rarityLevel: undefined,
    relatedStats: [],
  };
}

export const achievementCatalog: AchievementDefinition[] = [
  defineAchievement('first-entry', '初见', '第一次来到可视。', '第一次使用VD', 'system-initialization'),
  defineAchievement('first-task-completed', '闭环', '从开始到完成，你实现了闭环。', '第一次完成任务', 'execution-efficiency'),
  defineAchievement('first-manageable-pressure', '首次校准', '你看到了自己真实的压力，系统也看到了你。', '第一次校准压力', 'pressure-mental-state'),
  defineAchievement('ai-first-connection', '流水线', '现在是AI时代，带上你的API，我们走！', '第一次接入API KEY', 'system-initialization'),
  defineAchievement('second-calibration', '回正', '第二次校准后，你知道自己在哪。', '第二次校准压力', 'pressure-mental-state'),
  defineAchievement('ai-report-generated', '第三人称', '第一次从旁观者视角看见自己的任务结构。', '第一次产生AI分析报告', 'philosophy-worldview'),
  defineAchievement('roadmap-generated', '为您导航', '系统开始尝试理解你的长期路线。', '第一次使用“长期目标”制定路线图', 'life-milestones'),
  defineAchievement('social-graph-opened', '我爱的人们', '你们对我很重要。', '第一次在社交中新增联系人', 'social-relationships'),
  defineAchievement('life-tree-opened', '系统已启动', '现在，你拥有自己的“系统”了。', '首次打开人生页面', 'system-initialization'),
  defineAchievement('first-six-in-day', '六发左轮', '弹无虚发。', '同一天内完成六件任务', 'execution-efficiency'),
  defineAchievement('seven-day-streak', '七日杀', '上帝创造世界用了七天。', '连续使用七天VD', 'system-initialization'),
  defineAchievement('first-low-value-abandoned', '断舍离', '当断不断，反受其乱。', '第一次放弃任务', 'philosophy-worldview'),
  defineAchievement('last-survivor', '最后生还者', '你挑战了极限，并且活下来了。', '在高重要程度任务截止前最后一小时完成。', 'pressure-mental-state'),
  defineAchievement('knife-edge-streak', '刀尖舔血', '你不是在管理时间，你是在和时间相互威胁。', '连续十次在最后一小时内完成任务', 'pressure-mental-state'),
  defineAchievement('rotting', '摆烂', '那还说啥了，摆就完事儿了！', '逾期任务超过五个', 'pressure-mental-state'),
  defineAchievement('hedonism', '享乐主义', '能活一天是一天！不死就是玩！', '娱乐事项大于等于五个', 'philosophy-worldview'),
  defineAchievement('pressure-cooker', '高压锅', '你需要的可能不是更努力，而是泄压阀。', '压力连续三天停留在100以上', 'pressure-mental-state'),
  defineAchievement('beijing-four-am', '凌晨四点的北京', '你见过凌晨四点的北京吗？', '学习/工作到凌晨四点', 'execution-efficiency'),
  defineAchievement('top-of-the-world', '世界之巅', 'I am the King of the world!', '登上珠穆朗玛峰', 'life-milestones'),
  defineAchievement('end-of-the-world', '世界尽头', '极寒的白色荒漠。', '来到南极', 'life-milestones'),
  defineAchievement('speed-of-life', '生死时速', '速度与激情！', '陆地移动速度超过300km/h', 'life-milestones'),
  defineAchievement('hello-world', '你好，世界！', 'Hello, world!', '首次敲下 hello world 代码', 'abstract-easter-eggs'),
  defineAchievement('sharp-head', '你头顶怎么尖尖的？', '健美圈传来噩耗...', '使用类固醇', 'physical-biological'),
  defineAchievement('heaven-on-earth', '天上人间', '这个美啊~', '第一次去洗浴中心', 'life-milestones'),
  defineAchievement('tropical-iced-tea', '热带风味冰红茶', '时序逻辑。', '第一次经历期末周', 'abstract-easter-eggs'),
  defineAchievement('iced-coke', '冰镇可乐', '方程式的解，世界的顶点，生命的答案。', '第一次喝冰镇铝罐可口可乐', 'philosophy-worldview'),
  defineAchievement('first-million', '第一桶金', '认知与财富对等。', '个人流动资产 ≥ 100万', 'finance-survival'),
  defineAchievement('snowball', '滚雪球', '利滚利滚利滚利~', '连续十二个月正收益', 'finance-survival'),
  defineAchievement('system-overload', '系统过载', 'WARNING！！！', '压力值首次超过100', 'pressure-mental-state'),
  defineAchievement('left-on-read', '已读不回', '搁浅的爱。', 'Read messages from an object with favorability > 80 and do not reply for 24 hours.', 'social-relationships'),
  defineAchievement('fantasy-time', '幻想时间', '现在是，幻想时间！', 'Create more than 20 new tasks within one day.', 'execution-efficiency'),
  defineAchievement('nice-guy-card', '好人卡', 'What can I say？', 'First time being told “你是一个好人”.', 'social-relationships'),
  defineAchievement('peach-blossom-season', '桃花期', '难道她喜欢我？', 'Continuously meet five new opposite-sex people of similar age within a short cycle.', 'social-relationships'),
  defineAchievement('world-line-convergence', '世界线收束', '一切都是命运石之门的选择。', 'First time completing a long-term goal.', 'life-milestones'),
  defineAchievement('young-and-accomplished', '年少有为', '假如我年少有为不自卑。', 'Achieve major fame or elite accomplishment before age 20 (example: olympiad gold medal / top national examination ranking).', 'life-milestones'),
  defineAchievement('long-termist', '长期主义者', '时间会替你说话。', 'Remain continuously focused on the same field for ten years.', 'philosophy-worldview'),
  defineAchievement('around-the-world', '环游世界', '行万里路。', 'Travel across major regions of the world and visit globally recognized countries.', 'life-milestones'),
  defineAchievement('genius', '天才', '百分之一的灵感和百分之九十九的汗水。', 'Create breakthrough-level achievement in a field recognized by society.', 'philosophy-worldview'),
  defineAchievement('fortune-scattered', '千金散尽', '烹羊宰牛且为乐，会须一饮三百杯。', 'Spend more than one million in a single day.', 'finance-survival'),
  defineAchievement('one-in-ten-thousand', '万里挑一', '谁还不是个状元？', 'Reach top 0.01% ranking in major examinations.', 'life-milestones'),
  defineAchievement('unrecognized-talent', '怀才不遇', '被贬了，该写诗。', 'Long-term capability level significantly exceeds current social status or outcome.', 'pressure-mental-state'),
  defineAchievement('abstract-school', '抽象派', '著名行为艺术家。', 'Record behavior significantly deviating from common social logic (example: washing hair upside down).', 'abstract-easter-eggs'),
  defineAchievement('lifeline', '生命线', '生命的脆弱。', 'First ICU hospitalization experience.', 'physical-biological'),
  defineAchievement('infinite-progress', '无限进步', '你还在向上。', 'Achieve major self-growth during every important life stage transition.', 'philosophy-worldview'),
  defineAchievement('forbidden-fruit', '偷食禁果', '禁忌。', 'First sexual experience.', 'physical-biological'),
  defineAchievement('safety-measures', '安全措施', '注意安全。', 'First accidental pregnancy event.', 'physical-biological'),
  defineAchievement('unattainable-love', '爱而不得', '差一点。', 'First long-term unrequited love experience.', 'social-relationships'),
  defineAchievement('brief-romance', '露水情缘', '短暂地拥有过彼此。', 'First short-term romantic relationship.', 'social-relationships'),
  defineAchievement('finding-self', '找自己', '你终于开始回头看自己。', 'First complete life review / self-history reflection.', 'philosophy-worldview'),
  defineAchievement('laws-of-the-world', '世界运行的规律', '牛顿看见了苹果落下。', 'First systematic study of classical mechanics.', 'philosophy-worldview'),
  defineAchievement('electricity-and-magnetism', '电与磁', '世界开始被统一。', 'First study of electromagnetism and Maxwell equations.', 'philosophy-worldview'),
  defineAchievement('days-and-months-fly', '日月如梭', '人类用钟表丈量生命。', 'Use VD continuously for 365 days.', 'system-initialization'),
  defineAchievement('final-meeting', '最后一面', '有些见面，真的会是最后一次。', 'First experience facing the death of another important person.', 'social-relationships'),
];
