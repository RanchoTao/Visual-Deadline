import type { LifeControllerPlan, LifeControllerPlannerInput, LifePlanItem } from '../../types/lifeController.js';
import { formatDurationMinutes, getZonedClockMinutes, parseClockMinutes } from './time.js';

function item(input: Omit<LifePlanItem, 'id'>): LifePlanItem {
  return { id: `${input.urgency}-${input.kind}`, ...input };
}

function isInSleepWindow(currentMinutes: number, sleepMinutes: number, wakeMinutes: number): boolean {
  return sleepMinutes > wakeMinutes
    ? currentMinutes >= sleepMinutes || currentMinutes < wakeMinutes
    : currentMinutes >= sleepMinutes && currentMinutes < wakeMinutes;
}

export function planLifeController({ currentTime, lifeState, lifePreferences }: LifeControllerPlannerInput): LifeControllerPlan {
  const notices: string[] = [];
  const next: LifePlanItem[] = [];
  const later: LifePlanItem[] = [];
  const currentMinutes = getZonedClockMinutes(currentTime, lifePreferences.timezone);
  const sleepMinutes = parseClockMinutes(lifePreferences.preferredSleepTime) ?? 23 * 60 + 30;
  const wakeMinutes = parseClockMinutes(lifePreferences.preferredWakeTime) ?? 7 * 60 + 30;

  if (lifeState.warnings.length > 0) notices.push('部分重复或时间异常的记录未参与状态切换。');

  if (lifeState.currentSleepState === 'sleeping') {
    later.push(item({ kind: 'wake', title: '起床目标', detail: `目标睡眠 ${formatDurationMinutes(lifePreferences.targetSleepDurationMinutes)}`, urgency: 'later', scheduledLocalTime: lifePreferences.preferredWakeTime, actionEventType: 'wake' }));
    return {
      stateSummary: '当前已记录为睡眠中。',
      now: item({ kind: 'state', title: '正在睡眠', detail: '睡眠期间不安排工作任务。起床后记录一次即可恢复规划。', urgency: 'now' }),
      next,
      later,
      notices,
    };
  }

  if (lifeState.currentSleepState === 'unknown') {
    notices.push('睡眠状态未知；记录一次起床或睡觉后，系统才会开始计算清醒时长。');
    return {
      stateSummary: '当前睡眠状态未知。',
      now: null,
      next,
      later: [item({ kind: 'state', title: '建立状态基线', detail: '下一次起床或睡觉时完成一次快捷记录。', urgency: 'later' })],
      notices,
    };
  }

  let now: LifePlanItem | null = null;
  const sinceMeal = lifeState.timeSinceLastMealMinutes;
  if (sinceMeal !== null && sinceMeal >= lifePreferences.mealIntervalMaxMinutes) {
    now = item({ kind: 'meal', title: '吃饭', detail: `距上次进食已 ${formatDurationMinutes(sinceMeal)}，已超过你的默认进食间隔。`, urgency: 'now', actionEventType: 'meal' });
  } else if (sinceMeal !== null && sinceMeal >= lifePreferences.mealIntervalMinMinutes) {
    next.push(item({ kind: 'meal', title: '准备下一次进食', detail: `距上次进食 ${formatDurationMinutes(sinceMeal)}。`, urgency: 'next', actionEventType: 'meal' }));
  } else if (sinceMeal === null) {
    notices.push('尚无进食记录，因此不会推断你现在需要吃饭。');
  }

  const bedtimeDue = isInSleepWindow(currentMinutes, sleepMinutes, wakeMinutes);
  if (bedtimeDue && !now) {
    now = item({ kind: 'sleep', title: '准备睡觉', detail: `当前已进入默认睡眠时段（${lifePreferences.preferredSleepTime} 后）。`, urgency: 'now', scheduledLocalTime: lifePreferences.preferredSleepTime, actionEventType: 'sleep_start' });
  } else if (!bedtimeDue) {
    next.push(item({ kind: 'sleep', title: '准备睡觉', detail: '按当前默认作息进入睡前阶段。', urgency: 'next', scheduledLocalTime: lifePreferences.preferredSleepTime, actionEventType: 'sleep_start' }));
  } else if (now?.kind === 'meal') {
    later.push(item({ kind: 'sleep', title: '随后准备睡觉', detail: '当前已进入默认睡眠时段。', urgency: 'later', scheduledLocalTime: lifePreferences.preferredSleepTime, actionEventType: 'sleep_start' }));
  }

  later.push(item({ kind: 'wake', title: '明早起床目标', detail: `目标睡眠 ${formatDurationMinutes(lifePreferences.targetSleepDurationMinutes)}`, urgency: 'later', scheduledLocalTime: lifePreferences.preferredWakeTime, actionEventType: 'wake' }));

  return {
    stateSummary: `清醒 ${formatDurationMinutes(lifeState.awakeDurationMinutes)}。`,
    now,
    next: next.slice(0, 3),
    later: later.slice(0, 5),
    notices,
  };
}
