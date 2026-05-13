import { useMemo, useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { storageKeys } from '../storage';
import type { PressureHistoryRecord, Task } from '../types/task';
import { defaultAISettings, normalizeAISettings, requestChatCompletion, type AISettings } from '../services/aiClient';
import { buildReviewUserPrompt, reviewSystemPrompt } from '../services/reviewPrompt';

interface AIReviewPanelProps {
  tasks: Task[];
  pressureHistory: PressureHistoryRecord[];
}

type ReviewState = 'idle' | 'loading' | 'success' | 'error';

export function AIReviewPanel({ tasks, pressureHistory }: AIReviewPanelProps) {
  const [storedSettings] = useLocalStorage<AISettings>(storageKeys.aiSettings, defaultAISettings);
  const settings = useMemo(() => normalizeAISettings(storedSettings), [storedSettings]);
  const [state, setState] = useState<ReviewState>('idle');
  const [report, setReport] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const hasApiKey = Boolean(settings.apiKey.trim());

  async function generateReview() {
    if (!hasApiKey) {
      setState('error');
      setErrorMessage('请先在 AI 任务分析中设置 API Key，再生成近期复盘。');
      return;
    }
    if (tasks.length === 0) {
      setState('error');
      setErrorMessage('当前没有任务数据，无法生成复盘。');
      return;
    }

    setState('loading');
    setErrorMessage('');
    try {
      const result = await requestChatCompletion(settings, reviewSystemPrompt, buildReviewUserPrompt(tasks, pressureHistory));
      setReport(result);
      setState('success');
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'AI 复盘生成失败，请稍后重试。');
    }
  }

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">自动近期复盘</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">AI 系统复盘报告</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">使用当前任务、完成/放弃记录和压力历史生成结构化复盘。不发送个人资料或无关隐私数据。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={generateReview} disabled={state === 'loading'} className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            {report ? '重新生成' : '生成近期复盘'}
          </button>
          {report ? <button type="button" onClick={() => { setReport(''); setErrorMessage(''); setState('idle'); }} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">清除结果</button> : null}
        </div>
      </div>
      <div className="mt-4 rounded-2xl bg-slate-50/80 px-4 py-3 text-xs leading-5 text-slate-500 ring-1 ring-white/80">当前配置：{hasApiKey ? `${settings.provider} · ${settings.model}` : '未配置 API Key'}。复盘仅发送必要任务与压力历史字段。</div>
      {state === 'loading' ? <div className="mt-4 rounded-3xl bg-sky-50 p-5 text-sm font-semibold text-sky-700 ring-1 ring-sky-100">正在生成近期复盘……</div> : null}
      {state === 'error' && errorMessage ? <div className="mt-4 rounded-3xl bg-rose-50 p-5 text-sm font-semibold text-rose-600 ring-1 ring-rose-100">{errorMessage}</div> : null}
      {report ? <article className="mt-4 whitespace-pre-wrap rounded-[1.5rem] bg-white/90 p-5 text-sm leading-7 text-slate-700 shadow-inner ring-1 ring-white/80">{report}</article> : null}
    </section>
  );
}
