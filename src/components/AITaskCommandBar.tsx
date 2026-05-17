import { useMemo, useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { storageKeys } from '../storage';
import type { AIArtifactInput, Task, TaskInput } from '../types/task';
import { defaultAISettings, getAIConnectionLabel, isCloudAIAuthStateError, normalizeAISettings, requestChatCompletion, resetCloudAIAuthState } from '../services/aiClient';
import type { AISettings } from '../services/aiClient';
import { buildTaskIntakeUserPrompt, createTaskIntakePayload, parseTaskIntakeResponse, taskIntakeSystemPrompt } from '../services/taskIntakePrompt';
import { getActivityTypeLabel } from '../utils/taskScoring';

interface AITaskCommandBarProps {
  tasks: Task[];
  onConfirmTasks: (tasks: TaskInput[]) => void;
  onAIArtifactGenerated?: (artifact: AIArtifactInput) => void;
}

type IntakeState = 'idle' | 'loading' | 'ready' | 'error';

function formatDeadline(deadline?: string): string {
  if (!deadline) return '未设置';
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return '未设置';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function AITaskCommandBar({ tasks, onConfirmTasks, onAIArtifactGenerated }: AITaskCommandBarProps) {
  const [storedSettings] = useLocalStorage<AISettings>(storageKeys.aiSettings, defaultAISettings);
  const settings = useMemo(() => normalizeAISettings(storedSettings), [storedSettings]);
  const [input, setInput] = useState('');
  const [state, setState] = useState<IntakeState>('idle');
  const [drafts, setDrafts] = useState<TaskInput[]>([]);
  const [notes, setNotes] = useState('');
  const [rawJson, setRawJson] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [canResetAuthState, setCanResetAuthState] = useState(false);


  async function structureTasks() {
    const trimmedInput = input.trim();
    if (!trimmedInput) {
      setState('error');
      setCanResetAuthState(false);
      setErrorMessage('请先输入最近要做的事。');
      return;
    }

    setState('loading');
    setErrorMessage('');
    setCanResetAuthState(false);
    setDrafts([]);
    setNotes('');
    setRawJson('');
    try {
      const payload = createTaskIntakePayload(trimmedInput, tasks);
      const taskContext = tasks
        .filter((task) => task.lifecycleStatus === 'active')
        .slice(0, 30)
        .map((task) => ({
          id: task.id,
          title: task.title,
          deadline: task.deadline,
          importance: task.importance,
          progress: task.progress,
          activityType: task.activityType,
        }));
      const result = await requestChatCompletion(settings, taskIntakeSystemPrompt, buildTaskIntakeUserPrompt(payload), { mode: 'task_advice', context: { tasks: taskContext } });
      const parsed = parseTaskIntakeResponse(result);
      setDrafts(parsed.tasks);
      setNotes(parsed.notes);
      setRawJson(parsed.rawJson);
      setState('ready');
      onAIArtifactGenerated?.({
        kind: 'task-intake',
        title: '任务草稿整理',
        content: parsed.rawJson,
        relatedTaskIds: [],
        relatedGoalIds: [],
        model: settings.model,
        metadata: { provider: settings.provider, draftCount: parsed.tasks.length, notes: parsed.notes },
      });
    } catch (error) {
      console.error('[VD_AI_TASK_INTAKE_ERROR]', { error });
      setState('error');
      setCanResetAuthState(isCloudAIAuthStateError(error));
      setErrorMessage(error instanceof Error ? error.message : '任务整理失败，请稍后重试。');
    }
  }

  function confirmDrafts() {
    if (drafts.length === 0) return;
    onConfirmTasks(drafts);
    setInput('');
    setDrafts([]);
    setNotes('');
    setRawJson('');
    setCanResetAuthState(false);
    setState('idle');
  }

  function cancelDrafts() {
    setDrafts([]);
    setNotes('');
    setRawJson('');
    setErrorMessage('');
    setCanResetAuthState(false);
    setState('idle');
  }

  async function resetAuthState() {
    await resetCloudAIAuthState();
    setCanResetAuthState(false);
    setErrorMessage('已清除登录缓存。请重新登录后再使用 VD Cloud AI。');
  }

  async function copyJson() {
    if (!rawJson || !navigator.clipboard) return;
    await navigator.clipboard.writeText(rawJson);
  }

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 text-slate-900 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">AI 任务录入</p>
          <h2 className="mt-1 text-2xl font-semibold">自然语言 → 可确认任务草稿</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">说出最近要推进的人生事项，AI 会抽取任务、阶段与拆解建议，确认后才会写入 VD。</p>
        </div>
        <span className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-white/80">{getAIConnectionLabel(settings)}</span>
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="min-h-24 flex-1 rounded-[1.5rem] border border-slate-200/80 bg-white/85 px-4 py-3 text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70"
          placeholder="例如：这周五前交数学分析作业，今晚跑步，周末整理数据结构笔记。"
        />
        <button type="button" onClick={structureTasks} disabled={state === 'loading'} className="rounded-[1.5rem] bg-white/85 px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 lg:w-36">
          {state === 'loading' ? '整理中…' : '整理为任务'}
        </button>
      </div>

      {state === 'error' && errorMessage ? (
        <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 ring-1 ring-rose-100">
          <p>{errorMessage}</p>
          {canResetAuthState ? (
            <button type="button" onClick={resetAuthState} className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-100 hover:bg-rose-50">重新登录 / 清除登录缓存</button>
          ) : null}
        </div>
      ) : null}
      {state === 'ready' ? (
        <div className="mt-4 rounded-[1.5rem] bg-white/90 p-4 text-slate-900 shadow-inner ring-1 ring-white/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">待确认任务草稿</h3>
              {notes ? <p className="mt-1 text-sm text-slate-500">{notes}</p> : null}
            </div>
            {rawJson ? <button type="button" onClick={copyJson} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200">复制 JSON</button> : null}
          </div>
          {drafts.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">没有识别到明确任务。</div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {drafts.map((draft, index) => (
                <article key={`${draft.title}-${index}`} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                  <h4 className="font-semibold text-slate-950">{draft.title}</h4>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                    <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-100">重要性 {draft.importance}/10</span>
                    <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-100">截止 {formatDeadline(draft.deadline)}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-100">{getActivityTypeLabel(draft.activityType)}</span>
                  </div>
                  {draft.description ? <p className="mt-3 text-sm leading-6 text-slate-500">{draft.description}</p> : null}
                  {draft.decomposition?.length ? (
                    <div className="mt-3 rounded-2xl bg-white/80 p-3 ring-1 ring-white/80">
                      <p className="text-xs font-semibold text-slate-500">结构拆解</p>
                      <ul className="mt-2 space-y-1 text-xs text-slate-500">
                        {draft.decomposition.slice(0, 5).map((item) => <li key={item}>· {item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {draft.milestoneSuggestions?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {draft.milestoneSuggestions.slice(0, 4).map((item) => <span key={item} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-100">{item}</span>)}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={cancelDrafts} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">取消</button>
            <button type="button" onClick={confirmDrafts} disabled={drafts.length === 0} className="rounded-full bg-white/85 px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">确认新增</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
