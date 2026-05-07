import type { Task, TaskStatus } from '../types/task';
import { formatDeadline } from '../utils/date';
import { getTaskScore } from '../utils/taskScoring';

interface TaskListProps {
  tasks: Task[];
  onDelete: (taskId: string) => void;
  onEdit: (task: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
}

const statusLabel: Record<TaskStatus, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
};

export function TaskList({ tasks, onDelete, onEdit, onStatusChange }: TaskListProps) {
  const visibleTasks = tasks.filter((task) => task.status !== 'done');

  return (
    <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">任务列表</p>
          <h2 className="text-2xl font-bold text-slate-950">未完成任务</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">{visibleTasks.length} 个</span>
      </div>

      {visibleTasks.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-200 p-8 text-center text-slate-500">暂无未完成任务。</div>
      ) : (
        <ul className="mt-5 space-y-3">
          {visibleTasks.map((task) => (
            <li key={task.id} className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-950">{task.title}</h3>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500">{statusLabel[task.status]}</span>
                  </div>
                  {task.description ? <p className="mt-2 text-sm text-slate-600">{task.description}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-white px-2.5 py-1">重要性 {task.importance}/5</span>
                    <span className="rounded-full bg-white px-2.5 py-1">{formatDeadline(task.deadline)}</span>
                    <span className="rounded-full bg-white px-2.5 py-1">Score {getTaskScore(task)}</span>
                    {task.estimatedMinutes ? <span className="rounded-full bg-white px-2.5 py-1">约 {task.estimatedMinutes} 分钟</span> : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={() => onStatusChange(task, task.status === 'doing' ? 'todo' : 'doing')} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-100">
                    {task.status === 'doing' ? '设为待办' : '开始'}
                  </button>
                  <button onClick={() => onStatusChange(task, 'done')} className="rounded-full bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500">
                    完成
                  </button>
                  <button onClick={() => onEdit(task)} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-100">
                    编辑
                  </button>
                  <button onClick={() => onDelete(task.id)} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-rose-600 shadow-sm hover:bg-rose-50">
                    删除
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
