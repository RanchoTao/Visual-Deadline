/** Single callback owner: explicit SPA exchange, never supabase-js URL auto-detection. */
export const identityClientAuthOptions = Object.freeze({
  flowType: 'pkce' as const,
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: false,
  storageKey: 'vd.supabase.auth',
});
