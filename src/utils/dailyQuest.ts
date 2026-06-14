import type { DailyQuest, DailyQuestItem, DailyQuestItemType, DailyReview, Importance, Task } from '../types/task';

const MAX_BY_TYPE: Record<DailyQuestItemType, number> = { main: 3, daily: 3, side: 2, recovery: 1 };
const SAFE_RECOVERY_ITEM: DailyQuestItem = {
  id: 'recovery-breathing-10',
  title: '恢复任务：整理状态 10 分钟',
  type: 'recovery',
  currentValue: 0,
  targetValue: 10,
  unit: 'min',
  status: 'todo',
  priority: 4,
  estimatedMinutes: 10,
  successCriteria: '完成 10 分钟低强度整理、散步或呼吸练习，不做身体惩罚或熬夜补偿。',
};

function getDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function deadlineTime(task: Task): number {
  if (!task.deadline) return Number.POSITIVE_INFINITY;
  const time = new Date(task.deadline).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function classifyTask(task: Task): DailyQuestItemType {
  if (task.activityType === 'recovery') return 'recovery';
  if (task.importance >= 8 || deadlineTime(task) - Date.now() < 3 * 24 * 60 * 60 * 1000) return 'main';
  if (['study', 'fitness', 'exercise', 'work'].includes(task.activityType)) return 'daily';
  return 'side';
}

function safeEstimatedMinutes(task: Task): number {
  const raw = task.estimatedDuration && task.estimatedDuration > 0 ? task.estimatedDuration : task.importance >= 8 ? 60 : 30;
  return Math.min(90, Math.max(30, Math.round(raw)));
}

function toQuestItem(task: Task, carried = false): DailyQuestItem {
  const estimatedMinutes = safeEstimatedMinutes(task);
  return {
    id: `${carried ? 'carried' : 'quest'}-${task.id}-${estimatedMinutes}`,
    title: `${carried ? '延续：' : ''}${task.title}`,
    type: classifyTask(task),
    currentValue: 0,
    targetValue: estimatedMinutes,
    unit: 'min',
    status: carried ? 'carried' : 'todo',
    priority: task.importance as Importance,
    estimatedMinutes,
    sourceTaskId: task.id,
    successCriteria: `专注推进 ${estimatedMinutes} 分钟，并记录一个可验证进展。`,
  };
}

function completionHint(previousReview?: DailyReview): { main: number; daily: number; side: number; recovery: number } {
  if (!previousReview || previousReview.completionRate >= 50) return MAX_BY_TYPE;
  return { main: 2, daily: 2, side: 1, recovery: 1 };
}

function buildCorrection(items: DailyQuestItem[], previousReview?: DailyReview) {
  const carriedItems = previousReview?.nextDayAdjustment ?? [];
  const lowCompletion = previousReview ? previousReview.completionRate < 50 : false;
  const highCompletion = previousReview ? previousReview.completionRate >= 80 : false;
  const unfinished = items.filter((item) => item.status !== 'done');
  return {
    triggered: carriedItems.length > 0 || lowCompletion,
    message: carriedItems.length > 0
      ? '系统矫正已触发：明日将优先处理未完成任务。'
      : lowCompletion
        ? '连续未完成任务较多，建议降低任务强度。'
        : highCompletion
          ? '连续完成良好，任务等级可适度提升。'
          : '今日任务未完成，系统将进行明日重排。',
    nextDayAdjustment: unfinished.slice(0, 4).map((item) => ({ ...item, status: 'carried' as const, targetValue: Math.min(item.targetValue, 45), estimatedMinutes: Math.min(item.estimatedMinutes, 45), successCriteria: `${item.title} 拆小执行 30–45 分钟，完成后记录一个明确结果。` })),
    intensityHint: lowCompletion ? '今日已降低新增任务数量，优先保留关键未完成任务。' : highCompletion ? '保持当前节奏，可在明日小幅提高主线任务等级。' : undefined,
  };
}

export function generateDailyQuest(tasks: Task[], previousReview?: DailyReview): DailyQuest {
  const today = getDateKey();
  const limits = completionHint(previousReview);
  const selected: DailyQuestItem[] = [];
  const counts: Record<DailyQuestItemType, number> = { main: 0, daily: 0, side: 0, recovery: 0 };

  (previousReview?.nextDayAdjustment ?? []).forEach((item) => {
    if (counts[item.type] < limits[item.type]) {
      selected.push({ ...item, id: `adjusted-${item.id}`, status: 'carried', targetValue: Math.min(item.targetValue, 45), estimatedMinutes: Math.min(item.estimatedMinutes, 45) });
      counts[item.type] += 1;
    }
  });

  tasks
    .filter((task) => task.lifecycleStatus === 'active' && task.progress < 100)
    .sort((left, right) => deadlineTime(left) - deadlineTime(right) || right.importance - left.importance || left.progress - right.progress)
    .forEach((task) => {
      const item = toQuestItem(task);
      if (selected.some((candidate) => candidate.sourceTaskId === item.sourceTaskId)) return;
      if (counts[item.type] >= limits[item.type]) return;
      selected.push(item);
      counts[item.type] += 1;
    });

  if (counts.recovery < limits.recovery) selected.push({ ...SAFE_RECOVERY_ITEM, id: `${SAFE_RECOVERY_ITEM.id}-${today}` });

  const totalMinutes = selected.reduce((sum, item) => sum + item.estimatedMinutes, 0);
  const difficulty: DailyQuest['difficulty'] = totalMinutes >= 240 ? '高' : totalMinutes >= 120 ? '中' : '低';
  const completionRate = selected.length === 0 ? 0 : Math.round((selected.filter((item) => item.status === 'done').length / selected.length) * 100);

  return {
    id: `daily-quest-${today}`,
    date: today,
    title: '今日任务：为成为强者做准备',
    summary: `已生成 ${selected.length} 个今日执行单元，优先处理截止临近与高重要性任务。`,
    difficulty,
    completionRate,
    items: selected,
    systemCorrection: buildCorrection(selected, previousReview),
  };
}

export function createDailyReviewFromQuest(quest: DailyQuest, userNote = ''): DailyReview {
  const completedCount = quest.items.filter((item) => item.status === 'done').length;
  const totalCount = quest.items.length;
  const completionRate = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  return {
    id: `daily-review-${quest.date}`,
    date: quest.date,
    completedCount,
    totalCount,
    completionRate,
    userNote,
    aiSummary: '本地复盘已生成：系统将根据完成率与未完成任务进行明日重排。',
    nextDayAdjustment: quest.items.filter((item) => item.status !== 'done'),
  };
}
