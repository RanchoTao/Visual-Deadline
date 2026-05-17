import { useCallback, useEffect, useState } from 'react';
import { supabase, type SupabaseSession } from '../lib/supabaseClient';

const EMAIL_CONFIRMATION_REDIRECT_URL = 'https://www.visualdeadline.com';
const AUTH_CALLBACK_QUERY_PARAMS = ['code', 'state', 'error', 'error_code', 'error_description'];

function readAuthCallbackCode(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('code');
}

function removeAuthCallbackQueryParams(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  AUTH_CALLBACK_QUERY_PARAMS.forEach((param) => url.searchParams.delete(param));
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, document.title, nextUrl);
}

export function useSupabaseAuth() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let isMounted = true;
    const callbackCode = readAuthCallbackCode();
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
        if (isMounted) setError(authError instanceof Error ? authError.message : '读取登录状态失败。');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    const subscription = supabase.auth.onAuthStateChange((nextSession) => setSession(nextSession));
    return () => {
      isMounted = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setError(undefined);
    const nextSession = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: EMAIL_CONFIRMATION_REDIRECT_URL },
    });
    if (nextSession) setSession(nextSession);
    return nextSession;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(undefined);
    const nextSession = await supabase.auth.signInWithPassword({ email, password });
    setSession(nextSession);
    return nextSession;
  }, []);

  const signOut = useCallback(async () => {
    setError(undefined);
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  return { session, isLoading, error: error ?? supabase.configError, isConfigured: supabase.isConfigured, signUp, signIn, signOut };
}
