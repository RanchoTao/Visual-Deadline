export type ReviewWindowDays = 7 | 30 | 90;

export interface ReviewWindow {
  days: ReviewWindowDays;
  timezone: string;
  start: string;
  end: string;
  dateKeys: string[];
}

export interface ReviewMetricsSnapshot {
  resolvedCount: number; completedCount: number; abandonedCount: number; completionRate?: number;
  completedWithDeadlineCount: number; onTimeCompletionCount: number; onTimeRate?: number;
  averageDeadlineDeltaHours?: number; lastHourCompletionCount: number;
  pressureSampleCount: number; averagePressure?: number; maxPressure?: number; pressureVolatility?: number; highPressureSampleCount: number;
  activeTaskCount: number; currentOverdueTaskCount: number;
  currentGoalCount: number; currentMilestoneCount: number; currentCompletedMilestoneCount: number;
  currentScheduledTaskCount: number; currentUnscheduledTaskCount: number; currentConflictCount: number;
}

export interface ReviewAIReport { content: string; generatedAt: string; model?: string; provider?: string; inputFingerprint?: string; windowIdentity?: string; }
export interface ReviewRecord { id: string; windowDays: ReviewWindowDays; windowStart: string; windowEnd: string; title: string; userNote?: string; metrics: ReviewMetricsSnapshot; aiReport?: ReviewAIReport; createdAt: string; updatedAt: string; }
export type ReviewHistoryKind = 'task_completed' | 'task_abandoned' | 'milestone_completed' | 'review_saved' | 'ai_review_generated' | 'pressure_sample' | 'pressure_recalibrated' | 'legacy_ai';
export interface ReviewHistoryEvent {
  id: string; timestamp: string; recordedAt: string; kind: ReviewHistoryKind; title: string; entityTitle?: string; description?: string;
  relatedTaskId?: string; relatedGoalId?: string; reviewId?: string; deadline?: string; importance?: number; activityType?: string;
  pressure?: number; activeTaskCount?: number; pressureSource?: 'manual' | 'task_derived' | 'unknown';
}
export interface ReviewTombstone { id: string; deletedAt: string; }
export interface ReviewState { schemaVersion: 2; defaultWindowDays: ReviewWindowDays; reviews: ReviewRecord[]; events: ReviewHistoryEvent[]; reviewTombstones: ReviewTombstone[]; updatedAt: string; }
export interface ReviewDailyTrend { date: string; completedCount: number; abandonedCount: number; averagePressure?: number; maxPressure?: number; }
