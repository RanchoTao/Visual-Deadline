import type { MatrixGroups, QuadrantKey, Task } from '../types/task';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function getUrgencyScore(deadline?: string, now = new Date()): number {
  if (!deadline) return 0;

  const deadlineTime = new Date(deadline).getTime();
  if (Number.isNaN(deadlineTime)) return 0;

  const diff = deadlineTime - now.getTime();

  if (diff < 0) return 50;
  if (diff <= MS_PER_DAY) return 40;
  if (diff <= 3 * MS_PER_DAY) return 30;
  if (diff <= 7 * MS_PER_DAY) return 20;
  return 10;
}

export function getTaskScore(task: Task, now = new Date()): number {
  return task.importance * 10 + getUrgencyScore(task.deadline, now);
}

export function getRecommendedTask(tasks: Task[], now = new Date()): Task | undefined {
  return tasks
    .filter((task) => task.status !== 'done')
    .sort((a, b) => getTaskScore(b, now) - getTaskScore(a, now))[0];
}

export function isTaskUrgent(task: Task, now = new Date()): boolean {
  return getUrgencyScore(task.deadline, now) >= 30;
}

export function isTaskImportant(task: Task): boolean {
  return task.importance >= 4;
}

export function getQuadrantKey(task: Task, now = new Date()): QuadrantKey {
  const important = isTaskImportant(task);
  const urgent = isTaskUrgent(task, now);

  if (important && urgent) return 'importantUrgent';
  if (important && !urgent) return 'importantNotUrgent';
  if (!important && urgent) return 'notImportantUrgent';
  return 'notImportantNotUrgent';
}

export function groupTasksByMatrix(tasks: Task[], now = new Date()): MatrixGroups {
  const groups: MatrixGroups = {
    importantUrgent: [],
    importantNotUrgent: [],
    notImportantUrgent: [],
    notImportantNotUrgent: [],
  };

  tasks
    .filter((task) => task.status !== 'done')
    .forEach((task) => {
      groups[getQuadrantKey(task, now)].push(task);
    });

  Object.values(groups).forEach((group) => {
    group.sort((a, b) => getTaskScore(b, now) - getTaskScore(a, now));
  });

  return groups;
}
