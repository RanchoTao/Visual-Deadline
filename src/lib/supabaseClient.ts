export interface SupabaseUser {
  id: string;
  email?: string;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: SupabaseUser;
}

type AuthChangeCallback = (session: SupabaseSession | null) => void;

interface EmailPasswordCredentials {
  email: string;
  password: string;
}

const RAW_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const RAW_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const SESSION_STORAGE_KEY = 'vd.supabase.session';
const MISSING_CONFIG_MESSAGE = 'Supabase environment variables are missing.';
const INVALID_URL_MESSAGE = 'Supabase URL must be a valid project base URL.';
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

function readStoredSession(): SupabaseSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SupabaseSession) : null;
  } catch {
    return null;
  }
}

function persistSession(session: SupabaseSession | null): void {
  if (typeof window === 'undefined') return;
  if (session) window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function toSession(payload: { access_token: string; refresh_token: string; expires_in?: number; user: SupabaseUser }): SupabaseSession {
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: payload.expires_in ? Math.floor(Date.now() / 1000) + payload.expires_in : undefined,
    user: payload.user,
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body?.msg || body?.message || body?.error_description || body?.error || 'Supabase 请求失败。';
    throw new Error(message);
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
    getSession: async (): Promise<SupabaseSession | null> => {
      const stored = readStoredSession();
      if (!stored) return null;
      if (stored.expires_at && stored.expires_at - 60 < Math.floor(Date.now() / 1000)) {
        return this.auth.refreshSession(stored.refresh_token);
      }
      return stored;
    },
    signUp: async ({ email, password }: EmailPasswordCredentials): Promise<SupabaseSession | null> => {
      const { url, anonKey } = getRequiredConfig();
      const payload = await parseResponse<{ access_token?: string; refresh_token?: string; expires_in?: number; user: SupabaseUser }>(await fetch(`${url}/auth/v1/signup`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }));
      if (!payload.access_token || !payload.refresh_token) return null;
      const session = toSession(payload as { access_token: string; refresh_token: string; expires_in?: number; user: SupabaseUser });
      persistSession(session);
      this.emit(session);
      return session;
    },
    signInWithPassword: async ({ email, password }: EmailPasswordCredentials): Promise<SupabaseSession> => {
      const { url, anonKey } = getRequiredConfig();
      const payload = await parseResponse<{ access_token: string; refresh_token: string; expires_in?: number; user: SupabaseUser }>(await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }));
      const session = toSession(payload);
      persistSession(session);
      this.emit(session);
      return session;
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
      } catch {
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
    this.listeners.forEach((listener) => listener(session));
  }
}

export const supabase = new VisualDeadlineSupabaseClient();
