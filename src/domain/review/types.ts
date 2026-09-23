export type ReviewWindowDays = 7 | 30 | 90;

export interface ReviewMetricsSnapshot {
  resolvedCount: number; completedCount: number; abandonedCount: number; completionRate?: number;
  completedWithDeadlineCount: number; onTimeCompletionCount: number; onTimeRate?: number;
  averageDeadlineDeltaHours?: number; lastHourCompletionCount: number;
  pressureSampleCount: number; averagePressure?: number; maxPressure?: number; pressureVolatility?: number; highPressureSampleCount: number;
  activeTaskCount: number; currentOverdueTaskCount: number;
  currentGoalCount: number; currentMilestoneCount: number; currentCompletedMilestoneCount: number;
  currentScheduledTaskCount: number; currentUnscheduledTaskCount: number; currentConflictCount: number;
}

export interface ReviewAIReport { content: string; generatedAt: string; model?: string; provider?: string; }
export interface ReviewRecord { id: string; windowDays: ReviewWindowDays; windowStart: string; windowEnd: string; title: string; userNote?: string; metrics: ReviewMetricsSnapshot; aiReport?: ReviewAIReport; createdAt: string; updatedAt: string; }
export interface ReviewState { schemaVersion: 1; defaultWindowDays: ReviewWindowDays; reviews: ReviewRecord[]; updatedAt: string; }
export type ReviewHistoryKind = 'task_completed' | 'task_abandoned' | 'milestone_completed' | 'review_saved' | 'ai_review_generated' | 'pressure_recalibrated' | 'legacy_ai';
export interface ReviewHistoryEvent { id: string; timestamp: string; kind: ReviewHistoryKind; title: string; description?: string; relatedTaskId?: string; relatedGoalId?: string; reviewId?: string; }
export interface ReviewDailyTrend { date: string; completedCount: number; abandonedCount: number; averagePressure?: number; maxPressure?: number; }
