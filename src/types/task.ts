export type TaskStatus = 'todo' | 'doing' | 'done';

export interface Task {
  id: string;
  title: string;
  description?: string;
  importance: 1 | 2 | 3 | 4 | 5;
  deadline?: string;
  estimatedMinutes?: number;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

export type QuadrantKey =
  | 'importantUrgent'
  | 'importantNotUrgent'
  | 'notImportantUrgent'
  | 'notImportantNotUrgent';

export type MatrixGroups = Record<QuadrantKey, Task[]>;
