import { useEffect, useState, type FormEvent } from 'react';
import { getAuthErrorMessage } from '../constants/authMessages';
import type { AuthDebugEntry } from '../lib/authDebug';
import type { AuthFeatureFlags } from '../lib/authFeatures';
import { initialAuthPortalMode, isAvailableAuthPortalMode, isSixDigitOtp, nextModeAfterEmailSignup, normalizeChinaPhoneDigits, type AuthPortalMode } from '../lib/authPortalState';
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
  onRequestPasswordReset: (email: string) => Promise<unknown>;
  onVerifyEmailOtp: (email: string, token: string) => Promise<unknown>;
  featureFlags: AuthFeatureFlags;
  onOAuth: (provider: IdentityProvider['provider']) => Promise<unknown>;
  onRequestPhoneOtp: (phone: string) => Promise<unknown>;
  onVerifyPhoneOtp: (phone: string, token: string) => Promise<unknown>;
  phoneResendRemainingMs: number;
  emailResendRemainingMs: number;
  onContinueAsGuest: () => void;
}

function secondsLabel(remainingMs: number): string { return `${Math.ceil(remainingMs / 1_000)} 秒后可重发`; }

export function AuthPanel(props: AuthPanelProps) {
  const { isConfigured, isLoading, error, status: authStatus, authDebugInfo, onSignIn, onSignUp, onResendVerification, onRequestPasswordReset, onVerifyEmailOtp, featureFlags, onOAuth, onRequestPhoneOtp, onVerifyPhoneOtp, phoneResendRemainingMs, emailResendRemainingMs, onContinueAsGuest } = props;
  const [mode, setMode] = useState<AuthPortalMode>(() => initialAuthPortalMode(featureFlags.phone));
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState('');
  const [phoneDigits, setPhoneDigits] = useState(''); const [phoneOtp, setPhoneOtp] = useState(''); const [phoneCodeSent, setPhoneCodeSent] = useState(false); const [emailOtp, setEmailOtp] = useState('');
  const [verificationEmail, setVerificationEmail] = useState(''); const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [formError, setFormError] = useState<string>(); const [localStatus, setLocalStatus] = useState<string>(); const [isSubmitting, setIsSubmitting] = useState(false);
  const [debugCopyStatus, setDebugCopyStatus] = useState<string>();

  useEffect(() => { setLocalStatus(authStatus); }, [authStatus]);
  useEffect(() => { if (!isAvailableAuthPortalMode(mode, featureFlags.phone)) setMode('password'); }, [featureFlags.phone, mode]);

  const resetNotice = () => { setFormError(undefined); setLocalStatus(undefined); };
  const switchMode = (next: AuthPortalMode) => { resetNotice(); setMode(next); };
  const submitError = (cause: unknown) => setFormError(getAuthErrorMessage(cause, '认证失败，请稍后重试。'));
  const phone = `+86${normalizeChinaPhoneDigits(phoneDigits)}`;

  async function handlePhoneRequest() {
    resetNotice(); if (!/^1[3-9]\d{9}$/.test(normalizeChinaPhoneDigits(phoneDigits))) { setFormError('请输入有效的中国大陆手机号。'); return; }
    setIsSubmitting(true); try { await onRequestPhoneOtp(phone); setPhoneCodeSent(true); setLocalStatus('验证码已发送，请在有效期内输入。'); } catch (cause) { submitError(cause); } finally { setIsSubmitting(false); }
  }
  async function handlePhoneVerify() {
    resetNotice(); if (!isSixDigitOtp(phoneOtp)) { setFormError('请输入 6 位验证码。'); return; }
    setIsSubmitting(true); try { await onVerifyPhoneOtp(phone, phoneOtp); setLocalStatus('登录成功。'); } catch (cause) { submitError(cause); } finally { setIsSubmitting(false); }
  }
  async function handlePasswordSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); resetNotice(); if (!email.trim() || !password) { setFormError('请输入邮箱和密码。'); return; }
    setIsSubmitting(true); try { await onSignIn(email.trim(), password); } catch (cause) { submitError(cause); } finally { setIsSubmitting(false); }
  }
  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); resetNotice(); const cleanEmail = email.trim();
    if (!cleanEmail || password.length < 6) { setFormError('请输入有效邮箱，并使用至少 6 位密码。'); return; }
    if (password !== confirmPassword) { setFormError('两次输入的密码不一致。'); return; }
    if (!acceptedPolicies) { setFormError('请先阅读并同意用户协议与隐私政策。'); return; }
    setIsSubmitting(true);
    try { const result = await onSignUp(cleanEmail, password); if (nextModeAfterEmailSignup(result) === 'email-otp') { setVerificationEmail(cleanEmail); setMode('email-otp'); setLocalStatus('验证码已发送至你的邮箱。'); } }
    catch (cause) { submitError(cause); } finally { setIsSubmitting(false); }
  }
  async function handleEmailVerify() {
    resetNotice(); if (!isSixDigitOtp(emailOtp)) { setFormError('请输入 6 位验证码。'); return; }
    setIsSubmitting(true); try { await onVerifyEmailOtp(verificationEmail, emailOtp); setLocalStatus('邮箱验证成功。'); } catch (cause) { submitError(cause); } finally { setIsSubmitting(false); }
  }
  async function handleEmailResend() { resetNotice(); setIsSubmitting(true); try { await onResendVerification(verificationEmail || email.trim()); setLocalStatus('验证码已重新发送，请检查收件箱和垃圾邮件。'); } catch (cause) { submitError(cause); } finally { setIsSubmitting(false); } }
  async function handlePasswordReset() { resetNotice(); if (!email.trim()) { setFormError('请先输入你的邮箱。'); return; } setIsSubmitting(true); try { await onRequestPasswordReset(email.trim()); } catch (cause) { submitError(cause); } finally { setIsSubmitting(false); } }
  async function handleOAuth(provider: IdentityProvider['provider']) { resetNotice(); setIsSubmitting(true); try { await onOAuth(provider); } catch (cause) { submitError(cause); } finally { setIsSubmitting(false); } }
  async function handleCopyDebugInfo() { if (!authDebugInfo) return; try { await navigator.clipboard.writeText(JSON.stringify(authDebugInfo, null, 2)); setDebugCopyStatus('调试信息已复制。'); } catch { setDebugCopyStatus('复制失败，请打开控制台查看调试日志。'); } }

  const disabled = !isConfigured || isLoading || isSubmitting;
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_32%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-xl rounded-[2rem] border border-white/80 bg-white/85 p-7 shadow-2xl shadow-slate-300/60 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">VD 云同步</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">登录以启用云同步</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">登录后，任务、目标与压力历史会按你的用户 ID 隔离同步；也可以继续使用本机 localStorage。</p>
        {!isConfigured && !error ? <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">Supabase 环境变量未配置。</p> : null}
        {isLoading ? <p className="mt-5 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-700">正在恢复登录状态…</p> : null}
        {error || formError ? <p className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{formError || error}</p> : null}
        {localStatus ? <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{localStatus}</p> : null}
        {authDebugInfo ? <div className="mt-3 flex gap-2 text-xs text-slate-500"><button type="button" onClick={handleCopyDebugInfo} className="rounded-full bg-white px-3 py-1.5 font-semibold ring-1 ring-slate-200">复制调试信息</button>{debugCopyStatus ? <span>{debugCopyStatus}</span> : null}</div> : null}

        {mode !== 'signup' && mode !== 'email-otp' ? <div className={`mt-6 grid gap-2 rounded-full bg-slate-100 p-1 text-sm font-semibold text-slate-500 ${featureFlags.phone ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {featureFlags.phone ? <button type="button" onClick={() => switchMode('phone')} className={`rounded-full px-4 py-2 ${mode === 'phone' ? 'bg-white text-slate-900 shadow-sm' : ''}`}>验证码登录</button> : null}
          <button type="button" onClick={() => switchMode('password')} className={`rounded-full px-4 py-2 ${mode === 'password' ? 'bg-white text-slate-900 shadow-sm' : ''}`}>密码登录</button>
        </div> : null}

        {mode === 'phone' && featureFlags.phone ? <section className="mt-5 space-y-4"><label className="block text-sm font-semibold text-slate-600">手机号<div className="mt-2 flex rounded-2xl border border-slate-200 bg-white focus-within:border-sky-300 focus-within:ring-4 focus-within:ring-sky-100/70"><span className="px-4 py-3 text-slate-500">+86</span><input value={phoneDigits} onChange={(event) => setPhoneDigits(normalizeChinaPhoneDigits(event.target.value))} inputMode="numeric" autoComplete="tel-national" placeholder="请输入手机号" className="min-w-0 flex-1 rounded-r-2xl bg-transparent py-3 pr-4 outline-none" /></div></label>
          <button type="button" disabled={disabled || phoneResendRemainingMs > 0} onClick={() => void handlePhoneRequest()} className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:bg-slate-300">{phoneResendRemainingMs > 0 ? secondsLabel(phoneResendRemainingMs) : isSubmitting ? '发送中…' : phoneCodeSent ? '重新获取验证码' : '获取验证码'}</button>
          {phoneCodeSent ? <><label className="block text-sm font-semibold text-slate-600">6 位验证码<input value={phoneOtp} onChange={(event) => setPhoneOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label><button type="button" disabled={disabled} onClick={() => void handlePhoneVerify()} className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:bg-slate-300">登录 / 注册</button></> : null}
          <p className="text-center text-xs leading-5 text-slate-400">未注册手机号验证成功后自动创建账号。<br />登录即代表你已阅读并同意 <a href="/terms" className="text-sky-700">《用户协议》</a> 和 <a href="/privacy" className="text-sky-700">《隐私政策》</a>。</p></section> : null}

        {mode === 'password' ? <form onSubmit={handlePasswordSignIn} className="mt-5 space-y-4"><label className="block text-sm font-semibold text-slate-600">邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label><label className="block text-sm font-semibold text-slate-600">密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label><div className="flex justify-between text-xs font-semibold text-slate-500"><button type="button" onClick={() => void handlePasswordReset()} disabled={disabled}>忘记密码？</button>{featureFlags.emailSignup ? <button type="button" onClick={() => switchMode('signup')}>邮箱注册</button> : null}</div><button type="submit" disabled={disabled} className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:bg-slate-300">{isSubmitting ? '处理中…' : '登录并同步'}</button></form> : null}

        {mode === 'signup' ? <form onSubmit={handleSignUp} className="mt-6 space-y-4"><div><p className="text-sm font-semibold text-slate-500">创建账号</p><h2 className="mt-1 text-2xl font-semibold text-slate-950">用邮箱开始同步</h2></div><label className="block text-sm font-semibold text-slate-600">邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label><label className="block text-sm font-semibold text-slate-600">密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label><label className="block text-sm font-semibold text-slate-600">确认密码<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label><label className="flex gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600"><input type="checkbox" checked={acceptedPolicies} onChange={(event) => setAcceptedPolicies(event.target.checked)} /><span>我已阅读并同意 <a href="/terms" className="text-sky-700">《用户协议》</a> 和 <a href="/privacy" className="text-sky-700">《隐私政策》</a></span></label><button type="submit" disabled={disabled} className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:bg-slate-300">注册并获取验证码</button><button type="button" onClick={() => switchMode('password')} className="w-full text-sm font-semibold text-slate-500">返回登录</button></form> : null}

        {mode === 'email-otp' ? <section className="mt-6 space-y-4"><p className="text-sm font-semibold text-slate-500">邮箱验证</p><h2 className="text-2xl font-semibold text-slate-950">输入邮件中的 6 位验证码</h2><p className="text-sm text-slate-500">已发送至 {verificationEmail}。验证链接仍然可以使用。</p><label className="block text-sm font-semibold text-slate-600">验证码<input value={emailOtp} onChange={(event) => setEmailOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none" /></label><button type="button" disabled={disabled} onClick={() => void handleEmailVerify()} className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:bg-slate-300">验证邮箱</button><button type="button" disabled={disabled || emailResendRemainingMs > 0} onClick={() => void handleEmailResend()} className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 disabled:text-slate-300">{emailResendRemainingMs > 0 ? secondsLabel(emailResendRemainingMs) : '重新发送验证码'}</button><button type="button" onClick={() => switchMode('password')} className="w-full text-sm font-semibold text-slate-500">返回登录</button></section> : null}

        {featureFlags.google || featureFlags.github || featureFlags.x ? <section className="mt-5 border-t border-slate-100 pt-5"><p className="text-center text-xs font-semibold text-slate-400">其他登录方式</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{featureFlags.google ? <button type="button" disabled={disabled} onClick={() => void handleOAuth('google')} className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">Google</button> : null}{featureFlags.github ? <button type="button" disabled={disabled} onClick={() => void handleOAuth('github')} className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">GitHub</button> : null}{featureFlags.x ? <button type="button" disabled={disabled} onClick={() => void handleOAuth('x')} className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">X</button> : null}</div></section> : null}
        <button type="button" onClick={onContinueAsGuest} className="mt-4 w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">继续使用本地模式</button>
      </section>
    </main>
  );
}
