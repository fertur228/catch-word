/**
 * Сброс пароля, шаг 1 — ввод email. Отправляет 6-значный код на почту
 * (Supabase resetPasswordForEmail + брендированное письмо) и уводит на экран
 * ввода кода и нового пароля (/reset-password).
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthField, PrimaryButton } from '@/components/auth-kit';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { alertAsync } from '@/lib/dialog';
import { feedbackTap } from '@/lib/feedback';
import { useT } from '@/lib/i18n';

export function ForgotPasswordScreen() {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sendPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const canSubmit = email.trim().length > 0 && !busy;

  const onSend = async () => {
    if (!canSubmit) return;
    feedbackTap();
    setBusy(true);
    try {
      await sendPasswordReset(email);
      router.replace({ pathname: '/reset-password', params: { email: email.trim() } });
    } catch {
      setBusy(false);
      void alertAsync(t('Не получилось'), t('Проверь email и попробуй ещё раз.'));
    }
  };

  return (
    <ThemedView style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.four },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back} accessibilityLabel={t('Назад')}>
            <Icon name="chevron.left" size={24} color={theme.primary} />
          </Pressable>

          <View style={[styles.mark, { backgroundColor: theme.primarySoft }]}>
            <Icon name="lock.fill" size={28} color={theme.primary} />
          </View>
          <ThemedText type="subtitle" style={styles.h}>
            {t('Сброс пароля')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
            {t('Введи email — пришлём 6-значный код, чтобы задать новый пароль.')}
          </ThemedText>

          <View style={styles.fields}>
            <AuthField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder={t('Введите email')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="go"
              onSubmitEditing={onSend}
            />
          </View>

          <View style={styles.submit}>
            <PrimaryButton title={t('Отправить код')} onPress={onSend} loading={busy} disabled={!canSubmit} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.four },
  back: { alignSelf: 'flex-start', paddingVertical: Spacing.two },
  mark: {
    width: 64,
    height: 64,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
    marginBottom: Spacing.three,
  },
  h: {},
  sub: { marginTop: Spacing.one, maxWidth: 320 },
  fields: { marginTop: Spacing.five },
  submit: { marginTop: Spacing.four },
});
