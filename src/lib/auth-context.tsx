/**
 * Авторизация (Google через Supabase). Веб-флоу: открываем системный браузер на
 * страницу OAuth Supabase, после возврата по deep-link `catchword://auth-callback`
 * вытаскиваем токены и ставим сессию. Без нативного Google-модуля и пересборки.
 *
 * Сессия хранится в SQLite (см. supabase.ts) и автоматически обновляется.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

interface AuthValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** Войти через Google. Бросает ошибку при сбое. */
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
    const redirectTo = Linking.createURL('auth-callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) throw error ?? new Error('Не получили ссылку авторизации');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) return;

    // implicit flow → токены во фрагменте (#access_token=...&refresh_token=...)
    const frag = result.url.includes('#')
      ? result.url.split('#')[1]
      : (result.url.split('?')[1] ?? '');
    const params = new URLSearchParams(frag);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      await supabase.auth.setSession({ access_token, refresh_token });
    }
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
