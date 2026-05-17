import { useState, type FormEvent } from 'react';

interface AuthPanelProps {
  isConfigured: boolean;
  isLoading: boolean;
  error?: string;
  onSignIn: (email: string, password: string) => Promise<unknown>;
  onSignUp: (email: string, password: string) => Promise<unknown>;
  onContinueAsGuest: () => void;
}

export function AuthPanel({ isConfigured, isLoading, error, onSignIn, onSignUp, onContinueAsGuest }: AuthPanelProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  function getSubmitErrorMessage(submitError: unknown): string {
    const message = submitError instanceof Error ? submitError.message : '认证失败，请稍后重试。';
    if (mode === 'signin' && message.toLowerCase().includes('email not confirmed')) {
      return '邮箱尚未验证。请打开验证邮件，建议用系统浏览器打开链接。';
    }
    return message;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    setStatus(undefined);
    if (!email.trim() || password.length < 6) {
      setFormError('请输入有效邮箱，并使用至少 6 位密码。');
      return;
    }
    setIsSubmitting(true);
    try {
      if (mode === 'signin') {
        await onSignIn(email.trim(), password);
      } else {
        await onSignUp(email.trim(), password);
        setStatus('注册成功，请前往邮箱点击验证链接。验证后再返回登录。');
      }
    } catch (submitError) {
      setFormError(getSubmitErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_32%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-xl rounded-[2rem] border border-white/80 bg-white/85 p-7 shadow-2xl shadow-slate-300/60 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">可视云同步</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">登录以启用云同步</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">使用 Supabase 邮箱密码登录后，任务、目标与压力历史会按你的用户 ID 隔离同步。也可以继续使用本机 本地存储。</p>

        {!isConfigured && !error ? (
          <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-100">缺少 Supabase 环境变量。</p>
        ) : null}
        {isLoading ? <p className="mt-5 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-700 ring-1 ring-sky-100">正在恢复登录状态…</p> : null}
        {error || formError ? <p className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600 ring-1 ring-rose-100">{formError || error}</p> : null}
        {status ? <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-100">{status}</p> : null}

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-full bg-slate-100 p-1 text-sm font-semibold text-slate-500">
          <button type="button" onClick={() => setMode('signin')} className={`rounded-full px-4 py-2 ${mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : ''}`}>登录</button>
          <button type="button" onClick={() => setMode('signup')} className={`rounded-full px-4 py-2 ${mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : ''}`}>注册</button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-slate-600">邮箱
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-sky-300" autoComplete="email" />
          </label>
          <label className="block text-sm font-semibold text-slate-600">密码
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-sky-300" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
          </label>
          <button type="submit" disabled={!isConfigured || isLoading || isSubmitting} className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-300 disabled:cursor-not-allowed disabled:bg-slate-300">
            {isSubmitting ? '处理中…' : mode === 'signin' ? '登录并同步' : '注册账号'}
          </button>
        </form>

        <button type="button" onClick={onContinueAsGuest} className="mt-4 w-full rounded-full bg-white/85 px-5 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">继续使用本地模式</button>
      </section>
    </main>
  );
}
