export type Importance = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface Task {
  id: string;
  title: string;
  description?: string;
  importance: Importance;
  deadline?: string;
  progress: number;
  schemaVersion: 2;
  createdAt: string;
  updatedAt: string;
}

export type TaskInput = Omit<Task, 'id' | 'schemaVersion' | 'createdAt' | 'updatedAt'>;
