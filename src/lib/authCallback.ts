export interface CallbackSession { readonly access_token: string; readonly refresh_token: string; readonly user: { readonly id: string }; }

export interface AuthCallbackPayload {
  readonly code: string | null;
  readonly type: string | null;
  readonly error: string | null;
  readonly errorCode: string | null;
}

export interface AuthCallbackPort {
  getSession(): Promise<CallbackSession | null>;
  exchangeCodeForSession(code: string): Promise<CallbackSession | null>;
}

export interface AuthCallbackEnvironment {
  readonly href: string;
  readonly sessionStorage: Pick<Storage, 'getItem' | 'setItem'>;
  replaceUrl(nextUrl: string): void;
}

const CALLBACK_PARAMS = ['access_token', 'refresh_token', 'expires_in', 'token_type', 'type', 'code', 'state', 'error', 'error_code', 'error_description'];
const MARKER_PREFIX = 'vd.auth.callback.consumed.sha256:';

export function readAuthCallbackParams(href: string): AuthCallbackPayload | null {
  const url = new URL(href);
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const get = (name: string) => query.get(name) ?? hash.get(name);
  if (!CALLBACK_PARAMS.some((name) => query.has(name) || hash.has(name))) return null;
  return { code: get('code'), type: get('type'), error: get('error_description') ?? get('error'), errorCode: get('error_code') };
}

export function cleanAuthCallbackUrl(href: string): string {
  const url = new URL(href);
  CALLBACK_PARAMS.forEach((name) => url.searchParams.delete(name));
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  CALLBACK_PARAMS.forEach((name) => hash.delete(name));
  url.hash = hash.toString() ? `#${hash.toString()}` : '';
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function callbackCodeMarker(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return `${MARKER_PREFIX}${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Explicit SPA callback owner. The raw authorization code never leaves this call. */
export async function handleExplicitAuthCallback(port: AuthCallbackPort, environment: AuthCallbackEnvironment): Promise<{ session: CallbackSession | null; status?: 'verified' } | null> {
  const callback = readAuthCallbackParams(environment.href);
  if (!callback) return null;
  let preserveRetryableCallback = false;
  try {
    if (callback.error) throw new Error(callback.errorCode === 'otp_expired' ? 'EMAIL_LINK_EXPIRED' : 'AUTH_CALLBACK_PROVIDER_ERROR');
    if (callback.code) {
      if (callback.code.length > 4096) throw new Error('AUTH_CALLBACK_MALFORMED');
      const marker = await callbackCodeMarker(callback.code);
      if (environment.sessionStorage.getItem(marker)) return { session: await port.getSession() };
      let session: CallbackSession | null;
      try { session = await port.exchangeCodeForSession(callback.code); }
      catch (error) { preserveRetryableCallback = true; throw error; }
      if (!session) { preserveRetryableCallback = true; throw new Error('AUTH_CALLBACK_SESSION_MISSING'); }
      // Only a completed one-use exchange is marked consumed. A transient failure
      // must remain retryable after reload, without persisting the raw code.
      environment.sessionStorage.setItem(marker, 'consumed');
      return { session };
    }
    if (callback.type === 'signup' || callback.type === 'recovery') return { session: null, status: 'verified' };
    return null;
  } finally {
    // Keep only a retryable failed code in the address bar. It is never copied to
    // app storage/logging, and the next callback attempt can still consume it.
    if (!preserveRetryableCallback) environment.replaceUrl(cleanAuthCallbackUrl(environment.href));
  }
}
