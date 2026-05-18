export const EMAIL_VERIFICATION_SENT_MESSAGE = '注册成功，验证邮件已发送。请前往邮箱完成验证，验证后回到这里登录。';
export const EMAIL_VERIFIED_LOGIN_MESSAGE = '邮箱已验证，请返回登录页使用邮箱和密码登录。';
export const EMAIL_VERIFICATION_RESENT_MESSAGE = '验证邮件已重新发送，请检查收件箱和垃圾邮件。';
export const EMAIL_NOT_CONFIRMED_MESSAGE = '邮箱尚未验证，请先完成邮箱验证。没有收到邮件可点击重新发送。';
export const EMAIL_SESSION_MISSING_MESSAGE = '当前账号尚未完成邮箱验证，请先查看验证邮件。';
export const EMAIL_MAYBE_REGISTERED_MESSAGE = '该邮箱可能已注册。若尚未验证，请点击重新发送验证邮件；若已验证，请直接登录。';
export const EMAIL_RATE_LIMIT_MESSAGE = '发送过于频繁，请稍后再试。';

const AUTH_ERROR_TRANSLATIONS: Array<[RegExp, string]> = [
  [/email not confirmed|email_not_confirmed/i, EMAIL_NOT_CONFIRMED_MESSAGE],
  [/invalid login credentials/i, '邮箱或密码错误'],
  [/email rate limit exceeded|rate limit|too many requests/i, EMAIL_RATE_LIMIT_MESSAGE],
  [/the quota has been exceeded/i, '邮件额度已耗尽'],
  [/missing code verifier|both auth code and code verifier should be non-empty/i, '验证链接与当前浏览器登录态不一致，请回到登录页手动登录'],
  [/USER_ALREADY_REGISTERED_OR_UNVERIFIED|already registered|already exists|user.*exists/i, EMAIL_MAYBE_REGISTERED_MESSAGE],
  [/EMAIL_SESSION_MISSING_AFTER_SIGNIN/i, EMAIL_SESSION_MISSING_MESSAGE],
];

export function getAuthErrorMessage(error: unknown, fallback = '认证失败，请稍后重试。'): string {
  const rawMessage = error instanceof Error ? error.message : String(error ?? '');
  const translatedMessage = AUTH_ERROR_TRANSLATIONS.find(([pattern]) => pattern.test(rawMessage))?.[1];
  return translatedMessage ?? (rawMessage || fallback);
}
