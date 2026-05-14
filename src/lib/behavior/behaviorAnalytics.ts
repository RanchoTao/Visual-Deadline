import type { Task } from '../../types/task';
import { calculateCompletionRate, calculateLastMinuteCompletionRatio, countOverdueTasks } from '../analytics/lifeStats';

export type BehavioralState = {
  procrastinationTendency: string;
  executionConsistency: string;
  urgencyDependence: string;
  burstProductivityTendency: string;
  currentState: string;
};

export function analyzeBehavior(tasks: Task[]): BehavioralState {
  const lastMinuteRatio = calculateLastMinuteCompletionRatio(tasks);
  const completionRate = calculateCompletionRate(tasks);
  const overdueCount = countOverdueTasks(tasks);
  const completedCount = tasks.filter((task) => task.lifecycleStatus === 'completed').length;

  return {
    procrastinationTendency: lastMinuteRatio >= 35 || overdueCount > 3 ? '明显' : lastMinuteRatio >= 15 ? '存在' : '较低',
    executionConsistency: completionRate >= 75 ? '稳定' : completionRate >= 45 ? '波动' : '偏弱',
    urgencyDependence: lastMinuteRatio >= 30 ? '高' : lastMinuteRatio >= 10 ? '中' : '低',
    burstProductivityTendency: completedCount >= 6 ? '可见' : '样本不足',
    currentState: overdueCount > 5 ? '高压-摆烂循环风险' : lastMinuteRatio >= 30 ? '截止压力驱动' : completionRate >= 70 ? '稳定推进' : '观察期',
  };
}
