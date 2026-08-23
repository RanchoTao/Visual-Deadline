import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, type SupabaseSession } from '../lib/supabaseClient';
import {
  BILLING_PLANS,
  createBillingCheckout,
  getBillingSnapshot,
  getPlan,
  isActiveMembership,
  isPaddleClientConfigured,
  openPaddleCheckout,
  type BillingOrder,
  type BillingPlanCode,
  type BillingSnapshot,
  type PaddleEvent,
} from '../services/billing';

const ORDER_STATUS_LABEL: Record<BillingOrder['status'], string> = {
  pending: '等待支付',
  paid: '已支付',
  failed: '创建失败',
  canceled: '已取消',
  partially_refunded: '部分退款',
  refunded: '已退款',
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatAmount(order: BillingOrder): string {
  return order.currency === 'CNY' ? `¥${(order.amount_minor / 100).toFixed(0)}` : `${order.amount_minor} ${order.currency}`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function MembershipPanel() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [snapshot, setSnapshot] = useState<BillingSnapshot>({ membership: null, orders: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [buyingPlan, setBuyingPlan] = useState<BillingPlanCode | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const pendingBaselineExpiry = useRef<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    let cancelled = false;

    void supabase.auth.getSession().then((currentSession) => {
      if (!cancelled) setSession(currentSession);
    });
    const subscription = supabase.auth.onAuthStateChange((nextSession) => setSession(nextSession));

    return () => {
      cancelled = true;
      isMounted.current = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  const refresh = useCallback(async (activeSession = session): Promise<BillingSnapshot | null> => {
    if (!activeSession) {
      if (isMounted.current) setSnapshot({ membership: null, orders: [] });
      return null;
    }

    setIsLoading(true);
    setError('');
    try {
      const nextSnapshot = await getBillingSnapshot(activeSession);
      if (isMounted.current) setSnapshot(nextSnapshot);
      return nextSnapshot;
    } catch (nextError) {
      if (isMounted.current) setError(nextError instanceof Error ? nextError.message : '会员状态读取失败。');
      return null;
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) {
      setSnapshot({ membership: null, orders: [] });
      return;
    }
    void refresh(session);
  }, [refresh, session]);

  const waitForServerConfirmation = useCallback(async () => {
    if (!session) return;
    const baselineExpiry = pendingBaselineExpiry.current;

    for (let attempt = 0; attempt < 15; attempt += 1) {
      await sleep(2000);
      const nextSnapshot = await refresh(session);
      const nextExpiry = nextSnapshot?.membership?.expires_at ?? null;
      if (nextSnapshot && nextExpiry && nextExpiry !== baselineExpiry) {
        if (isMounted.current) {
          setMessage(`会员已生效，有效期至 ${formatDateTime(nextExpiry)}。`);
          setBuyingPlan(null);
        }
        pendingBaselineExpiry.current = nextExpiry;
        return;
      }
    }

    if (isMounted.current) {
      setMessage('付款信息已经提交，但服务端仍在确认。Paddle 回调完成后会员会自动生效，你也可以稍后手动刷新。');
      setBuyingPlan(null);
    }
  }, [refresh, session]);

  useEffect(() => {
    const handlePaddleEvent = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<PaddleEvent>;
      if (event.detail?.name !== 'checkout.completed') return;
      setMessage('支付窗口已完成，正在等待 Paddle 服务端回调确认。');
      void waitForServerConfirmation();
    };

    window.addEventListener('vd:paddle-event', handlePaddleEvent);
    return () => window.removeEventListener('vd:paddle-event', handlePaddleEvent);
  }, [waitForServerConfirmation]);

  async function buy(planCode: BillingPlanCode) {
    if (!session) {
      setError('请先登录 VD 后再开通会员。');
      return;
    }
    if (!isPaddleClientConfigured()) {
      setError('支付前端尚未配置 Paddle Client-side Token。');
      return;
    }

    setBuyingPlan(planCode);
    setError('');
    setMessage('正在建立安全支付订单…');
    pendingBaselineExpiry.current = snapshot.membership?.expires_at ?? null;

    try {
      const checkout = await createBillingCheckout(planCode, session);
      await openPaddleCheckout(checkout.transactionId, session.user.email);
      setMessage('支付窗口已打开。只有 Paddle 服务端确认付款后，VD 才会授予会员时长。');
    } catch (nextError) {
      setBuyingPlan(null);
      setError(nextError instanceof Error ? nextError.message : '支付窗口打开失败。');
      setMessage('');
    }
  }

  const membershipActive = isActiveMembership(snapshot.membership);
  const membershipPlan = snapshot.membership ? getPlan(snapshot.membership.plan_code) : null;

  return (
    <section className="rounded-[2rem] border border-white/75 bg-white/80 p-5 shadow-xl shadow-slate-200/60 backdrop-blur md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.22em] text-slate-400">VD MEMBERSHIP</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">大会员</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">首版采用固定期限会员：一次购买一个自然月或一个自然年，不自动续费。支付与会员权限分离，Paddle 只是当前支付通道。</p>
        </div>
        <div className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ring-1 ${membershipActive ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-slate-50 text-slate-500 ring-slate-200'}`}>
          {membershipActive ? `${membershipPlan?.label ?? '会员'} · 已生效` : '当前未开通'}
        </div>
      </div>

      {membershipActive && snapshot.membership ? (
        <div className="mt-5 rounded-3xl bg-emerald-50/70 p-4 ring-1 ring-emerald-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-emerald-600">会员有效期</p>
              <p className="mt-2 text-lg font-semibold text-emerald-950">至 {formatDateTime(snapshot.membership.expires_at)}</p>
            </div>
            <p className="text-xs leading-5 text-emerald-700">再次购买会从当前有效期末尾继续累加，不会覆盖剩余时长。</p>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {BILLING_PLANS.map((plan) => {
          const isYearly = plan.code === 'vd_yearly';
          const isBuying = buyingPlan === plan.code;
          return (
            <article key={plan.code} className={`relative rounded-[1.75rem] p-5 ring-1 ${isYearly ? 'bg-slate-950 text-white ring-slate-900' : 'bg-slate-50/85 text-slate-900 ring-white'}`}>
              {isYearly ? <span className="absolute right-4 top-4 rounded-full bg-white/12 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/20">推荐</span> : null}
              <p className={`text-sm font-semibold ${isYearly ? 'text-slate-300' : 'text-slate-500'}`}>{plan.label}</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-4xl font-semibold tracking-tight">¥{plan.priceCny}</span>
                <span className={`pb-1 text-sm ${isYearly ? 'text-slate-400' : 'text-slate-500'}`}>/ {plan.durationLabel}</span>
              </div>
              <p className={`mt-3 text-xs leading-5 ${isYearly ? 'text-slate-300' : 'text-slate-500'}`}>
                {isYearly ? '相比连续购买 12 个月共 ¥228，年费节省 ¥29。' : '适合先体验完整会员身份与后续会员能力。'}
              </p>
              <button
                type="button"
                onClick={() => void buy(plan.code)}
                disabled={!session || Boolean(buyingPlan)}
                className={`mt-5 w-full rounded-full px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${isYearly ? 'bg-white text-slate-950 hover:bg-slate-100' : 'bg-slate-950 text-white hover:bg-slate-800'}`}
              >
                {!session ? '登录后开通' : isBuying ? '正在建立订单…' : membershipActive ? `续费 ${plan.label}` : `开通 ${plan.label}`}
              </button>
            </article>
          );
        })}
      </div>

      {!isPaddleClientConfigured() ? (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700 ring-1 ring-amber-100">支付 UI 已接入，但当前部署还缺少 Paddle Client-side Token；完成环境变量配置后即可打开真实或 Sandbox Checkout。</p>
      ) : null}
      {message ? <p role="status" className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-700 ring-1 ring-sky-100">{message}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-semibold leading-5 text-rose-700 ring-1 ring-rose-100">{error}</p> : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">支付与会员记录</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">浏览器不能自行授予会员；只有经过签名验证的服务端支付事件可以改变会员状态。</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={!session || isLoading} className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50">
          {isLoading ? '刷新中…' : '刷新会员状态'}
        </button>
      </div>

      {session && snapshot.orders.length ? (
        <div className="mt-4 overflow-hidden rounded-3xl ring-1 ring-slate-100">
          {snapshot.orders.map((order, index) => (
            <div key={order.id} className={`flex flex-col gap-2 bg-white/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${index ? 'border-t border-slate-100' : ''}`}>
              <div>
                <p className="text-sm font-semibold text-slate-800">{getPlan(order.plan_code).label} · {formatAmount(order)}</p>
                <p className="mt-1 text-xs text-slate-400">{formatDateTime(order.created_at)} · {order.id.slice(0, 8)}</p>
              </div>
              <span className="w-fit rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-100">{ORDER_STATUS_LABEL[order.status]}</span>
            </div>
          ))}
        </div>
      ) : session ? (
        <p className="mt-4 rounded-2xl bg-slate-50/80 px-4 py-3 text-xs text-slate-500">暂无支付记录。</p>
      ) : (
        <p className="mt-4 rounded-2xl bg-slate-50/80 px-4 py-3 text-xs text-slate-500">登录后可以查看会员状态和自己的支付记录。</p>
      )}

      <p className="mt-5 text-xs leading-5 text-slate-400">购买即表示你已阅读并同意 <a href="/terms" className="font-semibold text-slate-600 underline decoration-slate-300 underline-offset-2">用户协议</a> 与 <a href="/privacy" className="font-semibold text-slate-600 underline decoration-slate-300 underline-offset-2">隐私政策</a>。退款申请按当前退款规则处理；获批的全额退款会撤销对应会员时长。</p>
    </section>
  );
}
