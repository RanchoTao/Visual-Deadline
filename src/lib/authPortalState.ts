export type AuthPortalMode = 'phone' | 'password' | 'signup' | 'email-otp';

/** A disabled phone flag must never leave the portal on a non-functional tab. */
export function initialAuthPortalMode(phoneEnabled: boolean): AuthPortalMode {
  return phoneEnabled ? 'phone' : 'password';
}

export function isAvailableAuthPortalMode(mode: AuthPortalMode, phoneEnabled: boolean): boolean {
  return mode !== 'phone' || phoneEnabled;
}

export function normalizeChinaPhoneDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11);
}

export function isSixDigitOtp(value: string): boolean {
  return /^\d{6}$/.test(value);
}

/** A confirmation-required signup is the only result that enters email OTP. */
export function nextModeAfterEmailSignup(signupSession: unknown): AuthPortalMode | undefined {
  return signupSession ? undefined : 'email-otp';
}
