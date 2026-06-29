/**
 * Веб-вариант авторизации. Форма `AuthValue` идентична нативной (auth-context.tsx),
 * поэтому потребители (`useAuth`, collection-context, экраны) не меняются.
 *
 * Веб-флоу Google: `signInWithOAuth` делает ПОЛНЫЙ редирект страницы на Google,
 * после возврата на `/auth-callback` Supabase сам ловит токены из `#fragment`
 * (`detectSessionInUrl: true`, см. supabase.ts) и поднимает сессию. Без
 * expo-web-browser/expo-linking — это лишний вес и нативные модули.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

interface AuthValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** Войти через Google. Уводит страницу на OAuth-провайдера. */
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => {})
      .finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/auth-callback` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) throw error;
    // Дальше браузер сам уходит на Google и возвращается на /auth-callback.
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth нужно вызывать внутри <AuthProvider>');
  return ctx;
}
