import { useMemo, useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { storageKeys } from '../storage';
import type { AIArtifactInput, PressureHistoryRecord, Task } from '../types/task';
import { defaultAISettings, getAIConnectionLabel, isDeveloperAIKeyMode, normalizeAISettings, requestChatCompletion, type AISettings } from '../services/aiClient';
import { buildReviewUserPrompt, reviewSystemPrompt } from '../services/reviewPrompt';
import { AIReportRenderer } from './AIReportRenderer';

interface AIReviewPanelProps {
  tasks: Task[];
  pressureHistory: PressureHistoryRecord[];
  onAIReportGenerated?: (artifact: AIArtifactInput) => void;
}

type ReviewState = 'idle' | 'loading' | 'success' | 'error';

export function AIReviewPanel({ tasks, pressureHistory, onAIReportGenerated }: AIReviewPanelProps) {
  const [storedSettings] = useLocalStorage<AISettings>(storageKeys.aiSettings, defaultAISettings);
  const settings = useMemo(() => normalizeAISettings(storedSettings), [storedSettings]);
  const [state, setState] = useState<ReviewState>('idle');
  const [report, setReport] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const isDeveloperMode = isDeveloperAIKeyMode(settings);

  async function generateReview() {
    if (tasks.length === 0) {
      setState('error');
      setErrorMessage('当前没有任务数据，无法生成数据观察。');
      return;
    }

    setState('loading');
    setErrorMessage('');
    try {
      const result = await requestChatCompletion(settings, reviewSystemPrompt, buildReviewUserPrompt(tasks, pressureHistory), { mode: 'pressure_analysis', context: { tasks, pressure: pressureHistory.at(-1) } });
      setReport(result);
      setState('success');
      onAIReportGenerated?.({
        kind: 'review',
        title: '近期系统观察',
        content: result,
        relatedTaskIds: tasks.map((task) => task.id),
        relatedGoalIds: [],
        pressure: pressureHistory.at(-1)?.pressure,
        model: settings.model,
        metadata: { provider: settings.provider, pressureRecordCount: pressureHistory.length },
      });
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'AI 数据观察生成失败，请稍后重试。');
    }
  }

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">自动近期观察</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">AI 系统观察报告</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">使用当前任务、完成/放弃记录和压力历史生成结构化观察。不发送个人资料或无关隐私数据。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={generateReview} disabled={state === 'loading'} className="rounded-full bg-white/85 px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">
            {report ? '重新生成' : '生成近期观察'}
          </button>
          {report ? <button type="button" onClick={() => { setReport(''); setErrorMessage(''); setState('idle'); }} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">隐藏本次结果</button> : null}
        </div>
      </div>
      <div className="mt-4 rounded-2xl bg-slate-50/80 px-4 py-3 text-xs leading-5 text-slate-500 ring-1 ring-white/80">当前配置：{getAIConnectionLabel(settings)}{isDeveloperMode ? ` · ${settings.provider} · ${settings.model}` : ''}。数据观察仅发送必要任务与压力历史字段。</div>
      {state === 'loading' ? <div className="mt-4 rounded-3xl bg-sky-50 p-5 text-sm font-semibold text-sky-700 ring-1 ring-sky-100">正在生成近期观察……</div> : null}
      {state === 'error' && errorMessage ? <div className="mt-4 rounded-3xl bg-rose-50 p-5 text-sm font-semibold text-rose-600 ring-1 ring-rose-100">{errorMessage}</div> : null}
      {report ? <AIReportRenderer content={report} variant="review" /> : null}
    </section>
  );
}
