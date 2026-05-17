import { useMemo, useState, type FormEvent } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { storageKeys } from '../storage';
import type { AIArtifactInput, PressureBreakdown, Task } from '../types/task';
import { defaultAISettings, getAIConnectionLabel, getProviderDefaults, isDeveloperAIKeyMode, normalizeAISettings, requestChatCompletion, type AIProvider, type AISettings } from '../services/aiClient';
import { buildTaskAnalysisUserPrompt, createTaskAnalysisPayload, taskAnalysisSystemPrompt } from '../services/taskAnalysisPrompt';
import { AIReportRenderer } from './AIReportRenderer';
import { ModalPortal } from './ModalPortal';

interface AITaskAnalysisPanelProps {
  tasks: Task[];
  pressure?: PressureBreakdown;
  onAIConnected?: () => void;
  onAIReportGenerated?: (artifact: AIArtifactInput) => void;
}

type AnalysisState = 'idle' | 'loading' | 'success' | 'error';

function providerLabel(provider: AIProvider): string {
  return provider === 'deepseek-compatible' ? 'DeepSeek Compatible' : 'OpenAI Compatible';
}

export function AITaskAnalysisPanel({ tasks, pressure, onAIConnected, onAIReportGenerated }: AITaskAnalysisPanelProps) {
  const [storedSettings, setStoredSettings] = useLocalStorage<AISettings>(storageKeys.aiSettings, defaultAISettings);
  const settings = useMemo(() => normalizeAISettings(storedSettings), [storedSettings]);
  const [draftSettings, setDraftSettings] = useState<AISettings>(settings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
  const [report, setReport] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const isDeveloperMode = isDeveloperAIKeyMode(settings);

  function openSettings() {
    setDraftSettings(settings);
    setIsSettingsOpen(true);
  }

  function handleProviderChange(provider: AIProvider) {
    const defaults = getProviderDefaults(provider);
    setDraftSettings((current) => ({ ...current, provider, baseUrl: defaults.baseUrl, model: defaults.model }));
  }

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedDraftSettings = normalizeAISettings(draftSettings);
    setStoredSettings(normalizedDraftSettings);
    if (normalizedDraftSettings.apiKey.trim()) onAIConnected?.();
    setIsSettingsOpen(false);
    setErrorMessage('');
  }

  async function runAnalysis() {
    if (tasks.length === 0) {
      setErrorMessage('当前没有任务，无法进行 AI 任务分析。');
      setAnalysisState('error');
      return;
    }

    setAnalysisState('loading');
    setErrorMessage('');
    try {
      const payload = createTaskAnalysisPayload(tasks, pressure);
      const userPrompt = buildTaskAnalysisUserPrompt(payload);
      const result = await requestChatCompletion(settings, taskAnalysisSystemPrompt, userPrompt, { mode: 'pressure_analysis', context: { tasks, pressure } });
      setReport(result);
      setAnalysisState('success');
      onAIReportGenerated?.({
        kind: 'task-analysis',
        title: '认知压力报告',
        content: result,
        relatedTaskIds: tasks.map((task) => task.id),
        relatedGoalIds: [],
        pressure: pressure?.rawPressure,
        model: settings.model,
        metadata: { provider: settings.provider, taskCount: tasks.length },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'AI 分析请求失败，请稍后重试。');
      setAnalysisState('error');
    }
  }

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">AI 任务分析</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">认知压力报告</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">将当前任务结构发送给你配置的 AI 服务商，生成一次结构化任务压力与执行瓶颈分析。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openSettings} className="rounded-full bg-white/85 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
            开发者 API Key
          </button>
          <button type="button" onClick={runAnalysis} disabled={analysisState === 'loading'} className="rounded-full bg-white/85 px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">
            {report ? '重新分析' : '分析当前任务'}
          </button>
          {report ? <button type="button" onClick={() => { setReport(''); setAnalysisState('idle'); setErrorMessage(''); }} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">隐藏本次结果</button> : null}
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50/80 px-4 py-3 text-xs leading-5 text-slate-500 ring-1 ring-white/80">
        <span className="font-semibold text-slate-600">当前配置：</span>{getAIConnectionLabel(settings)}{isDeveloperMode ? ` · ${providerLabel(settings.provider)} · ${settings.model}` : ''}。默认通过 /api/ai 使用 VD Cloud AI，开发者本地 API Key 仅保存在当前浏览器。
      </div>

      {analysisState === 'loading' ? <div className="mt-4 rounded-3xl bg-sky-50 p-5 text-sm font-semibold text-sky-700 ring-1 ring-sky-100">正在生成任务压力报告……</div> : null}
      {analysisState === 'error' && errorMessage ? <div className="mt-4 rounded-3xl bg-rose-50 p-5 text-sm font-semibold text-rose-600 ring-1 ring-rose-100">{errorMessage}</div> : null}
      {report ? <AIReportRenderer content={report} variant="task-analysis" /> : null}

      {isSettingsOpen ? (
        <ModalPortal>
          <form onSubmit={saveSettings} className="max-h-[calc(100vh-3rem)] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-white/80 bg-white/95 p-5 shadow-2xl shadow-slate-300/60">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-500">AI 设置</p>
                <h3 className="mt-1 text-2xl font-semibold text-slate-950">模型服务配置</h3>
              </div>
              <button type="button" onClick={() => setIsSettingsOpen(false)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200">关闭</button>
            </div>

            <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500 ring-1 ring-white/80">开发者模式 API Key 仅保存在当前浏览器本地，用于绕过 VD Cloud AI 直接请求你选择的模型服务。普通用户无需配置 API Key，VD 不会上传或保存你的本地 API Key 到服务器。</p>
            <p className="mt-2 rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700 ring-1 ring-amber-100">任务数据会直接发送给你选择的 AI 服务商用于生成分析。请不要填写不愿发送给第三方模型的敏感内容。</p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-600">服务商
                <select value={draftSettings.provider} onChange={(event) => handleProviderChange(event.target.value as AIProvider)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70">
                  <option value="openai-compatible">OpenAI Compatible</option>
                  <option value="deepseek-compatible">DeepSeek Compatible</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-600">模型
                <input value={draftSettings.model} onChange={(event) => setDraftSettings({ ...draftSettings, model: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70" />
              </label>
              <label className="text-sm font-medium text-slate-600 md:col-span-2">服务地址
                <input value={draftSettings.baseUrl} onChange={(event) => setDraftSettings({ ...draftSettings, baseUrl: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70" />
              </label>
              <label className="text-sm font-medium text-slate-600 md:col-span-2">API Key
                <input type="password" value={draftSettings.apiKey} onChange={(event) => setDraftSettings({ ...draftSettings, apiKey: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70" placeholder="sk-..." />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setIsSettingsOpen(false)} className="rounded-full px-5 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">取消</button>
              <button type="submit" className="rounded-full bg-white/85 px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">保存设置</button>
            </div>
          </form>
        </ModalPortal>
      ) : null}
    </section>
  );
}
