/**
 * Экран регистрации (email/пароль) — по примеру Qustar, брендированный.
 * Собирает Имя + Фамилия (в отдельных ячейках) + Email + Пароль, создаёт аккаунт
 * в Supabase (signUp) и уводит на подтверждение почты 6-значным кодом.
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

export function RegisterScreen() {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signUpWithEmail } = useAuth();

  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const canSubmit = first.trim().length > 0 && email.trim().length > 0 && password.length > 0 && !busy;

  const onRegister = async () => {
    if (busy) return;
    if (password.length < 6) {
      void alertAsync(t('Пароль коротковат'), t('Минимум 6 символов.'));
      return;
    }
    if (!canSubmit) return;
    feedbackTap();
    setBusy(true);
    try {
      await signUpWithEmail(email, password, first, last);
      // Код ушёл на почту → экран ввода кода (replace, чтобы «назад» не возвращал форму).
      router.replace({ pathname: '/verify-email', params: { email: email.trim() } });
    } catch (e) {
      const msg = String((e as { message?: string })?.message ?? '');
      if (/registered|already|exists/i.test(msg)) {
        void alertAsync(t('Email уже занят'), t('Похоже, аккаунт уже есть — попробуй войти.'));
      } else {
        void alertAsync(t('Не удалось зарегистрироваться'), t('Проверь данные и попробуй ещё раз.'));
      }
      setBusy(false);
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

          <ThemedText type="title" style={styles.h}>
            {t('Создать аккаунт')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hsub}>
            {t('Пара шагов — и начинаем ловить слова')}
          </ThemedText>

          <View style={styles.fields}>
            <AuthField
              label={t('Имя')}
              value={first}
              onChangeText={setFirst}
              placeholder={t('Иван')}
              autoCapitalize="words"
              autoComplete="name-given"
              textContentType="givenName"
              returnKeyType="next"
            />
            <AuthField
              label={t('Фамилия')}
              value={last}
              onChangeText={setLast}
              placeholder={t('Иванов')}
              autoCapitalize="words"
              autoComplete="name-family"
              textContentType="familyName"
              returnKeyType="next"
            />
            <AuthField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder={t('Введите email')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
            />
            <AuthField
              label={t('Пароль')}
              value={password}
              onChangeText={setPassword}
              placeholder={t('Минимум 6 символов')}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={onRegister}
            />
          </View>

          <View style={styles.submit}>
            <PrimaryButton title={t('Зарегистрироваться')} onPress={onRegister} loading={busy} disabled={!canSubmit} />
          </View>

          <View style={styles.bottom}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('Уже есть аккаунт?')}{' '}
            </ThemedText>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <ThemedText type="small" style={{ color: theme.primary, fontWeight: '700' }}>
                {t('Войти')}
              </ThemedText>
            </Pressable>
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
  h: { marginTop: Spacing.two },
  hsub: { marginTop: Spacing.one },
  fields: { gap: Spacing.three, marginTop: Spacing.five },
  submit: { marginTop: Spacing.five },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.four, flexWrap: 'wrap' },
});
