export type Importance = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type ActivityType = 'task' | 'schedule' | 'entertainment' | 'recovery' | 'study' | 'research' | 'fitness' | 'exercise' | 'work' | 'life' | 'social' | 'other';

export type LifecycleStatus = 'active' | 'completed' | 'abandoned';

export type ProgressMode = 'manual' | 'auto';

export interface Task {
  id: string;
  title: string;
  description?: string;
  importance: Importance;
  deadline?: string;
  progress: number;
  taskProgress?: number;
  timeProgress?: number;
  estimatedDuration?: number;
  progressMode?: ProgressMode;
  decomposition?: string[];
  stages?: string[];
  milestoneSuggestions?: string[];
  linkedGoalIds?: string[];
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

export interface PressureTaskSnapshot {
  taskId: string;
  title: string;
  importance: number;
  deadline?: string;
  activityType: ActivityType;
  lifecycleStatus: LifecycleStatus;
  urgencyWeight: number;
  taskPressure: number;
}

export interface PressureModelWeightsSnapshot {
  importanceWeight: number;
  urgencyWeight: number;
  interactionWeight: number;
}

export interface PressureCalibrationSnapshot {
  lastSubjectivePressure: number;
  rawPressureAtCalibration: number;
  pressureCoefficient: number;
  calibratedAt: string;
  taskSnapshotAtCalibration: PressureTaskSnapshot[];
  modelVersion?: string;
  modelWeights?: PressureModelWeightsSnapshot;
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

export type AchievementCategory =
  | 'system-initialization'
  | 'execution-efficiency'
  | 'pressure-mental-state'
  | 'social-relationships'
  | 'finance-survival'
  | 'life-milestones'
  | 'physical-biological'
  | 'philosophy-worldview'
  | 'abstract-easter-eggs';

export interface AchievementDefinition {
  id: string;
  title: string;
  shortDescription: string;
  description: string;
  unlockCondition: string;
  category: AchievementCategory;
  hiddenNarrativeTone: string;
  unlockTime?: string;
  rarityLevel?: string;
  relatedStats?: string[];
}

export interface Achievement extends AchievementDefinition {
  unlockedAt: string;
}

export type AIArtifactKind = 'task-analysis' | 'review' | 'goal-roadmap' | 'task-intake' | 'pressure-analysis' | 'recommendation';

export interface AIArtifact {
  id: string;
  kind: AIArtifactKind;
  title: string;
  content: string;
  createdAt: string;
  relatedTaskIds: string[];
  relatedGoalIds: string[];
  pressure?: number;
  model?: string;
  metadata?: Record<string, string | number | boolean | string[]>;
}

export type AIArtifactInput = Omit<AIArtifact, 'id' | 'createdAt'> & { createdAt?: string };

export interface Goal {
  id: string;
  title: string;
  targetDate?: string;
  category: ActivityType;
  priority: Importance;
  linkedTaskIds: string[];
  roadmapSuggestions?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GoalInput {
  title: string;
  targetDate?: string;
  category: ActivityType;
  priority: Importance;
  linkedTaskIds?: string[];
  roadmapSuggestions?: string[];
}

export type LifeOSModule = 'home' | 'task' | 'map' | 'social' | 'log' | 'me';

export interface UserProfile {
  nickname: string;
  username: string;
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
  currentStage?: string;
  notes?: string;
  color?: string;
}

export interface SocialPersonData {
  name: string;
  relationshipType: string;
  subjectiveFavorability: string;
  familiarity: string;
  lastInteractionDate: string;
  notes: string;
  bio?: string;
  currentSocialState?: string;
  trust?: string;
  interactionFrequency?: string;
  emotionalCloseness?: string;
  influenceWeight?: string;
  roleCategory?: string;
  avatarInitial?: string;
  cluster?: string;
  manualPosition?: boolean;
  angle?: number;
  color?: string;
}
