export type Importance = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type ActivityType = 'task' | 'schedule' | 'entertainment' | 'recovery' | 'study' | 'fitness' | 'social' | 'other';

export type LifecycleStatus = 'active' | 'completed' | 'abandoned';

export interface Task {
  id: string;
  title: string;
  description?: string;
  importance: Importance;
  deadline?: string;
  progress: number;
  activityType: ActivityType;
  lifecycleStatus: LifecycleStatus;
  completedAt?: string;
  abandonedAt?: string;
  reviewNote?: string;
  schemaVersion: 3;
  createdAt: string;
  updatedAt: string;
}

export type TaskInput = Omit<Task, 'id' | 'schemaVersion' | 'createdAt' | 'updatedAt' | 'completedAt' | 'abandonedAt'>;

export type PressureState = 'steady' | 'manageable' | 'high' | 'overload' | 'burnout';

export interface PressureCalibrationSnapshot {
  referencePressure: number;
  referenceTaskLoad: number;
  pressureRatio: number;
  taskCount: number;
  capturedAt: string;
  note: string;
}


export type PressureHistoryEventType = 'auto' | 'task_created' | 'task_completed' | 'task_abandoned' | 'recalibration' | 'manual';

export interface PressureHistoryRecord {
  id: string;
  timestamp: string;
  pressure: number;
  currentTaskLoad: number;
  activeTaskCount: number;
  completedToday: number;
  abandonedToday: number;
  recoveryRelief: number;
  note?: string;
  eventType?: PressureHistoryEventType;
}

export interface PressureBreakdown {
  referencePressure: number;
  referenceTaskLoad: number;
  pressureRatio: number;
  currentTaskLoad: number;
  recoveryRelief: number;
  rawPressure: number;
  displayPressure: number;
  state: PressureState;
  label: string;
  recommendation: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlockedAt: string;
}

export type LifeOSModule = 'life-map' | 'vd' | 'social' | 'profile' | 'log';

export interface UserProfile {
  nickname: string;
  height: string;
  weight: string;
  identity: string;
  skills: string;
  longTermGoals: string;
  currentStage: string;
  avatarDataUrl?: string;
}

export interface LifeMapNodeData {
  title: string;
  description: string;
  color?: string;
}

export interface SocialPersonData {
  name: string;
  relationshipType: string;
  subjectiveFavorability: string;
  familiarity: string;
  lastInteractionDate: string;
  notes: string;
  color?: string;
}
