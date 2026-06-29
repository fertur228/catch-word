/**
 * Возврат после Google OAuth (только веб). Supabase уже поймал токены из
 * `#fragment` (detectSessionInUrl), здесь мы лишь ждём появления сессии и
 * уходим в приложение. На нативе не используется (вход идёт через deep-link).
 */
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

  // Сессия поднялась — уходим в приложение (дальше сработает гейт онбординга).
  if (!loading && session) return <Redirect href="/" />;

  return (
    <ThemedView style={styles.center}>
      <ActivityIndicator color={theme.primary} />
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
