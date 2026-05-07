import type { MatrixGroups, QuadrantKey, Task } from '../types/task';
import { formatDeadline } from '../utils/date';

interface EisenhowerMatrixProps {
  groups: MatrixGroups;
}

const quadrantMeta: Record<QuadrantKey, { title: string; hint: string; tone: string }> = {
  importantUrgent: {
    title: '立即做',
    hint: 'Important & Urgent',
    tone: 'border-rose-200 bg-rose-50/80',
  },
  importantNotUrgent: {
    title: '计划做',
    hint: 'Important & Not Urgent',
    tone: 'border-sky-200 bg-sky-50/80',
  },
  notImportantUrgent: {
    title: '尽快处理',
    hint: 'Not Important & Urgent',
    tone: 'border-amber-200 bg-amber-50/80',
  },
  notImportantNotUrgent: {
    title: '延后或删除',
    hint: 'Not Important & Not Urgent',
    tone: 'border-slate-200 bg-slate-50/80',
  },
};

function MatrixTask({ task }: { task: Task }) {
  return (
    <li className="rounded-2xl bg-white/85 p-3 shadow-sm">
      <p className="font-medium text-slate-900">{task.title}</p>
      <p className="mt-1 text-xs text-slate-500">重要性 {task.importance} · {formatDeadline(task.deadline)}</p>
    </li>
  );
}

export function EisenhowerMatrix({ groups }: EisenhowerMatrixProps) {
  const order: QuadrantKey[] = ['importantUrgent', 'importantNotUrgent', 'notImportantUrgent', 'notImportantNotUrgent'];

  return (
    <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-500">艾森豪威尔矩阵</p>
        <h2 className="text-2xl font-bold text-slate-950">让任务自动归位</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {order.map((key) => (
          <div key={key} className={`min-h-44 rounded-3xl border p-4 ${quadrantMeta[key].tone}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900">{quadrantMeta[key].title}</h3>
                <p className="text-xs text-slate-500">{quadrantMeta[key].hint}</p>
              </div>
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600">{groups[key].length}</span>
            </div>
            {groups[key].length === 0 ? (
              <p className="mt-8 text-sm text-slate-400">暂无任务</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {groups[key].map((task) => <MatrixTask key={task.id} task={task} />)}
              </ul>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-between text-xs text-slate-400">
        <span>纵轴：重要性</span>
        <span>横轴：截止日期紧急程度</span>
      </div>
    </section>
  );
}
