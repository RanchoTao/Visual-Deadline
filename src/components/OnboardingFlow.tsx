import { FormEvent, useState } from 'react';
import type { ActivityType, Importance, LifecycleStatus, PressureCalibrationSnapshot, TaskInput } from '../types/task';
import { toDatetimeLocalValue } from '../utils/date';
import { clampImportance, clampPressure, clampProgress, createPressureCalibration, getActivityTypeLabel, getUrgencyWeight } from '../utils/taskScoring';

interface OnboardingCompleteResult {
  ok: boolean;
  error?: string;
}

interface OnboardingFlowProps {
  onComplete: (tasks: TaskInput[], referencePressure: number, calibration: PressureCalibrationSnapshot) => OnboardingCompleteResult | Promise<OnboardingCompleteResult>;
}

const activityTypes: ActivityType[] = ['task', 'schedule', 'study', 'fitness', 'social', 'recovery', 'entertainment', 'other'];

function createDraftTask(title: string): TaskInput {
  return {
    title,
    description: '',
    importance: 6,
    deadline: toDatetimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    progress: 0,
    activityType: 'task',
    lifecycleStatus: 'active',
  };
}

function calculateInitialTaskLoad(tasks: TaskInput[]): number {
  return tasks.reduce((sum, task) => {
    if (task.lifecycleStatus !== 'active') return sum;
    const progressNormalized = clampProgress(task.progress) / 100;
    return sum + getUrgencyWeight(task.deadline) * clampImportance(task.importance) * (1 - progressNormalized);
  }, 0);
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(1);
  const [roughTitle, setRoughTitle] = useState('');
  const [roughTitles, setRoughTitles] = useState<string[]>([]);
  const [referencePressure, setReferencePressure] = useState(35);
  const [draftTasks, setDraftTasks] = useState<TaskInput[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const canContinueDump = roughTitles.length > 0;

  function addRoughTitle(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const title = roughTitle.trim();
    if (!title) return;
    setRoughTitles((current) => [...current, title]);
    setRoughTitle('');
  }

  function continueToPressure() {
    if (!canContinueDump) return;
    setDraftTasks(roughTitles.map(createDraftTask));
    setStep(2);
  }

  function updateDraftTask(index: number, values: Partial<TaskInput>) {
    setDraftTasks((current) => current.map((task, taskIndex) => (taskIndex === index ? { ...task, ...values } : task)));
  }

  async function completeOnboarding() {
    if (isSubmitting) return;
    setSubmitError('');
    const refinedTasks = draftTasks.map((task) => ({
      ...task,
      title: task.title.trim() || '未命名项目',
      description: task.description?.trim() || undefined,
      importance: clampImportance(task.importance),
      progress: clampProgress(task.progress),
      lifecycleStatus: 'active' as LifecycleStatus,
    }));

    const validTasks = refinedTasks.filter((task) => task.title.trim() && task.lifecycleStatus === 'active' && task.progress < 100);
    const safeReferencePressure = clampPressure(referencePressure);
    const totalTaskPressure = calculateInitialTaskLoad(refinedTasks);

    console.info('[VD_ONBOARDING] submit started');
    console.info('[VD_ONBOARDING] tasks before save', refinedTasks);
    console.info('[VD_ONBOARDING] subjectivePressure before calibration', safeReferencePressure);
    console.info('[VD_ONBOARDING] totalTaskPressure', totalTaskPressure);

    if (validTasks.length === 0) {
      setSubmitError('请至少保留一个未完成的有效任务后再进入 VD。');
      return;
    }

    if (!Number.isFinite(safeReferencePressure)) {
      setSubmitError('主观压力数值无效，请重新选择。');
      return;
    }

    if (totalTaskPressure <= 0) {
      setSubmitError('当前任务压力为 0，无法完成校准。请检查任务重要性、截止时间或进度。');
      return;
    }

    const calibration = createPressureCalibration(safeReferencePressure, totalTaskPressure, refinedTasks.length);
    console.info('[VD_ONBOARDING] pressureCoefficient', calibration.pressureCoefficient);
    console.info('[VD_ONBOARDING] realtimePressure', totalTaskPressure * calibration.pressureCoefficient);

    try {
      setIsSubmitting(true);
      const result = await onComplete(refinedTasks, safeReferencePressure, calibration);
      if (!result.ok) {
        setSubmitError(result.error || '保存失败，请稍后重试。');
      }
    } catch (error) {
      console.error('[VD_ONBOARDING] onboarding submit failed', error);
      setSubmitError(error instanceof Error ? error.message : '保存失败，请稍后重试。');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/15 px-4 py-6 backdrop-blur-sm">
      <section className="max-h-[calc(100vh-3rem)] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-2xl shadow-slate-300/60">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">VD 初始问答 · {step}/3</p>
            <div className="mt-3 h-2 w-48 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-slate-700 transition-all" style={{ width: `${(step / 3) * 100}%` }} />
            </div>
          </div>
        </div>

        {step === 1 ? (
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">最近有什么事情在占用你的注意力？</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">先只写名称，不必整理。把你现在能想到的事情先倒出来。</p>
            <form onSubmit={addRoughTitle} className="mt-6 flex gap-3">
              <input value={roughTitle} onChange={(event) => setRoughTitle(event.target.value)} className="min-w-0 flex-1 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 outline-none transition focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70" placeholder="例如：准备答辩材料" autoFocus />
              <button type="submit" className="rounded-full bg-white/85 px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">加入</button>
            </form>
            <div className="mt-5 flex flex-wrap gap-2">
              {roughTitles.map((title, index) => (
                <button key={`${title}-${index}`} type="button" onClick={() => setRoughTitles((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200">{title} ×</button>
              ))}
            </div>
            <div className="mt-8 flex justify-end">
              <button type="button" disabled={!canContinueDump} onClick={continueToPressure} className="rounded-full bg-white/85 px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">继续校准压力</button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">现在凭直觉判断，你最近的生活压力有多大？</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">系统会把刚刚倒出的任务和这个主观压力一起记录下来，用于校准你的个人压力刻度。</p>
            <div className="mt-8 rounded-3xl bg-slate-50/90 p-5 ring-1 ring-white/80">
              <div className="flex items-end justify-between gap-4">
                <span className="text-sm font-medium text-slate-600">主观压力</span>
                <span className="text-5xl font-semibold text-slate-950">{referencePressure}</span>
              </div>
              <input type="range" min="0" max="100" value={referencePressure} onChange={(event) => setReferencePressure(clampPressure(Number(event.target.value)))} className="mt-5 w-full accent-slate-700" />
              <div className="mt-2 flex justify-between text-xs text-slate-400"><span>平静</span><span>很重</span></div>
            </div>
            <div className="mt-8 flex justify-between gap-3">
              <button type="button" onClick={() => setStep(1)} className="rounded-full px-5 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-100">返回</button>
              <button type="button" onClick={() => setStep(3)} className="rounded-full bg-white/85 px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">补充任务信息</button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">现在，把这些事情补充完整。</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">只补充必要信息即可。之后你仍然可以继续编辑。</p>
            <div className="mt-6 space-y-4">
              {draftTasks.map((task, index) => (
                <article key={`${task.title}-${index}`} className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
                  <input value={task.title} onChange={(event) => updateDraftTask(index, { title: event.target.value })} className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 font-semibold outline-none focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70" />
                  <textarea value={task.description ?? ''} onChange={(event) => updateDraftTask(index, { description: event.target.value })} className="mt-3 min-h-20 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm outline-none focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70" placeholder="描述（可选）" />
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <label className="text-xs font-medium text-slate-500">重要性<input type="number" min="1" max="10" value={task.importance} onChange={(event) => updateDraftTask(index, { importance: Number(event.target.value) as Importance })} className="mt-1 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm" /></label>
                    <label className="text-xs font-medium text-slate-500">截止时间<input type="datetime-local" value={task.deadline ?? ''} onChange={(event) => updateDraftTask(index, { deadline: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm" /></label>
                    <label className="text-xs font-medium text-slate-500">进度<input type="number" min="0" max="100" value={task.progress} onChange={(event) => updateDraftTask(index, { progress: clampProgress(Number(event.target.value)) })} className="mt-1 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm" /></label>
                    <label className="text-xs font-medium text-slate-500">类型<select value={task.activityType} onChange={(event) => updateDraftTask(index, { activityType: event.target.value as ActivityType })} className="mt-1 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm">{activityTypes.map((activityType) => <option key={activityType} value={activityType}>{getActivityTypeLabel(activityType)}</option>)}</select></label>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-8 flex justify-between gap-3">
              <button type="button" onClick={() => setStep(2)} className="rounded-full px-5 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-100">返回</button>
              <div className="flex flex-col items-end gap-2">
                {submitError ? <p className="max-w-md rounded-2xl bg-rose-50 px-4 py-2 text-sm text-rose-700 ring-1 ring-rose-100">{submitError}</p> : null}
                <button type="button" onClick={completeOnboarding} disabled={isSubmitting} className="rounded-full bg-white/85 px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">{isSubmitting ? '保存中…' : '进入 VD'}</button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
