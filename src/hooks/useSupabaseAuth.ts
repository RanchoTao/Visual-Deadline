import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, type SupabaseSession } from '../lib/supabaseClient';

const AUTH_CALLBACK_PATH = '/';
const AUTH_CALLBACK_QUERY_PARAMS = ['code', 'state', 'error', 'error_code', 'error_description'];

function getAuthCallbackUrl(): string {
  if (typeof window === 'undefined') return AUTH_CALLBACK_PATH;
  try {
    return new URL(AUTH_CALLBACK_PATH, window.location.origin).toString();
  } catch (error) {
    console.error('[VD_AUTH_REDIRECT_URL_ERROR]', { error, origin: window.location.origin });
    return AUTH_CALLBACK_PATH;
  }
}

function readAuthCallbackCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get('code');
  } catch (error) {
    console.error('[VD_AUTH_CALLBACK_CODE_READ_ERROR]', { error, search: window.location.search });
    return null;
  }
}

function readAuthCallbackError(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error_description') || params.get('error') || params.get('error_code');
    return error ? decodeURIComponent(error.replace(/\+/g, ' ')) : null;
  } catch (readError) {
    console.error('[VD_AUTH_CALLBACK_ERROR_READ_ERROR]', { error: readError, search: window.location.search });
    return '邮箱验证回调参数读取失败。';
  }
}

function removeAuthCallbackQueryParams(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    AUTH_CALLBACK_QUERY_PARAMS.forEach((param) => url.searchParams.delete(param));
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, document.title, nextUrl);
  } catch (error) {
    console.error('[VD_AUTH_CALLBACK_CLEANUP_ERROR]', { error, href: window.location.href });
  }
}

function getFriendlyAuthError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

export function useSupabaseAuth() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const emailRedirectTo = useMemo(getAuthCallbackUrl, []);

  useEffect(() => {
    console.info('[VD_AUTH_CONFIG_CHECK]', {
      isConfigured: supabase.isConfigured,
      configError: supabase.configError,
      expectedSiteUrl: typeof window === 'undefined' ? undefined : window.location.origin,
      expectedRedirectUrl: emailRedirectTo,
      note: 'Supabase Auth Site URL / Redirect URLs 需要包含当前站点与 expectedRedirectUrl。',
    });
  }, [emailRedirectTo]);

  useEffect(() => {
    let isMounted = true;
    const callbackError = readAuthCallbackError();
    const callbackCode = readAuthCallbackCode();

    if (callbackError && !callbackCode) {
      console.error('[VD_AUTH_CALLBACK_ERROR]', { callbackError, href: typeof window === 'undefined' ? undefined : window.location.href });
      removeAuthCallbackQueryParams();
      setError(`邮箱验证失败：${callbackError}`);
      setIsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const sessionPromise = callbackCode
      ? supabase.auth.exchangeCodeForSession(callbackCode).then((exchangedSession) => {
        removeAuthCallbackQueryParams();
        return exchangedSession;
      })
      : supabase.auth.getSession();

    sessionPromise
      .then((currentSession) => {
        if (isMounted) setSession(currentSession);
      })
      .catch((authError) => {
        console.error('[VD_AUTH_SESSION_INIT_ERROR]', { error: authError, callbackCodeExists: Boolean(callbackCode), href: typeof window === 'undefined' ? undefined : window.location.href });
        if (isMounted) setError(getFriendlyAuthError(authError, '读取登录状态失败。'));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    const subscription = supabase.auth.onAuthStateChange((nextSession) => {
      console.info('[VD_AUTH_STATE_CHANGE]', { hasSession: Boolean(nextSession), userId: nextSession?.user?.id, hasAccessToken: Boolean(nextSession?.access_token) });
      setSession(nextSession);
    });
    return () => {
      isMounted = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setError(undefined);
    try {
      console.info('[VD_AUTH_SIGNUP_START]', { emailDomain: email.split('@')[1], emailRedirectTo });
      const nextSession = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      });
      console.info('[VD_AUTH_SIGNUP_SUCCESS]', { hasSession: Boolean(nextSession), userId: nextSession?.user?.id });
      if (nextSession) setSession(nextSession);
      return nextSession;
    } catch (signUpError) {
      console.error('[VD_AUTH_SIGNUP_ERROR]', { error: signUpError, emailDomain: email.split('@')[1], emailRedirectTo });
      const message = getFriendlyAuthError(signUpError, '注册失败，请稍后重试。');
      setError(message);
      throw signUpError;
    }
  }, [emailRedirectTo]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(undefined);
    try {
      console.info('[VD_AUTH_SIGNIN_START]', { emailDomain: email.split('@')[1] });
      const nextSession = await supabase.auth.signInWithPassword({ email, password });
      console.info('[VD_AUTH_SIGNIN_SUCCESS]', { userId: nextSession.user?.id, hasAccessToken: Boolean(nextSession.access_token) });
      setSession(nextSession);
      return nextSession;
    } catch (signInError) {
      console.error('[VD_AUTH_SIGNIN_ERROR]', { error: signInError, emailDomain: email.split('@')[1] });
      const message = getFriendlyAuthError(signInError, '登录失败，请稍后重试。');
      setError(message);
      throw signInError;
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(undefined);
    try {
      await supabase.auth.signOut();
      setSession(null);
    } catch (signOutError) {
      console.error('[VD_AUTH_SIGNOUT_ERROR]', { error: signOutError });
      const message = getFriendlyAuthError(signOutError, '退出登录失败。');
      setError(message);
      throw signOutError;
    }
  }, []);

  return { session, isLoading, error: error ?? supabase.configError, isConfigured: supabase.isConfigured, signUp, signIn, signOut };
}
