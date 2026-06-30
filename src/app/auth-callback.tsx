/**
 * Возврат после Google OAuth (только веб). Supabase ловит токены из `#fragment`
 * (flowType:'implicit', detectSessionInUrl:true) и поднимает сессию через
 * onAuthStateChange. Ждём сессию и уходим в приложение.
 * Таймаут 8 с: если сессия не появилась — что-то пошло не так, возвращаем на лендинг.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';

export default function AuthCallback() {
  const theme = useTheme();
  const { session, loading } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, []);

  if (!loading && session) return <Redirect href="/" />;
  if (timedOut && !session) return <Redirect href="/welcome" />;

  return (
    <ThemedView style={styles.center}>
      <ActivityIndicator color={theme.primary} size="large" />
      <ThemedText type="default" themeColor="textSecondary" style={styles.text}>
        Завершаем вход…
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { marginTop: Spacing.three },
});
