export type ExecutionStatus = 'ready' | 'in_progress' | 'done' | 'cancelled' | 'deferred';
export type ExecutionSource = 'manual' | 'text' | 'voice' | 'image' | 'document' | 'ai' | 'review' | 'demo' | 'legacy' | 'legacy-vd';

export interface ExecutionProject {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  deadline?: string;
  importance: number;
  status: 'active' | 'completed' | 'paused';
  sourceCaptureId?: string;
}

/** Persistence-neutral task contract shared by ranking, capture, review and adapters. */
export interface ExecutionTask {
  id: string;
  title: string;
  description?: string;
  projectId?: string;
  goalIds: string[];
  parentTaskId?: string;
  createdAt: string;
  deadline?: string;
  startAfter?: string;
  importance: number;
  estimatedMinutes?: number;
  completedMinutes?: number;
  progress: number;
  status: ExecutionStatus;
  actionable: boolean;
  dependencies: string[];
  source: ExecutionSource;
  sourceCaptureId?: string;
  createdByAI: boolean;
  completedAt?: string;
}

export interface ExecutionSuggestion {
  title: string;
  description?: string;
  importance: number;
  estimatedMinutes?: number;
  actionable: boolean;
  dependsOnIndexes?: number[];
}

export interface ExecutionCaptureResult {
  title: string;
  description?: string;
  deadline?: string;
  importance?: number;
  estimatedDuration?: number;
  actionable: boolean;
  suggestedTasks: ExecutionSuggestion[];
}

export interface ExecutionCapture {
  id: string;
  inputType: Extract<ExecutionSource, 'text' | 'voice' | 'image' | 'document'>;
  result: ExecutionCaptureResult;
}

export interface ExecutionReviewSuggestion {
  id: string;
  title: string;
  reason: string;
  projectId?: string;
  estimateMultiplier?: number;
  status: 'pending' | 'applied' | 'dismissed';
}

export interface ExecutionReviewStatistics {
  plannedTasks: number;
  completedTasks: number;
  completionRate: number;
  deferredTasks: number;
  cancelledTasks: number;
  newTasks: number;
  biggestProgressProject?: string;
  mostDeferredProject?: string;
  estimateVarianceMinutes?: number;
}
