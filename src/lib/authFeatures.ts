export interface AuthFeatureFlags {
  readonly emailPassword: true;
  readonly emailSignup: boolean;
  readonly google: boolean;
  readonly github: boolean;
  readonly x: boolean;
  readonly phone: boolean;
  readonly identityLinking: boolean;
  readonly guestImport: boolean;
}

export type SupportedIdentityProvider = 'google' | 'github' | 'x';
export const PHONE_OTP_RESEND_COOLDOWN_MS = 60_000;

const enabled = (value: unknown): boolean => value === 'true';

/** New providers are opt-in and require a deliberately set public readiness flag. */
export function createAuthFeatureFlags(environment: Record<string, unknown> = {}): AuthFeatureFlags {
  return Object.freeze({
  emailPassword: true,
  emailSignup: enabled(environment.VITE_AUTH_EMAIL_SIGNUP_ENABLED),
  google: enabled(environment.VITE_AUTH_GOOGLE_ENABLED),
  github: enabled(environment.VITE_AUTH_GITHUB_ENABLED),
  x: enabled(environment.VITE_AUTH_X_ENABLED),
  phone: enabled(environment.VITE_AUTH_PHONE_ENABLED),
  identityLinking: enabled(environment.VITE_AUTH_IDENTITY_LINKING_ENABLED),
  guestImport: enabled(environment.VITE_AUTH_GUEST_IMPORT_ENABLED),
  });
}

/** New providers are opt-in and require a deliberately set public readiness flag. */
const viteEnvironment = (import.meta as unknown as { env?: Record<string, unknown> }).env;
export const authFeatureFlags: AuthFeatureFlags = createAuthFeatureFlags(viteEnvironment);

export function assertOAuthProviderEnabled(flags: AuthFeatureFlags, provider: SupportedIdentityProvider): void {
  if (!flags[provider]) throw new Error(`AUTH_OAUTH_DISABLED:${provider}`);
}

export function assertEmailSignupEnabled(flags: AuthFeatureFlags): void {
  if (!flags.emailSignup) throw new Error('AUTH_EMAIL_SIGNUP_DISABLED');
}

export function assertPhoneEnabled(flags: AuthFeatureFlags): void {
  if (!flags.phone) throw new Error('AUTH_PHONE_DISABLED');
}

export class OtpResendCooldown {
  private availableAt = 0;
  assertAvailable(now = Date.now()): void {
    if (now < this.availableAt) throw new Error(`PHONE_OTP_COOLDOWN:${this.availableAt - now}`);
  }
  request(now = Date.now()): void {
    this.assertAvailable(now);
    this.availableAt = now + PHONE_OTP_RESEND_COOLDOWN_MS;
  }
  remainingMs(now = Date.now()): number { return Math.max(0, this.availableAt - now); }
  get nextAvailableAt(): number { return this.availableAt; }
}

/** Kept as an explicit name for the phone-auth API surface. */
export class PhoneOtpCooldown extends OtpResendCooldown {}

const PRODUCTION_ORIGINS = new Set(['https://www.visualdeadline.com', 'https://visualdeadline.com']);

/** Only VD production and localhost callback origins are accepted; callers cannot supply arbitrary redirects. */
export function getAuthCallbackUrl(): string {
  if (typeof window === 'undefined') return 'https://www.visualdeadline.com/auth/callback';
  const origin = window.location.origin;
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin);
  return PRODUCTION_ORIGINS.has(origin) || isLocalhost ? `${origin}/auth/callback` : 'https://www.visualdeadline.com/auth/callback';
}

/** E.164 normalization is deliberately conservative: no inferred country code. */
export function normalizePhoneE164(value: string): string {
  const normalized = value.trim().replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error('请输入有效的 E.164 手机号，例如 +8613812345678。');
  return normalized;
}

/** China phone beta deliberately accepts only an explicitly supplied +86 number. */
export function normalizeChinaPhoneE164(value: string): string {
  const normalized = normalizePhoneE164(value);
  if (!/^\+861[3-9]\d{9}$/.test(normalized)) throw new Error('当前仅支持中国大陆 +86 手机号。');
  return normalized;
}
