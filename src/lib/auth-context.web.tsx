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
  /** Вход по email и паролю. */
  signInWithEmail: (email: string, password: string) => Promise<void>;
  /** Регистрация по email/паролю (+ имя/фамилия в метаданных). Шлёт код на почту. */
  signUpWithEmail: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  /** Подтвердить почту 6-значным кодом (после регистрации). Поднимает сессию. */
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  /** Отправить код подтверждения повторно. */
  resendSignupOtp: (email: string) => Promise<void>;
  /** Отправить письмо со 6-значным кодом для сброса пароля. */
  sendPasswordReset: (email: string) => Promise<void>;
  /** Подтвердить код сброса пароля (recovery OTP) — поднимает сессию. */
  verifyRecoveryOtp: (email: string, token: string) => Promise<void>;
  /** Задать новый пароль (в активной сессии). */
  updatePassword: (newPassword: string) => Promise<void>;
  /** Сохранить имя/фамилию в профиль аккаунта (шаг регистрации). */
  updateProfileName: (firstName: string, lastName: string) => Promise<void>;
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

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ) => {
    const first = firstName.trim();
    const last = lastName.trim();
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: first,
          last_name: last,
          full_name: [first, last].filter(Boolean).join(' '),
          profile_completed: true,
        },
      },
    });
    if (error) throw error;
  };

  const verifyEmailOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'signup',
    });
    if (error) throw error;
  };

  const resendSignupOtp = async (email: string) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    if (error) throw error;
  };

  const sendPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) throw error;
  };

  const verifyRecoveryOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'recovery',
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  const updateProfileName = async (firstName: string, lastName: string) => {
    const first = firstName.trim();
    const last = lastName.trim();
    const { error } = await supabase.auth.updateUser({
      data: {
        first_name: first,
        last_name: last,
        full_name: [first, last].filter(Boolean).join(' '),
        profile_completed: true,
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        verifyEmailOtp,
        resendSignupOtp,
        sendPasswordReset,
        verifyRecoveryOtp,
        updatePassword,
        updateProfileName,
        signOut,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth нужно вызывать внутри <AuthProvider>');
  return ctx;
}
