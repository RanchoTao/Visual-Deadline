export interface AuthFeatureFlags {
  readonly emailPassword: true;
  readonly google: boolean;
  readonly github: boolean;
  readonly twitter: boolean;
  readonly phone: boolean;
  readonly identityLinking: boolean;
  readonly guestImport: boolean;
}

const enabled = (value: unknown): boolean => value === 'true';

/** New providers are opt-in and require a deliberately set public readiness flag. */
export const authFeatureFlags: AuthFeatureFlags = Object.freeze({
  emailPassword: true,
  google: enabled(import.meta.env.VITE_AUTH_GOOGLE_ENABLED),
  github: enabled(import.meta.env.VITE_AUTH_GITHUB_ENABLED),
  twitter: enabled(import.meta.env.VITE_AUTH_TWITTER_ENABLED),
  phone: enabled(import.meta.env.VITE_AUTH_PHONE_ENABLED),
  identityLinking: enabled(import.meta.env.VITE_AUTH_IDENTITY_LINKING_ENABLED),
  guestImport: enabled(import.meta.env.VITE_AUTH_GUEST_IMPORT_ENABLED),
});

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
