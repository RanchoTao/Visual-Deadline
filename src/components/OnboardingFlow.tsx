import { FormEvent, useMemo, useState } from 'react';
import type { ActivityType, Importance, LifecycleStatus, PressureCalibrationSnapshot, TaskInput } from '../types/task';
import { toDatetimeLocalValue } from '../utils/date';
import { clampImportance, clampProgress, clampSubjectivePressure, createPressureCalibration, getActivityTypeLabel, getUrgencyWeight } from '../utils/taskScoring';

interface OnboardingFlowProps {
  onComplete: (tasks: TaskInput[], subjectivePressure: number, calibration: PressureCalibrationSnapshot) => Promise<void> | void;
}

const activityTypes: ActivityType[] = ['task', 'schedule', 'study', 'fitness', 'social', 'recovery', 'entertainment', 'other'];

function createDraftTask(title: string): TaskInput {
  return {
    title,
    description: '',
    importance: 5,
    deadline: toDatetimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    progress: 0,
    activityType: 'task',
    lifecycleStatus: 'active',
    progressMode: 'manual',
  };
}

function calculateInitialTaskLoad(tasks: TaskInput[]): number {
  return tasks.reduce((sum, task) => {
    if (task.lifecycleStatus !== 'active') return sum;
    return sum + getUrgencyWeight(task.deadline) * task.importance * (1 - clampProgress(task.progress) / 100);
  }, 0);
}

function debugOnboarding(message: string, payload?: unknown): void {
  console.info(`[VD onboarding] ${message}`, payload ?? '');
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(1);
  const [roughTitle, setRoughTitle] = useState('');
  const [roughTitles, setRoughTitles] = useState<string[]>([]);
  const [subjectivePressure, setSubjectivePressure] = useState(5);
  const [draftTasks, setDraftTasks] = useState<TaskInput[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const canContinueDump = roughTitles.length > 0;
  const initialTaskLoad = useMemo(() => calculateInitialTaskLoad(draftTasks), [draftTasks]);
  const calibrationPreview = useMemo(() => createPressureCalibration(subjectivePressure, initialTaskLoad, draftTasks.length), [draftTasks.length, initialTaskLoad, subjectivePressure]);

  function addRoughTitle(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const title = roughTitle.trim();
    if (!title) return;
    debugOnboarding('task rough title added', { title });
    setRoughTitles((current) => [...current, title]);
    setRoughTitle('');
  }

  function continueToPressure() {
    if (!canContinueDump) return;
    const nextDrafts = roughTitles.map(createDraftTask);
    debugOnboarding('draft tasks created before pressure calibration', nextDrafts);
    setDraftTasks(nextDrafts);
    setStep(2);
  }

  function updateDraftTask(index: number, values: Partial<TaskInput>) {
    setDraftTasks((current) => {
      const nextTasks = current.map((task, taskIndex) => (taskIndex === index ? { ...task, ...values } : task));
      debugOnboarding('draft task updated and pressure preview recalculated', { index, values, nextTask: nextTasks[index] });
      return nextTasks;
    });
  }

  async function completeOnboarding() {
    if (saveState === 'saving') return;
    setSaveError('');
    setSaveState('saving');

    const refinedTasks = draftTasks.map((task) => ({
      ...task,
      title: task.title.trim() || '未命名项目',
      description: task.description?.trim() || undefined,
      importance: clampImportance(task.importance),
      progress: clampProgress(task.progress),
      taskProgress: clampProgress(task.progress),
      progressMode: 'manual' as const,
      lifecycleStatus: 'active' as LifecycleStatus,
    }));
    const calibration = createPressureCalibration(subjectivePressure, initialTaskLoad, refinedTasks.length);

    debugOnboarding('before save', { taskCount: refinedTasks.length, subjectivePressure, initialTaskLoad, calibration });

    try {
      await onComplete(refinedTasks, subjectivePressure, calibration);
      debugOnboarding('after save returned from app', { taskCount: refinedTasks.length });
      setSaveState('success');
      window.setTimeout(() => debugOnboarding('success transition completed before redirect/unmount'), 250);
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败。请不要刷新页面，稍后重试。';
      console.error('[VD onboarding] save failed', error);
      setSaveError(message);
      setSaveState('error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/15 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6">
      <section className="max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-white/80 bg-white/95 p-5 shadow-2xl shadow-slate-300/60 sm:p-6">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">VD 初始设置 · {step}/3</p>
            <div className="mt-3 h-2 w-48 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-slate-800 transition-all duration-500" style={{ width: `${(step / 3) * 100}%` }} />
            </div>
          </div>
          <p className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-100">数据会先保存，再进入 VD</p>
        </div>

        {step === 1 ? (
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">先把占用注意力的事倒出来</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">只写名称即可。VD 会在最后一步确认保存，避免你的初始数据消失。</p>
            <form onSubmit={addRoughTitle} className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input value={roughTitle} onChange={(event) => setRoughTitle(event.target.value)} className="min-w-0 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 outline-none transition focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70" placeholder="例如：准备答辩材料" autoFocus />
              <button type="submit" className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">加入</button>
            </form>
            <div className="mt-5 flex flex-wrap gap-2">
              {roughTitles.map((title, index) => (
                <button key={`${title}-${index}`} type="button" onClick={() => setRoughTitles((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200">{title} ×</button>
              ))}
            </div>
            <div className="mt-8 flex justify-end">
              <button type="button" disabled={!canContinueDump} onClick={continueToPressure} className="rounded-full bg-white/85 px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">继续校准压力</button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">此刻你主观感觉压力是几分？</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">1 到 10 分。VD 会用这个数字除以当前任务权重，得到你的个人压力系数。</p>
            <div className="mt-8 rounded-3xl bg-slate-50/90 p-5 ring-1 ring-white/80">
              <div className="flex items-end justify-between gap-4">
                <span className="text-sm font-medium text-slate-600">主观压力</span>
                <span className="text-5xl font-semibold text-slate-950 tabular-nums">{subjectivePressure}</span>
              </div>
              <input type="range" min="1" max="10" value={subjectivePressure} onChange={(event) => setSubjectivePressure(clampSubjectivePressure(Number(event.target.value)))} className="mt-5 w-full accent-slate-800" />
              <div className="mt-2 flex justify-between text-xs text-slate-400"><span>很轻</span><span>非常重</span></div>
              <div className="mt-5 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                <span className="rounded-full bg-white px-3 py-2">任务权重 {Math.round(initialTaskLoad * 10) / 10}</span>
                <span className="rounded-full bg-white px-3 py-2">系数 ×{calibrationPreview.pressureCoefficient}</span>
                <span className="rounded-full bg-white px-3 py-2">任务数 {draftTasks.length}</span>
              </div>
            </div>
            <div className="mt-8 flex justify-between gap-3">
              <button type="button" onClick={() => setStep(1)} className="rounded-full px-5 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-100">返回</button>
              <button type="button" onClick={() => setStep(3)} className="rounded-full bg-white/85 px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">补充任务信息</button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">确认这些事的基本信息</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">只调两个滑杆和截止时间即可。保存成功后才会进入 VD。</p>
            <div className="mt-6 space-y-4">
              {draftTasks.map((task, index) => (
                <article key={`${task.title}-${index}`} className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
                  <input value={task.title} onChange={(event) => updateDraftTask(index, { title: event.target.value })} className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 font-semibold outline-none focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70" />
                  <textarea value={task.description ?? ''} onChange={(event) => updateDraftTask(index, { description: event.target.value })} className="mt-3 min-h-16 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm outline-none focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70" placeholder="描述（可选）" />
                  <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1fr]">
                    <div className="rounded-3xl bg-white/80 p-4 ring-1 ring-slate-100">
                      <div className="flex items-center justify-between gap-3"><label className="text-sm font-semibold text-slate-600" htmlFor={`importance-${index}`}>你有多在意这件事？</label><span className="text-2xl font-semibold tabular-nums text-slate-950">{task.importance}</span></div>
                      <input id={`importance-${index}`} type="range" min="1" max="10" value={task.importance} onChange={(event) => updateDraftTask(index, { importance: clampImportance(Number(event.target.value)) as Importance })} className="mt-4 w-full accent-slate-800" />
                      <div className="mt-2 flex justify-between text-xs text-slate-400"><span>无所谓</span><span>非常重要</span></div>
                    </div>
                    <label className="rounded-3xl bg-white/80 p-4 text-sm font-semibold text-slate-600 ring-1 ring-slate-100">截止时间<input type="datetime-local" value={task.deadline ?? ''} onChange={(event) => updateDraftTask(index, { deadline: event.target.value })} className="mt-3 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm font-medium outline-none" /></label>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_1fr]">
                    <div className="rounded-3xl bg-white/80 p-4 ring-1 ring-slate-100">
                      <div className="flex items-center justify-between gap-3"><label className="text-sm font-semibold text-slate-600" htmlFor={`progress-${index}`}>已经完成多少？</label><span className="text-2xl font-semibold tabular-nums text-slate-950">{task.progress}%</span></div>
                      <input id={`progress-${index}`} type="range" min="0" max="100" value={task.progress} onChange={(event) => updateDraftTask(index, { progress: clampProgress(Number(event.target.value)), taskProgress: clampProgress(Number(event.target.value)), progressMode: 'manual' })} className="mt-4 w-full accent-slate-800" />
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-800 transition-all" style={{ width: `${task.progress}%` }} /></div>
                    </div>
                    <label className="rounded-3xl bg-white/80 p-4 text-sm font-semibold text-slate-600 ring-1 ring-slate-100">类型<select value={task.activityType} onChange={(event) => updateDraftTask(index, { activityType: event.target.value as ActivityType })} className="mt-3 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm font-medium outline-none">{activityTypes.map((activityType) => <option key={activityType} value={activityType}>{getActivityTypeLabel(activityType)}</option>)}</select></label>
                  </div>
                </article>
              ))}
            </div>
            {saveError ? <p className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 ring-1 ring-rose-100">{saveError}</p> : null}
            {saveState === 'success' ? <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-100">已保存。正在进入 VD……</p> : null}
            <div className="mt-8 flex flex-wrap justify-between gap-3">
              <button type="button" disabled={saveState === 'saving'} onClick={() => setStep(2)} className="rounded-full px-5 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300">返回</button>
              <button type="button" disabled={saveState === 'saving' || saveState === 'success'} onClick={completeOnboarding} className="rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">{saveState === 'saving' ? '正在保存…' : saveState === 'success' ? '保存成功' : '保存并进入 VD'}</button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
