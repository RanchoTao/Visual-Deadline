import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { UserProfile } from '../types/task';

type SignupIdentity = Pick<UserProfile, 'avatarDataUrl' | 'nickname' | 'username'>;

interface AuthPanelProps {
  isConfigured: boolean;
  isLoading: boolean;
  error?: string;
  onSignIn: (email: string, password: string) => Promise<unknown>;
  onSignUp: (email: string, password: string, identity: SignupIdentity) => Promise<unknown>;
  onContinueAsGuest: () => void;
}

export function AuthPanel({ isConfigured, isLoading, error, onSignIn, onSignUp, onContinueAsGuest }: AuthPanelProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [username, setUsername] = useState('');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAcceptedPolicies, setHasAcceptedPolicies] = useState(false);

  function getSubmitErrorMessage(submitError: unknown): string {
    const message = submitError instanceof Error ? submitError.message : '认证失败，请稍后重试。';
    if (mode === 'signin' && message.toLowerCase().includes('email not confirmed')) {
      return '邮箱尚未验证。请打开验证邮件，建议用系统浏览器打开链接。';
    }
    return message;
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') setAvatarDataUrl(reader.result);
    });
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    setStatus(undefined);
    const cleanUsername = username.trim().replace(/^@/, '');
    if (!email.trim() || password.length < 6) {
      setFormError('请输入有效邮箱，并使用至少 6 位密码。');
      return;
    }
    if (mode === 'signup' && !hasAcceptedPolicies) {
      setFormError('请先阅读并同意用户协议与隐私政策。');
      return;
    }
    setIsSubmitting(true);
    try {
      if (mode === 'signin') {
        await onSignIn(email.trim(), password);
      } else {
        await onSignUp(email.trim(), password, { avatarDataUrl, nickname: nickname.trim(), username: cleanUsername });
        setStatus('注册成功，请前往邮箱点击验证链接。验证后再返回登录。你的 VD 身份资料已保存。');
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
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">VD 云同步</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">登录以启用云同步</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">使用 Supabase 邮箱密码登录后，任务、目标与压力历史会按你的用户 ID 隔离同步。也可以继续使用本机 localStorage。</p>

        {!isConfigured && !error ? (
          <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-100">Supabase 环境变量未配置。</p>
        ) : null}
        {isLoading ? <p className="mt-5 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-700 ring-1 ring-sky-100">正在恢复登录状态…</p> : null}
        {error || formError ? <p className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600 ring-1 ring-rose-100">{formError || error}</p> : null}
        {status ? <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-100">{status}</p> : null}

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-full bg-slate-100 p-1 text-sm font-semibold text-slate-500">
          <button type="button" onClick={() => setMode('signin')} className={`rounded-full px-4 py-2 transition ${mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-700'}`}>登录</button>
          <button type="button" onClick={() => setMode('signup')} className={`rounded-full px-4 py-2 transition ${mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-700'}`}>注册</button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === 'signup' ? (
            <div className="rounded-[1.75rem] bg-slate-50/80 p-4 ring-1 ring-white/90">
              <div className="flex items-center gap-4">
                <label className="group flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-white text-2xl font-semibold text-slate-400 shadow-inner ring-1 ring-slate-200 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg">
                  {avatarDataUrl ? <img src={avatarDataUrl} alt="注册头像预览" className="h-full w-full object-cover" /> : '＋'}
                  <input type="file" accept="image/*" onChange={handleAvatarChange} className="sr-only" />
                </label>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-700">创建你的 VD 身份</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">上传头像，并设置对外展示的昵称与用户名。</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-600">昵称
                  <input value={nickname} onChange={(event) => setNickname(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100/70" placeholder="VD 如何称呼你" autoComplete="nickname" />
                </label>
                <label className="block text-sm font-semibold text-slate-600">用户名
                  <input value={username} onChange={(event) => setUsername(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100/70" placeholder="visualdeadline" autoComplete="username" />
                </label>
              </div>
            </div>
          ) : null}

          <label className="block text-sm font-semibold text-slate-600">邮箱
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100/70" autoComplete="email" />
          </label>
          <label className="block text-sm font-semibold text-slate-600">密码
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100/70" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
          </label>
          {mode === 'signup' ? (
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50/85 px-4 py-3 text-sm leading-6 text-slate-600 ring-1 ring-slate-100">
              <input
                type="checkbox"
                checked={hasAcceptedPolicies}
                onChange={(event) => setHasAcceptedPolicies(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-950 accent-slate-950"
              />
              <span>
                我已阅读并同意
                <a href="/terms" className="font-semibold text-sky-700 hover:text-sky-900">《用户协议》</a>
                和
                <a href="/privacy" className="font-semibold text-sky-700 hover:text-sky-900">《隐私政策》</a>
              </span>
            </label>
          ) : null}
          <button type="submit" disabled={!isConfigured || isLoading || isSubmitting} className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-300 disabled:cursor-not-allowed disabled:bg-slate-300">
            {isSubmitting ? '处理中…' : mode === 'signin' ? '登录并同步' : '注册账号'}
          </button>
        </form>

        <button type="button" onClick={onContinueAsGuest} className="mt-4 w-full rounded-full bg-white/85 px-5 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:bg-slate-50">继续使用本地模式</button>
      </section>
    </main>
  );
}
