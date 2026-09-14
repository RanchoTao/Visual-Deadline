import type { ExecutionProject, ExecutionTask } from './types.js';

export interface LegacyWorkspaceTask { id: string; title: string; description?: string; start?: string; end?: string; priority: 'critical' | 'high' | 'medium' | 'low'; estimatedHours: number; completedHours: number; progress: number; status: 'todo' | 'in_progress' | 'done' | 'cancelled' | 'deferred'; dependencies: string[]; }
export interface LegacyWorkspaceProject { id: string; title: string; description?: string; createdAt: string; deadline?: string; status: 'active' | 'completed' | 'paused'; source?: 'demo' | 'agent' | 'manual'; tasks: LegacyWorkspaceTask[]; }
const importanceOf = (task: LegacyWorkspaceTask) => task.priority === 'critical' ? 10 : task.priority === 'high' ? 8 : task.priority === 'medium' ? 6 : 3;

/** Exact field conversion used by Wayline's vd-workspace-v1 reader, without storage I/O. */
export function migrateLegacyWorkspaceProject(project: LegacyWorkspaceProject): { projects: ExecutionProject[]; tasks: ExecutionTask[] } {
  const migratedProject: ExecutionProject = { id: project.id, title: project.title, description: project.description, createdAt: project.createdAt, deadline: project.deadline, importance: project.tasks.some((task) => task.priority === 'critical') ? 10 : 8, status: project.status };
  return { projects: [migratedProject], tasks: project.tasks.map((task): ExecutionTask => ({ id: task.id, title: task.title, description: task.description, projectId: project.id, goalIds: [project.id], createdAt: project.createdAt, deadline: task.end || project.deadline, startAfter: task.start, importance: importanceOf(task), estimatedMinutes: Math.round(task.estimatedHours * 60), completedMinutes: Math.round(task.completedHours * 60), progress: Math.round(task.progress * 100), status: task.status === 'todo' ? 'ready' : task.status, actionable: true, dependencies: [...task.dependencies], source: project.source === 'demo' ? 'legacy-vd' : 'legacy-vd', createdByAI: project.source === 'agent', completedAt: task.status === 'done' ? task.end : undefined })) };
}
