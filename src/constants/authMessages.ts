export const EMAIL_VERIFICATION_SENT_MESSAGE = '验证邮件已发送。请前往邮箱完成验证，验证完成后回到本页面登录。';
export const EMAIL_VERIFIED_LOGIN_MESSAGE = '邮箱已验证，请返回登录页使用邮箱和密码登录。';
export const EMAIL_NOT_CONFIRMED_MESSAGE = '邮箱尚未验证，请先查看邮箱验证邮件。没有收到可点击重新发送。';

const AUTH_ERROR_TRANSLATIONS: Array<[RegExp, string]> = [
  [/email not confirmed/i, '邮箱尚未验证'],
  [/invalid login credentials/i, '邮箱或密码错误'],
  [/email rate limit exceeded/i, '邮件发送过于频繁'],
  [/the quota has been exceeded/i, '邮件额度已耗尽'],
  [/missing code verifier|both auth code and code verifier should be non-empty/i, '验证链接与当前浏览器登录态不一致，请回到登录页手动登录'],
];

export function getAuthErrorMessage(error: unknown, fallback = '认证失败，请稍后重试。'): string {
  const rawMessage = error instanceof Error ? error.message : String(error ?? '');
  const translatedMessage = AUTH_ERROR_TRANSLATIONS.find(([pattern]) => pattern.test(rawMessage))?.[1];
  return translatedMessage ?? (rawMessage || fallback);
}
