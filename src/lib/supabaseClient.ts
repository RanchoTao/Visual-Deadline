import { recordAuthDebugError } from './authDebug';
export interface SupabaseUser {
  id: string;
  email?: string;
  identities?: unknown[];
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: SupabaseUser;
}

type AuthChangeCallback = (session: SupabaseSession | null) => void;

export class SupabaseRestError extends Error {
  status: number;
  code?: string;
  details?: string;
  hint?: string;

  constructor(message: string, response: Response, body: Record<string, unknown> | null) {
    super(message);
    this.name = 'SupabaseRestError';
    this.status = response.status;
    this.code = typeof body?.code === 'string' ? body.code : undefined;
    this.details = typeof body?.details === 'string' ? body.details : undefined;
    this.hint = typeof body?.hint === 'string' ? body.hint : undefined;
  }
}

interface EmailPasswordCredentials {
  email: string;
  password: string;
}

interface SignUpCredentials extends EmailPasswordCredentials {
  options?: {
    emailRedirectTo?: string;
    data?: Record<string, unknown>;
  };
}

interface SetSessionCredentials {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

const RAW_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const RAW_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const SESSION_STORAGE_KEY = 'vd.supabase.session';
const CODE_VERIFIER_STORAGE_KEY = 'vd.supabase.code_verifier';
const LEGACY_SUPABASE_AUTH_PREFIX = 'sb-';
const MAX_AUTH_TOKEN_LENGTH = 8_192;
const JWT_LIKE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MISSING_CONFIG_MESSAGE = 'Supabase 环境变量未配置。';
const INVALID_URL_MESSAGE = 'Supabase URL 必须是有效的项目根地址。';
const SUPABASE_PATH_SUFFIX_PATTERN = /\/(?:rest|auth)\/v1\/?$/i;

interface SupabaseConfig {
  url: string;
  anonKey: string;
}

interface SupabaseConfigStatus {
  config?: SupabaseConfig;
  error?: string;
}

function normalizeSupabaseUrl(rawUrl: string): string {
  let normalizedUrl = rawUrl.trim();
  while (SUPABASE_PATH_SUFFIX_PATTERN.test(normalizedUrl)) {
    normalizedUrl = normalizedUrl.replace(SUPABASE_PATH_SUFFIX_PATTERN, '');
  }
  return normalizedUrl.replace(/\/+$/, '');
}

function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const anonKey = RAW_SUPABASE_ANON_KEY?.trim();
  if (!RAW_SUPABASE_URL?.trim() || !anonKey) {
    return { error: MISSING_CONFIG_MESSAGE };
  }

  const url = normalizeSupabaseUrl(RAW_SUPABASE_URL);
  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.pathname !== '/') {
      return { error: INVALID_URL_MESSAGE };
    }
    return { config: { url: parsedUrl.origin, anonKey } };
  } catch {
    return { error: INVALID_URL_MESSAGE };
  }
}

const supabaseConfigStatus = getSupabaseConfigStatus();

if (import.meta.env.DEV) {
  const debugUrl = supabaseConfigStatus.config?.url ?? (RAW_SUPABASE_URL?.trim() ? normalizeSupabaseUrl(RAW_SUPABASE_URL) : undefined);
  let urlOrigin: string | undefined;
  try {
    urlOrigin = debugUrl ? new URL(debugUrl).origin : undefined;
  } catch {
    urlOrigin = undefined;
  }
  console.debug('[Visual Deadline Supabase]', {
    hasUrl: Boolean(RAW_SUPABASE_URL?.trim()),
    hasAnonKey: Boolean(RAW_SUPABASE_ANON_KEY?.trim()),
    urlOrigin,
  });
}

function getRequiredConfig(): SupabaseConfig {
  if (!supabaseConfigStatus.config) {
    throw new Error(supabaseConfigStatus.error ?? MISSING_CONFIG_MESSAGE);
  }
  return supabaseConfigStatus.config;
}


function readStoredCodeVerifier(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(CODE_VERIFIER_STORAGE_KEY);
}

function clearStoredCodeVerifier(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CODE_VERIFIER_STORAGE_KEY);
}

function isUsableStoredToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_AUTH_TOKEN_LENGTH;
}

function isUsableAccessToken(value: unknown): value is string {
  return isUsableStoredToken(value) && JWT_LIKE_PATTERN.test(value);
}

function clearLegacySupabaseStorage(): void {
  if (typeof window === 'undefined') return;

  const storages = [window.localStorage, window.sessionStorage];
  storages.forEach((storage) => {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key) continue;
      if (key === SESSION_STORAGE_KEY || key === CODE_VERIFIER_STORAGE_KEY || key.startsWith(LEGACY_SUPABASE_AUTH_PREFIX)) {
        storage.removeItem(key);
      }
    }
  });

  document.cookie.split(';').forEach((cookie) => {
    const [rawName] = cookie.split('=');
    const name = rawName?.trim();
    if (!name || (!name.startsWith(LEGACY_SUPABASE_AUTH_PREFIX) && !name.startsWith('vd.supabase'))) return;
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
  });
}

function normalizeStoredSession(value: unknown): SupabaseSession | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (!isUsableAccessToken(candidate.access_token) || !isUsableStoredToken(candidate.refresh_token)) return null;

  const user = candidate.user && typeof candidate.user === 'object' ? candidate.user as Record<string, unknown> : null;
  if (!user || typeof user.id !== 'string' || !user.id) return null;

  return {
    access_token: candidate.access_token,
    refresh_token: candidate.refresh_token,
    expires_at: typeof candidate.expires_at === 'number' ? candidate.expires_at : undefined,
    user: {
      id: user.id,
      email: typeof user.email === 'string' ? user.email : undefined,
      identities: Array.isArray(user.identities) ? user.identities : undefined,
    },
  };
}

function readStoredSession(): SupabaseSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = normalizeStoredSession(JSON.parse(raw));
    if (!session) clearLegacySupabaseStorage();
    return session;
  } catch {
    clearLegacySupabaseStorage();
    return null;
  }
}

function persistSession(session: SupabaseSession | null): void {
  if (typeof window === 'undefined') return;
  if (session) {
    const normalizedSession = normalizeStoredSession(session);
    if (normalizedSession) window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(normalizedSession));
    else clearLegacySupabaseStorage();
  } else {
    clearLegacySupabaseStorage();
  }
}

function toSession(payload: { access_token: string; refresh_token: string; expires_in?: number; user: SupabaseUser }): SupabaseSession {
  const session = normalizeStoredSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: payload.expires_in ? Math.floor(Date.now() / 1000) + payload.expires_in : undefined,
    user: payload.user,
  });
  if (!session) throw new Error('Supabase 登录返回的会话缺少有效 access_token、refresh_token 或 user，请复制调试信息排查。');
  return session;
}

export function clearSupabaseAuthCache(): void {
  clearLegacySupabaseStorage();
}

function parseJsonBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 240) };
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = parseJsonBody(text);
  const bodyRecord = body && typeof body === 'object' ? body as Record<string, unknown> : null;
  if (!response.ok) {
    const message = bodyRecord?.msg || bodyRecord?.message || bodyRecord?.error_description || bodyRecord?.error || 'Supabase 请求失败。';
    if (import.meta.env.DEV) {
      console.error('[Visual Deadline Supabase REST error]', {
        status: response.status,
        statusText: response.statusText,
        body,
      });
    }
    throw new SupabaseRestError(String(message), response, bodyRecord);
  }
  return body as T;
}

class VisualDeadlineSupabaseClient {
  private listeners = new Set<AuthChangeCallback>();

  get isConfigured(): boolean {
    return Boolean(supabaseConfigStatus.config);
  }

  get configError(): string | undefined {
    return supabaseConfigStatus.error;
  }

  auth = {
    clearLocalAuthState: async (): Promise<void> => {
      persistSession(null);
      this.emit(null);
    },
    getSession: async (): Promise<SupabaseSession | null> => {
      try {
        const stored = readStoredSession();
        if (!stored) return null;
        if (stored.expires_at && stored.expires_at - 60 < Math.floor(Date.now() / 1000)) {
          return this.auth.refreshSession(stored.refresh_token);
        }
        return stored;
      } catch (error) {
        recordAuthDebugError('getSession', error);
        throw error;
      }
    },
    signUp: async ({ email, password, options }: SignUpCredentials): Promise<SupabaseSession | null> => {
      try {
        const { url, anonKey } = getRequiredConfig();
        const signUpUrl = new URL(`${url}/auth/v1/signup`);
        if (options?.emailRedirectTo) signUpUrl.searchParams.set('redirect_to', options.emailRedirectTo);

        const payload = await parseResponse<{ access_token?: string; refresh_token?: string; expires_in?: number; user: SupabaseUser }>(await fetch(signUpUrl, {
          method: 'POST',
          headers: { apikey: anonKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, data: options?.data }),
        }));
        if (!payload.access_token || !payload.refresh_token) {
          if (Array.isArray(payload.user?.identities) && payload.user.identities.length === 0) {
            throw new Error('USER_ALREADY_REGISTERED_OR_UNVERIFIED');
          }
          return null;
        }
        const session = toSession(payload as { access_token: string; refresh_token: string; expires_in?: number; user: SupabaseUser });
        persistSession(session);
        clearStoredCodeVerifier();
        this.emit(session);
        return session;
      } catch (error) {
        recordAuthDebugError('signUp', error);
        throw error;
      }
    },
    exchangeCodeForSession: async (code: string): Promise<SupabaseSession | null> => {
      try {
        const { url, anonKey } = getRequiredConfig();
        const codeVerifier = readStoredCodeVerifier();
        if (!codeVerifier) return null;
        const payload = await parseResponse<{ access_token: string; refresh_token: string; expires_in?: number; user: SupabaseUser }>(await fetch(`${url}/auth/v1/token?grant_type=pkce`, {
          method: 'POST',
          headers: { apikey: anonKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier }),
        }));
        const session = toSession(payload);
        persistSession(session);
        clearStoredCodeVerifier();
        this.emit(session);
        return session;
      } catch (error) {
        recordAuthDebugError('exchangeCodeForSession', error);
        throw error;
      }
    },
    signInWithPassword: async ({ email, password }: EmailPasswordCredentials): Promise<SupabaseSession> => {
      try {
        const { url, anonKey } = getRequiredConfig();
        const payload = await parseResponse<{ access_token?: string; refresh_token?: string; expires_in?: number; user?: SupabaseUser }>(await fetch(`${url}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { apikey: anonKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        }));
        if (!payload.access_token || !payload.refresh_token || !payload.user) {
          throw new Error('EMAIL_SESSION_MISSING_AFTER_SIGNIN');
        }
        const session = toSession(payload as { access_token: string; refresh_token: string; expires_in?: number; user: SupabaseUser });
        persistSession(session);
        this.emit(session);
        return session;
      } catch (error) {
        recordAuthDebugError('signInWithPassword', error);
        throw error;
      }
    },
    setSession: async ({ access_token, refresh_token, expires_in }: SetSessionCredentials): Promise<SupabaseSession> => {
      try {
        const { url, anonKey } = getRequiredConfig();
        const user = await parseResponse<SupabaseUser>(await fetch(`${url}/auth/v1/user`, {
          headers: { apikey: anonKey, Authorization: `Bearer ${access_token}` },
        }));
        const session = toSession({ access_token, refresh_token, expires_in, user });
        persistSession(session);
        clearStoredCodeVerifier();
        this.emit(session);
        return session;
      } catch (error) {
        recordAuthDebugError('setSession', error);
        throw error;
      }
    },
    resendVerificationEmail: async (email: string, emailRedirectTo?: string): Promise<void> => {
      try {
        const { url, anonKey } = getRequiredConfig();
        const resendUrl = new URL(`${url}/auth/v1/resend`);
        if (emailRedirectTo) resendUrl.searchParams.set('redirect_to', emailRedirectTo);
        await parseResponse<unknown>(await fetch(resendUrl, {
          method: 'POST',
          headers: { apikey: anonKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'signup', email }),
        }));
      } catch (error) {
        recordAuthDebugError('resendVerificationEmail', error);
        throw error;
      }
    },
    acknowledgeEmailVerificationCallback: async (): Promise<void> => {
      clearStoredCodeVerifier();
    },
    refreshSession: async (refreshToken: string): Promise<SupabaseSession | null> => {
      const { url, anonKey } = getRequiredConfig();
      try {
        const payload = await parseResponse<{ access_token: string; refresh_token: string; expires_in?: number; user: SupabaseUser }>(await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { apikey: anonKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        }));
        const session = toSession(payload);
        persistSession(session);
        this.emit(session);
        return session;
      } catch (error) {
        recordAuthDebugError('getSession', error);
        persistSession(null);
        this.emit(null);
        return null;
      }
    },
    signOut: async (): Promise<void> => {
      const session = readStoredSession();
      const config = this.isConfigured ? getRequiredConfig() : null;
      if (session && config) {
        await fetch(`${config.url}/auth/v1/logout`, {
          method: 'POST',
          headers: { apikey: config.anonKey, Authorization: `Bearer ${session.access_token}` },
        }).catch(() => undefined);
      }
      persistSession(null);
      this.emit(null);
    },
    onAuthStateChange: (callback: AuthChangeCallback) => {
      this.listeners.add(callback);
      return { data: { subscription: { unsubscribe: () => this.listeners.delete(callback) } } };
    },
  };

  async rest<T>(path: string, init: RequestInit = {}, session?: SupabaseSession | null): Promise<T> {
    const { url, anonKey } = getRequiredConfig();
    const activeSession = session ?? (await this.auth.getSession());
    const headers = new Headers(init.headers);
    headers.set('apikey', anonKey);
    headers.set('Content-Type', 'application/json');
    if (activeSession) headers.set('Authorization', `Bearer ${activeSession.access_token}`);
    return parseResponse<T>(await fetch(`${url}/rest/v1/${path}`, { ...init, headers }));
  }

  private emit(session: SupabaseSession | null): void {
    this.listeners.forEach((listener) => {
      try {
        listener(session);
      } catch (error) {
        recordAuthDebugError('onAuthStateChange', error);
        throw error;
      }
    });
  }
}

export const supabase = new VisualDeadlineSupabaseClient();
