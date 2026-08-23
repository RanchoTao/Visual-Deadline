import { supabase, type SupabaseSession } from '../lib/supabaseClient';

export type BillingPlanCode = 'vd_monthly' | 'vd_yearly';
export type BillingOrderStatus = 'pending' | 'paid' | 'failed' | 'canceled' | 'partially_refunded' | 'refunded';

export interface BillingPlan {
  code: BillingPlanCode;
  label: string;
  priceCny: number;
  durationLabel: string;
}

export interface MembershipRecord {
  user_id: string;
  plan_code: BillingPlanCode;
  starts_at: string;
  expires_at: string;
  source: 'paddle' | 'admin_grant';
  updated_at: string;
}

export interface BillingOrder {
  id: string;
  plan_code: BillingPlanCode;
  amount_minor: number;
  currency: 'CNY';
  status: BillingOrderStatus;
  provider_transaction_id: string | null;
  checkout_created_at: string;
  paid_at: string | null;
  refunded_at: string | null;
  created_at: string;
}

export interface BillingSnapshot {
  membership: MembershipRecord | null;
  orders: BillingOrder[];
}

interface CheckoutResponse {
  ok: boolean;
  orderId: string;
  transactionId: string;
  planCode: BillingPlanCode;
  amountMinor: number;
  currency: 'CNY';
}

export interface PaddleEvent {
  name?: string;
  data?: unknown;
}

interface PaddleSdk {
  Environment: {
    set: (environment: 'sandbox') => void;
  };
  Initialize: (options: {
    token: string;
    eventCallback?: (event: PaddleEvent) => void;
  }) => void;
  Checkout: {
    open: (options: {
      transactionId: string;
      customer?: { email: string };
      settings?: {
        displayMode?: 'overlay';
        theme?: 'light' | 'dark';
      };
    }) => void;
  };
}

declare global {
  interface Window {
    Paddle?: PaddleSdk;
    __vdPaddleInitialized?: boolean;
  }
}

export const BILLING_PLANS: readonly BillingPlan[] = [
  { code: 'vd_monthly', label: '月会员', priceCny: 19, durationLabel: '1 个自然月' },
  { code: 'vd_yearly', label: '年会员', priceCny: 199, durationLabel: '1 个自然年' },
];

const PADDLE_CLIENT_TOKEN = (import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined)?.trim() || '';
const PADDLE_ENVIRONMENT = ((import.meta.env.VITE_PADDLE_ENVIRONMENT as string | undefined)?.trim().toLowerCase() || 'sandbox') === 'production'
  ? 'production'
  : 'sandbox';

let paddleScriptPromise: Promise<PaddleSdk> | null = null;

function billingApiError(payload: unknown, fallback: string): Error {
  if (payload && typeof payload === 'object') {
    const candidate = payload as Record<string, unknown>;
    if (typeof candidate.error === 'string' && candidate.error) return new Error(candidate.error);
  }
  return new Error(fallback);
}

async function parseApiJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function loadPaddleScript(): Promise<PaddleSdk> {
  if (typeof window === 'undefined') return Promise.reject(new Error('当前环境无法打开支付窗口。'));
  if (window.Paddle) return Promise.resolve(window.Paddle);
  if (paddleScriptPromise) return paddleScriptPromise;

  paddleScriptPromise = new Promise<PaddleSdk>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-vd-paddle="true"]');
    const script = existing ?? document.createElement('script');

    const handleLoad = () => {
      if (window.Paddle) resolve(window.Paddle);
      else reject(new Error('Paddle.js 已加载，但没有初始化支付接口。'));
    };
    const handleError = () => reject(new Error('Paddle.js 加载失败，请检查网络后重试。'));

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });

    if (!existing) {
      script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
      script.async = true;
      script.dataset.vdPaddle = 'true';
      document.head.appendChild(script);
    }
  });

  return paddleScriptPromise;
}

async function initializePaddle(): Promise<PaddleSdk> {
  if (!PADDLE_CLIENT_TOKEN) throw new Error('Paddle 客户端令牌尚未配置。');
  const paddle = await loadPaddleScript();
  if (window.__vdPaddleInitialized) return paddle;

  if (PADDLE_ENVIRONMENT === 'sandbox') paddle.Environment.set('sandbox');
  paddle.Initialize({
    token: PADDLE_CLIENT_TOKEN,
    eventCallback: (event) => {
      window.dispatchEvent(new CustomEvent<PaddleEvent>('vd:paddle-event', { detail: event }));
    },
  });
  window.__vdPaddleInitialized = true;
  return paddle;
}

export function isPaddleClientConfigured(): boolean {
  return Boolean(PADDLE_CLIENT_TOKEN);
}

export function isActiveMembership(membership: MembershipRecord | null, now = new Date()): boolean {
  if (!membership) return false;
  const expiresAt = new Date(membership.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

export function getPlan(planCode: BillingPlanCode): BillingPlan {
  return BILLING_PLANS.find((plan) => plan.code === planCode) ?? BILLING_PLANS[0];
}

export async function getBillingSnapshot(session: SupabaseSession): Promise<BillingSnapshot> {
  const userId = encodeURIComponent(session.user.id);
  const [memberships, orders] = await Promise.all([
    supabase.rest<MembershipRecord[]>(
      `memberships?select=user_id,plan_code,starts_at,expires_at,source,updated_at&user_id=eq.${userId}&limit=1`,
      {},
      session,
    ),
    supabase.rest<BillingOrder[]>(
      `billing_orders?select=id,plan_code,amount_minor,currency,status,provider_transaction_id,checkout_created_at,paid_at,refunded_at,created_at&user_id=eq.${userId}&order=created_at.desc&limit=8`,
      {},
      session,
    ),
  ]);

  return {
    membership: memberships[0] ?? null,
    orders: Array.isArray(orders) ? orders : [],
  };
}

export async function createBillingCheckout(planCode: BillingPlanCode, session: SupabaseSession): Promise<CheckoutResponse> {
  const response = await fetch('/api/billing-checkout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ planCode }),
  });
  const payload = await parseApiJson(response);
  if (!response.ok) throw billingApiError(payload, '暂时无法创建支付订单。');
  if (!payload || typeof payload !== 'object') throw new Error('支付服务返回了无效响应。');

  const checkout = payload as Partial<CheckoutResponse>;
  if (!checkout.ok || typeof checkout.orderId !== 'string' || typeof checkout.transactionId !== 'string') {
    throw new Error('支付服务没有返回有效订单。');
  }
  return checkout as CheckoutResponse;
}

export async function openPaddleCheckout(transactionId: string, email?: string): Promise<void> {
  const paddle = await initializePaddle();
  paddle.Checkout.open({
    transactionId,
    customer: email ? { email } : undefined,
    settings: { displayMode: 'overlay', theme: 'light' },
  });
}
