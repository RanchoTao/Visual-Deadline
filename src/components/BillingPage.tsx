import { useCallback, useEffect, useState } from 'react';
import type { SupabaseSession } from '../lib/supabaseClient';
import {
  RECURRING_PLANS,
  createRecurringCheckout,
  getSubscriptionBillingSnapshot,
  isPaddleClientConfigured,
  isRecurringBillingEnabled,
  openBillingPortal,
  openPaddleCheckout,
  type PortalAction,
  type RecurringPlanCode,
  type SubscriptionBillingSnapshot,
} from '../services/billing';
import { MembershipPanel } from './MembershipPanel';

const STATUS_LABEL = {
  trialing: '试用中（当前产品不授权）', active: '生效中', past_due: '付款逾期 · 72 小时有限宽限', paused: '已暂停',
  cancel_scheduled: '已安排期末取消', canceled: '已取消', expired: '已到期',
} as const;

const PAYMENT_LABEL = {
  pending: '同步中', paid: '已支付', failed: '付款失败', partially_refunded: '部分退款', refunded: '全额退款',
} as const;

function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function money(currency: string, minor: number): string {
  try { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(minor / 100); }
  catch { return `${minor} ${currency}`; }
}

export function BillingPage({ session }: { session: SupabaseSession }) {
  const [snapshot, setSnapshot] = useState<SubscriptionBillingSnapshot | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const recurringEnabled = isRecurringBillingEnabled();

  const refresh = useCallback(async () => {
    setError('');
    try { setSnapshot(await getSubscriptionBillingSnapshot(session)); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : '订阅状态读取失败。'); }
  }, [session]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onPaddle = (raw: Event) => {
      const detail = (raw as CustomEvent<{ name?: string }>).detail;
      if (detail?.name !== 'checkout.completed') return;
      setMessage('Payment received / synchronizing subscription. 只有服务端验证的 Paddle 状态会授予 Plus。');
      window.setTimeout(() => void refresh(), 1500);
    };
    window.addEventListener('vd:paddle-event', onPaddle);
    return () => window.removeEventListener('vd:paddle-event', onPaddle);
  }, [refresh]);

  async function subscribe(planCode: RecurringPlanCode) {
    setBusy(planCode); setError(''); setMessage('正在建立安全订阅交易…');
    try {
      const checkout = await createRecurringCheckout(planCode, session);
      await openPaddleCheckout(checkout.transactionId, session.user.email);
      setMessage('支付窗口已打开。浏览器完成事件仅作为提示，Plus 会等待服务端 webhook 验证。');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '订阅交易创建失败。');
      setMessage('');
    } finally { setBusy(null); }
  }

  async function portal(action: PortalAction) {
    const subscription = snapshot?.subscriptions[0];
    if (!subscription) return;
    setBusy(action); setError('');
    try { await openBillingPortal(action, subscription.id, session); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : '订阅管理打开失败。'); setBusy(null); }
  }

  const current = snapshot?.subscriptions[0] ?? null;
  const legacySources = snapshot?.entitlements.filter((row) => row.source_type !== 'subscription' && row.status === 'active') ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-xs font-semibold tracking-[.16em] text-zinc-400">ACCOUNT</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h1 className="text-2xl font-semibold tracking-tight">Subscription & billing</h1><p className="mt-2 text-sm leading-6 text-zinc-500">VD 只根据归一化 entitlement 授权；Paddle 页面和浏览器支付事件都不是权限来源。</p></div>
          <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${snapshot?.entitlement.allowed ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{snapshot?.entitlement.allowed ? 'vd.plus active' : 'Free'}</span>
        </div>
        {snapshot?.entitlement.allowed ? <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Plus 当前由 {snapshot.entitlement.sources.length} 个独立来源共同授权{snapshot.entitlement.validUntil ? `，最长有效至 ${dateTime(snapshot.entitlement.validUntil)}` : ''}。</p> : null}
        {legacySources.length ? <p className="mt-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-800">历史一次性会员仍独立有效：{legacySources.length} 个来源；订阅周期不会被移到历史会员到期之后。</p> : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Recurring Plus</h2><p className="mt-1 text-sm text-zinc-500">目录版本 vd-recurring-v1 · 无试用</p></div><button type="button" onClick={() => void refresh()} className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold">刷新</button></div>
        {current ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-zinc-50 p-4"><p className="text-xs text-zinc-400">状态</p><p className="mt-1 font-semibold">{STATUS_LABEL[current.status]}</p><p className="mt-2 text-xs text-zinc-500">{current.plan_code}</p></div>
            <div className="rounded-xl bg-zinc-50 p-4"><p className="text-xs text-zinc-400">当前计费周期</p><p className="mt-1 text-sm font-semibold">{dateTime(current.current_period_start)} — {dateTime(current.current_period_end)}</p>{current.cancel_at ? <p className="mt-2 text-xs text-amber-700">取消生效：{dateTime(current.cancel_at)}</p> : null}</div>
          </div>
        ) : <p className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-500">目前没有 recurring subscription。</p>}

        {current ? <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void portal('overview')} disabled={Boolean(busy)} className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Manage subscription</button>
          <button type="button" onClick={() => void portal('update_payment')} disabled={Boolean(busy)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold disabled:opacity-50">Update payment method</button>
          <button type="button" onClick={() => void portal('cancel')} disabled={Boolean(busy)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold disabled:opacity-50">Cancel / manage billing</button>
        </div> : null}

        {recurringEnabled ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{RECURRING_PLANS.map((plan) => <button key={plan.code} type="button" onClick={() => void subscribe(plan.code)} disabled={Boolean(busy) || !isPaddleClientConfigured()} className="rounded-xl border border-zinc-200 p-4 text-left disabled:opacity-50"><span className="font-semibold">{plan.label}</span><span className="mt-1 block text-xs text-zinc-500">{plan.intervalLabel} · 无试用</span></button>)}</div> : <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Recurring checkout 默认关闭；已有订阅的 webhook 与 reconciliation 可由独立服务端开关继续运行。</p>}
        {message ? <p role="status" className="mt-4 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-800">{message}</p> : null}
        {error ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Recent payments</h2>
        <div className="mt-3 divide-y divide-zinc-100">{snapshot?.payments.length ? snapshot.payments.map((payment) => <div key={payment.id} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">{payment.kind === 'renewal' ? 'Subscription renewal' : 'Subscription payment'}</p><p className="mt-1 text-xs text-zinc-400">{dateTime(payment.occurred_at)}</p></div><div className="text-right"><p className="text-sm font-semibold">{money(payment.currency, payment.total_minor)}</p><p className="mt-1 text-xs text-zinc-500">{PAYMENT_LABEL[payment.status]}</p></div></div>) : <p className="py-3 text-sm text-zinc-500">暂无 recurring payment references。</p>}</div>
      </section>

      <details className="rounded-2xl border border-zinc-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Legacy one-time Billing v1</summary><div className="mt-4"><MembershipPanel /></div></details>
    </div>
  );
}
