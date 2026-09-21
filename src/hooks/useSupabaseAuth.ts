import { useCallback, useEffect, useRef, useState } from 'react';
import { EMAIL_VERIFICATION_RESENT_MESSAGE, EMAIL_VERIFIED_LOGIN_MESSAGE, getAuthErrorMessage } from '../constants/authMessages';
import { getLastAuthDebugEntry, recordAuthDebugError, type AuthDebugEntry } from '../lib/authDebug';
import { authFeatureFlags, getAuthCallbackUrl, normalizePhoneE164, PhoneOtpCooldown } from '../lib/authFeatures';
import { handleExplicitAuthCallback } from '../lib/authCallback';
import { supabase, type IdentityProvider, type SupabaseSession } from '../lib/supabaseClient';

function getEmailRedirectTo(): string { return getAuthCallbackUrl(); }

export function useSupabaseAuth() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [authDebugInfo, setAuthDebugInfo] = useState<AuthDebugEntry | undefined>(() => getLastAuthDebugEntry());
  const phoneCooldown = useRef(new PhoneOtpCooldown());
  const [phoneResendRemainingMs, setPhoneResendRemainingMs] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const handleAuthDebugError = (event: Event) => {
      if (isMounted && event instanceof CustomEvent) setAuthDebugInfo(event.detail as AuthDebugEntry);
    };
    window.addEventListener('vd:auth-debug-error', handleAuthDebugError);

    const sessionPromise = handleExplicitAuthCallback(supabase.auth, {
      href: window.location.href,
      sessionStorage: window.sessionStorage,
      replaceUrl: (nextUrl) => window.history.replaceState(window.history.state, document.title, nextUrl),
    }).then(async (callbackResult) => {
      if (callbackResult) {
        if (isMounted) setStatus(callbackResult.status === 'verified' || !callbackResult.session ? EMAIL_VERIFIED_LOGIN_MESSAGE : undefined);
        return callbackResult.session;
      }
      return supabase.auth.getSession();
    });

    sessionPromise
      .then((currentSession) => {
        if (isMounted) setSession(currentSession);
      })
      .catch((authError) => {
        recordAuthDebugError('handleAuthCallback', authError);
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
        emailRedirectTo: getEmailRedirectTo(),
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
    phoneCooldown.current.assertAvailable();
    await supabase.auth.requestPhoneOtp({ phone: normalizePhoneE164(phone) });
    phoneCooldown.current.request();
    setPhoneResendRemainingMs(phoneCooldown.current.remainingMs());
  }, []);

  useEffect(() => {
    if (phoneResendRemainingMs <= 0) return;
    const timer = window.setInterval(() => setPhoneResendRemainingMs(phoneCooldown.current.remainingMs()), 1_000);
    return () => window.clearInterval(timer);
  }, [phoneResendRemainingMs]);

  const verifyPhoneOtp = useCallback(async (phone: string, token: string) => {
    setError(undefined); setStatus(undefined);
    const nextSession = await supabase.auth.verifyPhoneOtp({ phone: normalizePhoneE164(phone), token });
    setSession(nextSession);
    return nextSession;
  }, []);

  return { session, isLoading, error: error ?? supabase.configError, status, authDebugInfo, isConfigured: supabase.isConfigured, featureFlags: authFeatureFlags, signUp, signIn, resendVerificationEmail, signOut, signInWithOAuth, requestPhoneOtp, verifyPhoneOtp, phoneResendRemainingMs };
}
