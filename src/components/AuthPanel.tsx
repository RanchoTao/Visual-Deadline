import { useEffect, useState, type FormEvent } from 'react';
import {
  EMAIL_LINK_EXPIRED_MESSAGE,
  EMAIL_MAYBE_REGISTERED_MESSAGE,
  EMAIL_NOT_CONFIRMED_MESSAGE,
  EMAIL_SESSION_MISSING_MESSAGE,
  EMAIL_VERIFICATION_RESENT_MESSAGE,
  EMAIL_VERIFICATION_SENT_MESSAGE,
  getAuthErrorMessage,
} from '../constants/authMessages';
import type { AuthDebugEntry } from '../lib/authDebug';
import type { AuthFeatureFlags } from '../lib/authFeatures';
import type { IdentityProvider } from '../lib/supabaseClient';
interface AuthPanelProps {
  isConfigured: boolean;
  isLoading: boolean;
  error?: string;
  status?: string;
  authDebugInfo?: AuthDebugEntry;
  onSignIn: (email: string, password: string) => Promise<unknown>;
  onSignUp: (email: string, password: string) => Promise<unknown>;
  onResendVerification: (email: string) => Promise<unknown>;
  featureFlags: AuthFeatureFlags;
  onOAuth: (provider: IdentityProvider['provider']) => Promise<unknown>;
  onRequestPhoneOtp: (phone: string) => Promise<unknown>;
  onVerifyPhoneOtp: (phone: string, token: string) => Promise<unknown>;
  phoneResendRemainingMs: number;
  onContinueAsGuest: () => void;
}

export function AuthPanel({ isConfigured, isLoading, error, status: authStatus, authDebugInfo, onSignIn, onSignUp, onResendVerification, featureFlags, onOAuth, onRequestPhoneOtp, onVerifyPhoneOtp, phoneResendRemainingMs, onContinueAsGuest }: AuthPanelProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | undefined>(authStatus);
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAcceptedPolicies, setHasAcceptedPolicies] = useState(false);
  const [debugCopyStatus, setDebugCopyStatus] = useState<string | undefined>();
  const [verificationEmail, setVerificationEmail] = useState<string | undefined>();
  const [phone, setPhone] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneStage, setPhoneStage] = useState<'entry' | 'sending' | 'code' | 'verifying'>('entry');

  useEffect(() => {
    setStatus(authStatus);
  }, [authStatus]);

  function getSubmitErrorMessage(submitError: unknown): string {
    const message = submitError instanceof Error ? submitError.message : '认证失败，请稍后重试。';
    return getAuthErrorMessage(submitError, message);
  }

  function switchMode(nextMode: 'signin' | 'signup') {
    setMode(nextMode);
    setFormError(undefined);
    setStatus(undefined);
    setVerificationEmail(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    setStatus(undefined);
    const cleanEmail = email.trim();
    if (!cleanEmail || password.length < 6) {
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
        await onSignIn(cleanEmail, password);
      } else {
        await onSignUp(cleanEmail, password);
        setVerificationEmail(cleanEmail);
        setStatus(EMAIL_VERIFICATION_SENT_MESSAGE);
      }
    } catch (submitError) {
      const message = getSubmitErrorMessage(submitError);
      if (message === EMAIL_NOT_CONFIRMED_MESSAGE || message === EMAIL_SESSION_MISSING_MESSAGE || message === EMAIL_MAYBE_REGISTERED_MESSAGE) {
        setVerificationEmail(cleanEmail);
      }
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendVerification() {
    setFormError(undefined);
    setStatus(undefined);
    const cleanEmail = verificationEmail ?? email.trim();
    if (!cleanEmail) {
      setFormError('请输入邮箱后再重新发送验证邮件。');
      return;
    }

    setIsSubmitting(true);
    try {
      await onResendVerification(cleanEmail);
      setVerificationEmail(cleanEmail);
      setStatus(EMAIL_VERIFICATION_RESENT_MESSAGE);
    } catch (resendError) {
      setFormError(resendError instanceof Error ? resendError.message : '重新发送验证邮件失败，请稍后重试。');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOAuth(provider: IdentityProvider['provider']) {
    setFormError(undefined); setStatus(undefined); setIsSubmitting(true);
    try { await onOAuth(provider); }
    catch (oauthError) { setFormError(getSubmitErrorMessage(oauthError)); }
    finally { setIsSubmitting(false); }
  }

  async function handlePhoneRequest() {
    setFormError(undefined); setStatus(undefined); setPhoneStage('sending');
    try { await onRequestPhoneOtp(phone); setPhoneStage('code'); setStatus('验证码已发送。请在有效期内输入验证码。'); }
    catch (phoneError) { setPhoneStage('entry'); setFormError(getSubmitErrorMessage(phoneError)); }
  }

  async function handlePhoneVerify() {
    setFormError(undefined); setStatus(undefined); setPhoneStage('verifying');
    try { await onVerifyPhoneOtp(phone, phoneOtp); setStatus('手机号验证成功。'); }
    catch (phoneError) { setPhoneStage('code'); setFormError(getSubmitErrorMessage(phoneError)); }
  }

  function handleGoToSignIn() {
    if (verificationEmail) setEmail(verificationEmail);
    setMode('signin');
    setVerificationEmail(undefined);
    setFormError(undefined);
    setStatus(undefined);
  }

  async function handleCopyDebugInfo() {
    if (!authDebugInfo) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(authDebugInfo, null, 2));
      setDebugCopyStatus('调试信息已复制。');
    } catch {
      setDebugCopyStatus('复制失败，请打开控制台查看调试日志。');
    }
  }

  const shouldShowVerificationActions = Boolean(verificationEmail) || error === EMAIL_LINK_EXPIRED_MESSAGE;

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
        {authDebugInfo ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <button type="button" onClick={handleCopyDebugInfo} className="rounded-full bg-white/85 px-3 py-1.5 font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900">复制调试信息</button>
            {debugCopyStatus ? <span>{debugCopyStatus}</span> : null}
          </div>
        ) : null}

        {shouldShowVerificationActions ? (
          <div className="mt-6 rounded-[1.75rem] bg-slate-50/80 p-4 ring-1 ring-white/90">
            <p className="text-sm font-semibold text-slate-700">请验证邮箱</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{verificationEmail ? `验证邮件已发送至 ${verificationEmail}。验证完成后请返回登录。` : '请输入邮箱后重新发送验证邮件。'}</p>
            {!verificationEmail ? (
              <label className="mt-3 block text-sm font-semibold text-slate-600">邮箱
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100/70" autoComplete="email" />
              </label>
            ) : null}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={handleResendVerification} disabled={!isConfigured || isLoading || isSubmitting} className="rounded-full bg-white/85 px-5 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">重新发送验证邮件</button>
              <button type="button" onClick={handleGoToSignIn} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-300">返回登录</button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-2 rounded-full bg-slate-100 p-1 text-sm font-semibold text-slate-500">
              <button type="button" onClick={() => switchMode('signin')} className={`rounded-full px-4 py-2 transition ${mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-700'}`}>登录</button>
              <button type="button" onClick={() => switchMode('signup')} className={`rounded-full px-4 py-2 transition ${mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-700'}`}>注册</button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <label className="block text-sm font-semibold text-slate-600">邮箱
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100/70" autoComplete="email" />
              </label>
              <label className="block text-sm font-semibold text-slate-600">密码
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100/70" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
              </label>
              {mode === 'signin' ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={!isConfigured || isLoading || isSubmitting}
                    className="text-xs font-semibold text-slate-500 underline-offset-4 transition hover:text-slate-800 hover:underline disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    重新发送验证邮件
                  </button>
                </div>
              ) : null}
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
            {featureFlags.google || featureFlags.github || featureFlags.x || featureFlags.phone ? (
              <section className="mt-5 border-t border-slate-100 pt-5" aria-label="其他登录方式">
                <p className="text-center text-xs font-semibold text-slate-400">其他登录方式</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {featureFlags.google ? <button type="button" disabled={!isConfigured || isSubmitting} onClick={() => void handleOAuth('google')} className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 disabled:opacity-40">Google</button> : null}
                  {featureFlags.github ? <button type="button" disabled={!isConfigured || isSubmitting} onClick={() => void handleOAuth('github')} className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 disabled:opacity-40">GitHub</button> : null}
                  {featureFlags.x ? <button type="button" disabled={!isConfigured || isSubmitting} onClick={() => void handleOAuth('x')} className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 disabled:opacity-40">X</button> : null}
                </div>
                {featureFlags.phone ? <div className="mt-3 rounded-2xl bg-slate-50 p-3"><label className="block text-xs font-semibold text-slate-600">手机号（E.164）<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+8613812345678" disabled={phoneStage === 'sending' || phoneStage === 'verifying'} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" /></label>{phoneStage === 'code' || phoneStage === 'verifying' ? <label className="mt-2 block text-xs font-semibold text-slate-600">验证码<input value={phoneOtp} onChange={(event) => setPhoneOtp(event.target.value)} inputMode="numeric" autoComplete="one-time-code" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" /></label> : null}<div className="mt-3 flex gap-2"><button type="button" disabled={!isConfigured || phoneStage === 'sending' || phoneStage === 'verifying'} onClick={() => void (phoneStage === 'code' ? handlePhoneVerify() : handlePhoneRequest())} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{phoneStage === 'sending' ? '发送中…' : phoneStage === 'verifying' ? '验证中…' : phoneStage === 'code' ? '验证验证码' : '发送验证码'}</button>{phoneStage === 'code' ? <button type="button" disabled={!isConfigured || phoneResendRemainingMs > 0} onClick={() => void handlePhoneRequest()} className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 disabled:opacity-40">{phoneResendRemainingMs > 0 ? `${Math.ceil(phoneResendRemainingMs / 1000)} 秒后可重发` : '重新发送'}</button> : null}</div></div> : null}
              </section>
            ) : null}
          </>
        )}

        <button type="button" onClick={onContinueAsGuest} className="mt-4 w-full rounded-full bg-white/85 px-5 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:bg-slate-50">继续使用本地模式</button>
      </section>
    </main>
  );
}
