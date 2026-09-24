import { createClient, type AuthChangeEvent, type Provider, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import { recordAuthDebugError } from './authDebug';
import { assertEmailSignupEnabled, assertOAuthProviderEnabled, assertPhoneEnabled, authFeatureFlags, type AuthFeatureFlags, type SupportedIdentityProvider } from './authFeatures';
import { LegacySessionTransition } from './legacySessionTransition';
import { identityClientAuthOptions } from './identityClientConfig';

export interface SupabaseUser { id: string; email?: string; identities?: unknown[]; email_confirmed_at?: string | null; phone?: string; }
export interface SupabaseSession { access_token: string; refresh_token: string; expires_at?: number; user: SupabaseUser; }
export interface IdentityProvider { provider: SupportedIdentityProvider; }
export interface PhoneOtpRequest { phone: string; }
export interface PhoneOtpVerification { phone: string; token: string; }
export interface EmailOtpVerification { email: string; token: string; }

/** Application-facing Auth boundary. Components never receive Supabase's raw client. */
export interface IdentityClient {
  readonly isConfigured: boolean;
  readonly configError?: string;
  getSession(): Promise<SupabaseSession | null>;
  getUser(): Promise<SupabaseUser | null>;
  signUp(input: { email: string; password: string; options?: { emailRedirectTo?: string; data?: Record<string, unknown> } }): Promise<SupabaseSession | null>;
  signInWithPassword(input: { email: string; password: string }): Promise<SupabaseSession>;
  signOut(): Promise<void>;
  clearLocalAuthState(): Promise<void>;
  resendVerificationEmail(email: string, emailRedirectTo?: string): Promise<void>;
  resetPassword(email: string, redirectTo?: string): Promise<void>;
  exchangeCodeForSession(code: string): Promise<SupabaseSession | null>;
  onAuthStateChange(callback: (session: SupabaseSession | null, event: AuthChangeEvent) => void): { data: { subscription: { unsubscribe(): void } } };
  signInWithOAuth(provider: IdentityProvider['provider'], redirectTo: string): Promise<void>;
  requestPhoneOtp(input: PhoneOtpRequest): Promise<void>;
  verifyPhoneOtp(input: PhoneOtpVerification): Promise<SupabaseSession | null>;
  verifyEmailOtp(input: EmailOtpVerification): Promise<SupabaseSession | null>;
  getIdentities(): Promise<readonly unknown[]>;
  setSession(input: { access_token: string; refresh_token: string; expires_in?: number }): Promise<SupabaseSession>;
}

export class SupabaseRestError extends Error {
  readonly status: number; readonly code?: string; readonly details?: string; readonly hint?: string;
  constructor(message: string, response: Response, body: Record<string, unknown> | null) {
    super(message); this.name = 'SupabaseRestError'; this.status = response.status;
    this.code = typeof body?.code === 'string' ? body.code : undefined;
    this.details = typeof body?.details === 'string' ? body.details : undefined;
    this.hint = typeof body?.hint === 'string' ? body.hint : undefined;
  }
}

interface SupabaseConfig { url: string; anonKey: string; }
interface SupabaseConfigStatus { config?: SupabaseConfig; error?: string; }
const RAW_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const RAW_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const LEGACY_SESSION_STORAGE_KEY = 'vd.supabase.session';
const LEGACY_CODE_VERIFIER_STORAGE_KEY = 'vd.supabase.code_verifier';
const LEGACY_SUPABASE_AUTH_PREFIX = 'sb-';
const MAX_AUTH_TOKEN_LENGTH = 8_192;
const JWT_LIKE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MISSING_CONFIG_MESSAGE = 'Supabase 环境变量未配置。';
const INVALID_URL_MESSAGE = 'Supabase URL 必须是有效的项目根地址。';
const SUPABASE_PATH_SUFFIX_PATTERN = /\/(?:rest|auth)\/v1\/?$/i;

function normalizeSupabaseUrl(rawUrl: string): string {
  let normalizedUrl = rawUrl.trim();
  while (SUPABASE_PATH_SUFFIX_PATTERN.test(normalizedUrl)) normalizedUrl = normalizedUrl.replace(SUPABASE_PATH_SUFFIX_PATTERN, '');
  return normalizedUrl.replace(/\/+$/, '');
}
function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const anonKey = RAW_SUPABASE_ANON_KEY?.trim();
  if (!RAW_SUPABASE_URL?.trim() || !anonKey) return { error: MISSING_CONFIG_MESSAGE };
  const url = normalizeSupabaseUrl(RAW_SUPABASE_URL);
  try {
    const parsedUrl = new URL(url);
    return !['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.pathname !== '/'
      ? { error: INVALID_URL_MESSAGE } : { config: { url: parsedUrl.origin, anonKey } };
  } catch { return { error: INVALID_URL_MESSAGE }; }
}
function isUsableStoredToken(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= MAX_AUTH_TOKEN_LENGTH; }
function isUsableAccessToken(value: unknown): value is string { return isUsableStoredToken(value) && JWT_LIKE_PATTERN.test(value); }
function normalizeUser(user: User): SupabaseUser {
  return { id: user.id, email: user.email ?? undefined, phone: user.phone ?? undefined, email_confirmed_at: user.email_confirmed_at ?? null,
    identities: user.identities?.map((identity) => ({ provider: identity.provider, providerIdentityId: identity.identity_id, createdAt: identity.created_at, updatedAt: identity.updated_at })) };
}
function normalizeSession(session: Session | null | undefined): SupabaseSession | null {
  if (!session || !isUsableAccessToken(session.access_token) || !isUsableStoredToken(session.refresh_token) || !session.user?.id) return null;
  return { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at, user: normalizeUser(session.user) };
}
function readLegacySession(): { access_token: string; refresh_token: string; userId: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(LEGACY_SESSION_STORAGE_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>; const user = candidate.user && typeof candidate.user === 'object' ? candidate.user as Record<string, unknown> : null;
    if (!isUsableAccessToken(candidate.access_token) || !isUsableStoredToken(candidate.refresh_token) || !user || typeof user.id !== 'string' || !user.id) return null;
    return { access_token: candidate.access_token, refresh_token: candidate.refresh_token, userId: user.id };
  } catch { return null; }
}
function removeLegacySession(): void { if (typeof window !== 'undefined') window.localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY); }
function clearLegacyAuthStorage(): void {
  if (typeof window === 'undefined') return;
  for (const storage of [window.localStorage, window.sessionStorage]) for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index); if (key && (key === LEGACY_SESSION_STORAGE_KEY || key === LEGACY_CODE_VERIFIER_STORAGE_KEY || key.startsWith(LEGACY_SUPABASE_AUTH_PREFIX))) storage.removeItem(key);
  }
}
function parseJsonBody(text: string): Record<string, unknown> | null {
  if (!text) return null;
  try { const parsed: unknown = JSON.parse(text); return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null; }
  catch { return { message: text.slice(0, 240) }; }
}
async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text(); const body = parseJsonBody(text);
  if (!response.ok) throw new SupabaseRestError(String(body?.msg ?? body?.message ?? body?.error_description ?? body?.error ?? 'Supabase 请求失败。'), response, body);
  return body as T;
}

class VisualDeadlineIdentityClient implements IdentityClient {
  private readonly client?: SupabaseClient;
  private readonly legacyTransition: LegacySessionTransition<SupabaseSession, SupabaseUser>;
  constructor(private readonly status: SupabaseConfigStatus, private readonly flags: AuthFeatureFlags = authFeatureFlags) {
    if (status.config) this.client = createClient(status.config.url, status.config.anonKey, { auth: identityClientAuthOptions });
    this.legacyTransition = new LegacySessionTransition({
      readLegacy: readLegacySession,
      removeLegacy: removeLegacySession,
      setSession: (legacy) => this.setSession(legacy),
      getUser: () => this.getUser(),
      clearSupportedSession: () => this.clearSupportedSessionOnly(),
    });
  }
  get isConfigured(): boolean { return Boolean(this.client); }
  get configError(): string | undefined { return this.status.error; }
  requireClient(): SupabaseClient { if (!this.client) throw new Error(this.status.error ?? MISSING_CONFIG_MESSAGE); return this.client; }
  async getSession(): Promise<SupabaseSession | null> {
    const { data, error } = await this.requireClient().auth.getSession(); if (error) throw error;
    return normalizeSession(data.session) ?? this.transitionLegacySession();
  }
  async getUser(): Promise<SupabaseUser | null> {
    const { data, error } = await this.requireClient().auth.getUser(); if (error) throw error; return data.user ? normalizeUser(data.user) : null;
  }
  async signUp(input: { email: string; password: string; options?: { emailRedirectTo?: string; data?: Record<string, unknown> } }): Promise<SupabaseSession | null> {
    assertEmailSignupEnabled(this.flags); const { data, error } = await this.requireClient().auth.signUp({ email: input.email, password: input.password, options: input.options }); if (error) throw error; return normalizeSession(data.session);
  }
  async signInWithPassword(input: { email: string; password: string }): Promise<SupabaseSession> {
    const { data, error } = await this.requireClient().auth.signInWithPassword(input); if (error) throw error;
    const session = normalizeSession(data.session); if (!session) throw new Error('EMAIL_SESSION_MISSING_AFTER_SIGNIN'); return session;
  }
  async signOut(): Promise<void> { const { error } = await this.requireClient().auth.signOut(); clearLegacyAuthStorage(); if (error) throw error; }
  async clearLocalAuthState(): Promise<void> { await this.requireClient().auth.signOut({ scope: 'local' }); clearLegacyAuthStorage(); }
  async resendVerificationEmail(email: string, emailRedirectTo?: string): Promise<void> {
    const { error } = await this.requireClient().auth.resend({ type: 'signup', email, options: emailRedirectTo ? { emailRedirectTo } : undefined }); if (error) throw error;
  }
  async resetPassword(email: string, redirectTo?: string): Promise<void> { const { error } = await this.requireClient().auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined); if (error) throw error; }
  async exchangeCodeForSession(code: string): Promise<SupabaseSession | null> { const { data, error } = await this.requireClient().auth.exchangeCodeForSession(code); if (error) throw error; return normalizeSession(data.session); }
  onAuthStateChange(callback: (session: SupabaseSession | null, event: AuthChangeEvent) => void) { return this.requireClient().auth.onAuthStateChange((event, session) => callback(normalizeSession(session), event)); }
  async signInWithOAuth(provider: IdentityProvider['provider'], redirectTo: string): Promise<void> { assertOAuthProviderEnabled(this.flags, provider); const { error } = await this.requireClient().auth.signInWithOAuth({ provider: provider as Provider, options: { redirectTo } }); if (error) throw error; }
  async requestPhoneOtp(input: PhoneOtpRequest): Promise<void> { assertPhoneEnabled(this.flags); const { error } = await this.requireClient().auth.signInWithOtp({ phone: input.phone }); if (error) throw error; }
  async verifyPhoneOtp(input: PhoneOtpVerification): Promise<SupabaseSession | null> { assertPhoneEnabled(this.flags); const { data, error } = await this.requireClient().auth.verifyOtp({ phone: input.phone, token: input.token, type: 'sms' }); if (error) throw error; return normalizeSession(data.session); }
  async verifyEmailOtp(input: EmailOtpVerification): Promise<SupabaseSession | null> {
    const { data, error } = await this.requireClient().auth.verifyOtp({ email: input.email, token: input.token, type: 'email' });
    if (error) throw error;
    return normalizeSession(data.session);
  }
  async getIdentities(): Promise<readonly unknown[]> { return (await this.getUser())?.identities ?? []; }
  async setSession(input: { access_token: string; refresh_token: string; expires_in?: number }): Promise<SupabaseSession> {
    const { data, error } = await this.requireClient().auth.setSession(input); if (error) throw error;
    const session = normalizeSession(data.session); if (!session) throw new Error('登录没有返回有效会话，请稍后重试或联系支持。'); return session;
  }
  private async transitionLegacySession(): Promise<SupabaseSession | null> {
    const session = await this.legacyTransition.run();
    if (!session) recordAuthDebugError('legacySessionTransition', new Error('LEGACY_SESSION_TRANSITION_NOT_VERIFIED'));
    return session;
  }
  private async clearSupportedSessionOnly(): Promise<void> { await this.requireClient().auth.signOut({ scope: 'local' }); }
}

const configStatus = getSupabaseConfigStatus();
export const identityClient: IdentityClient = new VisualDeadlineIdentityClient(configStatus);

/** Compatibility facade for existing data/storage services; Auth is the narrow IdentityClient above. */
class VisualDeadlineSupabaseFacade {
  readonly auth = identityClient;
  get isConfigured(): boolean { return identityClient.isConfigured; }
  get configError(): string | undefined { return identityClient.configError; }
  private get config(): SupabaseConfig { if (!configStatus.config) throw new Error(configStatus.error ?? MISSING_CONFIG_MESSAGE); return configStatus.config; }
  private get client(): SupabaseClient { return (identityClient as VisualDeadlineIdentityClient).requireClient(); }
  async rest<T>(path: string, init: RequestInit = {}, session?: SupabaseSession | null): Promise<T> {
    const activeSession = session ?? await identityClient.getSession(); const headers = new Headers(init.headers);
    headers.set('apikey', this.config.anonKey); headers.set('Content-Type', 'application/json'); if (activeSession) headers.set('Authorization', `Bearer ${activeSession.access_token}`);
    return parseResponse<T>(await fetch(`${this.config.url}/rest/v1/${path}`, { ...init, headers }));
  }
  async restPage<T>(path: string, init: RequestInit = {}, session?: SupabaseSession | null): Promise<{ data: T; total?: number }> {
    const activeSession = session ?? await identityClient.getSession(); const headers = new Headers(init.headers);
    headers.set('apikey', this.config.anonKey); headers.set('Content-Type', 'application/json'); if (activeSession) headers.set('Authorization', `Bearer ${activeSession.access_token}`);
    const preferences = headers.get('Prefer'); headers.set('Prefer', preferences ? `${preferences},count=exact` : 'count=exact');
    const response = await fetch(`${this.config.url}/rest/v1/${path}`, { ...init, headers });
    const totalText = response.headers.get('Content-Range')?.split('/')[1]; const total = totalText && totalText !== '*' ? Number(totalText) : undefined;
    return { data: await parseResponse<T>(response), total: Number.isFinite(total) ? total : undefined };
  }
  async uploadStorageObject(bucket: string, path: string, file: Blob, session?: SupabaseSession | null, upsert = false): Promise<void> {
    if (!(session ?? await identityClient.getSession())) throw new Error('请先登录后上传附件。'); const { error } = await this.client.storage.from(bucket).upload(path, file, { upsert }); if (error) throw error;
  }
  getPublicStorageUrl(bucket: string, path: string): string { return this.client.storage.from(bucket).getPublicUrl(path).data.publicUrl; }
  async removeStorageObject(bucket: string, path: string, session?: SupabaseSession | null): Promise<void> {
    if (!(session ?? await identityClient.getSession())) return; const { error } = await this.client.storage.from(bucket).remove([path]); if (error) throw error;
  }
}
export const supabase = new VisualDeadlineSupabaseFacade();
export function clearSupabaseAuthCache(): void { void identityClient.clearLocalAuthState(); }
