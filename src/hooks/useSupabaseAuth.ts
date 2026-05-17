import { useCallback, useEffect, useState } from 'react';
import { supabase, type SupabaseSession } from '../lib/supabaseClient';

export function useSupabaseAuth() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession()
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
    const nextSession = await supabase.auth.signUp({ email, password });
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
