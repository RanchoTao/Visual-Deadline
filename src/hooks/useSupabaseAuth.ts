import { useCallback, useEffect, useState } from 'react';
import { EMAIL_VERIFICATION_SENT_MESSAGE, EMAIL_VERIFIED_LOGIN_MESSAGE } from '../constants/authMessages';
import { supabase, type SupabaseSession } from '../lib/supabaseClient';
import type { UserProfile } from '../types/task';

const EMAIL_CONFIRMATION_REDIRECT_URL = 'https://www.visualdeadline.com';
const AUTH_CALLBACK_PARAMS = [
  'access_token',
  'refresh_token',
  'expires_in',
  'token_type',
  'type',
  'code',
  'state',
  'error',
  'error_code',
  'error_description',
];

interface AuthCallbackPayload {
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn?: number;
  code: string | null;
  type: string | null;
  error: string | null;
}

interface AuthCallbackResult {
  session: SupabaseSession | null;
  status?: string;
}

function readAuthCallbackParams(): AuthCallbackPayload | null {
  if (typeof window === 'undefined') return null;
  const queryParams = new URLSearchParams(window.location.search);
  const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(rawHash);
  const getParam = (name: string) => queryParams.get(name) ?? hashParams.get(name);
  const hasCallbackParam = AUTH_CALLBACK_PARAMS.some((param) => queryParams.has(param) || hashParams.has(param));
  if (!hasCallbackParam) return null;

  const rawExpiresIn = getParam('expires_in');
  const expiresIn = rawExpiresIn ? Number(rawExpiresIn) : undefined;
  const error = getParam('error_description') ?? getParam('error');

  return {
    accessToken: getParam('access_token'),
    refreshToken: getParam('refresh_token'),
    expiresIn: Number.isFinite(expiresIn) ? expiresIn : undefined,
    code: getParam('code'),
    type: getParam('type'),
    error,
  };
}

function removeAuthCallbackParams(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  AUTH_CALLBACK_PARAMS.forEach((param) => url.searchParams.delete(param));

  const hashWithoutPrefix = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (hashWithoutPrefix) {
    const hashParams = new URLSearchParams(hashWithoutPrefix);
    AUTH_CALLBACK_PARAMS.forEach((param) => hashParams.delete(param));
    const nextHash = hashParams.toString();
    url.hash = nextHash ? `#${nextHash}` : '';
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, document.title, nextUrl);
}

async function handleAuthCallback(): Promise<AuthCallbackResult | null> {
  const callbackParams = readAuthCallbackParams();
  if (!callbackParams) return null;

  try {
    if (callbackParams.error) throw new Error(callbackParams.error);

    if (callbackParams.accessToken && callbackParams.refreshToken) {
      const session = await supabase.auth.setSession({
        access_token: callbackParams.accessToken,
        refresh_token: callbackParams.refreshToken,
        expires_in: callbackParams.expiresIn,
      });
      return { session };
    }

    if (callbackParams.code || callbackParams.type === 'signup') {
      await supabase.auth.acknowledgeEmailVerificationCallback();
      return { session: null, status: EMAIL_VERIFIED_LOGIN_MESSAGE };
    }

    return null;
  } finally {
    removeAuthCallbackParams();
  }
}

export function useSupabaseAuth() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();

  useEffect(() => {
    let isMounted = true;

    const sessionPromise = handleAuthCallback().then(async (callbackResult) => {
      if (callbackResult) {
        if (isMounted) setStatus(callbackResult.status);
        return callbackResult.session;
      }
      return supabase.auth.getSession();
    });

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

  const signUp = useCallback(async (email: string, password: string, identity?: Pick<UserProfile, 'avatarDataUrl' | 'nickname' | 'username'>) => {
    setError(undefined);
    setStatus(undefined);
    const nextSession = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: EMAIL_CONFIRMATION_REDIRECT_URL,
        data: identity ? {
          avatarDataUrl: identity.avatarDataUrl,
          nickname: identity.nickname,
          username: identity.username,
        } : undefined,
      },
    });
    if (nextSession) setSession(nextSession);
    return nextSession;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(undefined);
    setStatus(undefined);
    const nextSession = await supabase.auth.signInWithPassword({ email, password });
    setSession(nextSession);
    return nextSession;
  }, []);

  const resendVerificationEmail = useCallback(async (email: string) => {
    setError(undefined);
    setStatus(undefined);
    await supabase.auth.resendVerificationEmail(email, EMAIL_CONFIRMATION_REDIRECT_URL);
    setStatus(EMAIL_VERIFICATION_SENT_MESSAGE);
  }, []);

  const signOut = useCallback(async () => {
    setError(undefined);
    setStatus(undefined);
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  return { session, isLoading, error: error ?? supabase.configError, status, isConfigured: supabase.isConfigured, signUp, signIn, resendVerificationEmail, signOut };
}
