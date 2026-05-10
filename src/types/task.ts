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
  schemaVersion: 3;
  createdAt: string;
  updatedAt: string;
}

export type TaskInput = Omit<Task, 'id' | 'schemaVersion' | 'createdAt' | 'updatedAt' | 'completedAt' | 'abandonedAt'>;
