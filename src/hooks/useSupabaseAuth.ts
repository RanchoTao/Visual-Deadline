import { useCallback, useEffect, useState } from 'react';
import { EMAIL_LINK_EXPIRED_MESSAGE, EMAIL_VERIFICATION_RESENT_MESSAGE, EMAIL_VERIFIED_LOGIN_MESSAGE, getAuthErrorMessage } from '../constants/authMessages';
import { getLastAuthDebugEntry, recordAuthDebugError, type AuthDebugEntry } from '../lib/authDebug';
import { authFeatureFlags, getAuthCallbackUrl, normalizePhoneE164 } from '../lib/authFeatures';
import { supabase, type IdentityProvider, type SupabaseSession } from '../lib/supabaseClient';

const EMAIL_CONFIRMATION_REDIRECT_URL = 'https://www.visualdeadline.com/auth/callback';

function getEmailRedirectTo(): string { return typeof window === 'undefined' ? EMAIL_CONFIRMATION_REDIRECT_URL : getAuthCallbackUrl(); }
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

export interface AuthCallbackPayload {
  expiresIn?: number;
  code: string | null;
  type: string | null;
  error: string | null;
  errorCode: string | null;
}

export interface AuthCallbackResult {
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
    expiresIn: Number.isFinite(expiresIn) ? expiresIn : undefined,
    code: getParam('code'),
    type: getParam('type'),
    error,
    errorCode: getParam('error_code'),
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
    if (callbackParams.errorCode === 'otp_expired' || callbackParams.error?.includes('Email link is invalid or has expired')) {
      throw new Error(EMAIL_LINK_EXPIRED_MESSAGE);
    }
    if (callbackParams.error) throw new Error(callbackParams.error);

    if (callbackParams.code) {
      const duplicateKey = `vd.auth.callback.code:${callbackParams.code}`;
      if (window.sessionStorage.getItem(duplicateKey)) return { session: await supabase.auth.getSession() };
      window.sessionStorage.setItem(duplicateKey, 'consumed');
      const session = await supabase.auth.exchangeCodeForSession(callbackParams.code);
      return { session, status: session ? undefined : EMAIL_VERIFIED_LOGIN_MESSAGE };
    }

    if (callbackParams.type === 'signup' || callbackParams.type === 'recovery') {
      return { session: null, status: EMAIL_VERIFIED_LOGIN_MESSAGE };
    }

    return null;
  } catch (error) {
    recordAuthDebugError('handleAuthCallback', error);
    throw error;
  } finally {
    removeAuthCallbackParams();
  }
}

export function useSupabaseAuth() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [authDebugInfo, setAuthDebugInfo] = useState<AuthDebugEntry | undefined>(() => getLastAuthDebugEntry());

  useEffect(() => {
    let isMounted = true;

    const handleAuthDebugError = (event: Event) => {
      if (isMounted && event instanceof CustomEvent) setAuthDebugInfo(event.detail as AuthDebugEntry);
    };
    window.addEventListener('vd:auth-debug-error', handleAuthDebugError);

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
        if (isMounted) setError(getAuthErrorMessage(authError, '读取登录状态失败。'));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    const subscription = supabase.auth.onAuthStateChange((nextSession) => {
      try {
        setSession(nextSession);
      } catch (authStateError) {
        recordAuthDebugError('onAuthStateChange', authStateError);
        throw authStateError;
      }
    });
    return () => {
      isMounted = false;
      window.removeEventListener('vd:auth-debug-error', handleAuthDebugError);
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setError(undefined);
    setStatus(undefined);
    const nextSession = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: EMAIL_CONFIRMATION_REDIRECT_URL,
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
    await supabase.auth.resendVerificationEmail(email, getEmailRedirectTo());
    setStatus(EMAIL_VERIFICATION_RESENT_MESSAGE);
  }, []);

  const signOut = useCallback(async () => {
    setError(undefined);
    setStatus(undefined);
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  const signInWithOAuth = useCallback(async (provider: IdentityProvider['provider']) => {
    setError(undefined); setStatus(undefined);
    await supabase.auth.signInWithOAuth(provider, getAuthCallbackUrl());
  }, []);

  const requestPhoneOtp = useCallback(async (phone: string) => {
    setError(undefined); setStatus(undefined);
    await supabase.auth.requestPhoneOtp({ phone: normalizePhoneE164(phone) });
  }, []);

  const verifyPhoneOtp = useCallback(async (phone: string, token: string) => {
    setError(undefined); setStatus(undefined);
    const nextSession = await supabase.auth.verifyPhoneOtp({ phone: normalizePhoneE164(phone), token });
    setSession(nextSession);
    return nextSession;
  }, []);

  return { session, isLoading, error: error ?? supabase.configError, status, authDebugInfo, isConfigured: supabase.isConfigured, featureFlags: authFeatureFlags, signUp, signIn, resendVerificationEmail, signOut, signInWithOAuth, requestPhoneOtp, verifyPhoneOtp };
}
