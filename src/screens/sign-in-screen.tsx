/**
 * Экран входа (login-wall) — по email и паролю, в духе примера Qustar.
 * Логотип + карточка «Добро пожаловать / Войдите в свой аккаунт», поля Email и
 * Пароль, «Забыли пароль?», кнопка «Войти» и переход на регистрацию.
 *
 * Регистрация нового аккаунта — на отдельном экране (/register), подтверждение
 * почты кодом — /verify-email. Первый вход СОЗДАЁТСЯ только после подтверждения.
 */
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthField, BRAND_BLUE, PrimaryButton } from '@/components/auth-kit';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { alertAsync } from '@/lib/dialog';
import { feedbackTap } from '@/lib/feedback';

const LOGO = require('../../assets/images/logo.png');

export function SignInScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signInWithEmail, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [gbusy, setGbusy] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  const onLogin = async () => {
    if (!canSubmit) return;
    feedbackTap();
    setBusy(true);
    try {
      await signInWithEmail(email, password);
      // Успех — дальше ведёт гейт в _layout (профиль/онбординг/вкладки).
    } catch (e) {
      const msg = String((e as { message?: string })?.message ?? '');
      if (/confirm/i.test(msg)) {
        // Почта ещё не подтверждена — отправляем на ввод кода.
        router.push({ pathname: '/verify-email', params: { email: email.trim() } });
      } else {
        void alertAsync('Не удалось войти', 'Проверь email и пароль.');
      }
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    if (gbusy) return;
    feedbackTap();
    setGbusy(true);
    try {
      await signInWithGoogle();
      // Успех — Google уже подтвердил почту, код не нужен; дальше ведёт гейт.
    } catch {
      void alertAsync('Не удалось войти', 'Вход через Google не завершён. Попробуй ещё раз.');
    } finally {
      setGbusy(false);
    }
  };

  return (
    <ThemedView style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + Spacing.six, paddingBottom: insets.bottom + Spacing.four },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Animated.Image
            entering={FadeInDown.duration(Motion.duration.slow)}
            source={LOGO}
            resizeMode="cover"
            style={styles.logo}
          />
          <ThemedText type="small" themeColor="textSecondary" style={styles.tagline}>
            Учи язык, фотографируя мир вокруг
          </ThemedText>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
            <ThemedText type="subtitle" style={styles.h}>
              Добро пожаловать!
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.hsub}>
              Войдите в свой аккаунт
            </ThemedText>

            <View style={styles.fields}>
              <AuthField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="Введите email"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
              />
              <AuthField
                label="Пароль"
                value={password}
                onChangeText={setPassword}
                placeholder="Введите пароль"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={onLogin}
              />
            </View>

            <Pressable onPress={() => router.push('/forgot-password')} hitSlop={8} style={styles.forgot}>
              <ThemedText type="small" style={{ color: BRAND_BLUE, fontWeight: '600' }}>
                Забыли пароль?
              </ThemedText>
            </Pressable>

            <PrimaryButton title="Войти" onPress={onLogin} loading={busy} disabled={!canSubmit} />

            <View style={styles.divider}>
              <View style={[styles.line, { backgroundColor: theme.border }]} />
              <ThemedText type="small" themeColor="textSecondary">
                или
              </ThemedText>
              <View style={[styles.line, { backgroundColor: theme.border }]} />
            </View>

            <Pressable
              onPress={onGoogle}
              disabled={gbusy}
              style={({ pressed }) => [
                styles.google,
                { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
              ]}>
              {gbusy ? (
                <ActivityIndicator color={theme.text} />
              ) : (
                <>
                  <Text style={styles.gMark}>G</Text>
                  <ThemedText type="default" style={styles.gLabel}>
                    Продолжить с Google
                  </ThemedText>
                </>
              )}
            </Pressable>

            <View style={styles.bottom}>
              <ThemedText type="small" themeColor="textSecondary">
                Нет аккаунта?{' '}
              </ThemedText>
              <Pressable onPress={() => router.push('/register')} hitSlop={8}>
                <ThemedText type="small" style={{ color: BRAND_BLUE, fontWeight: '700' }}>
                  Зарегистрироваться
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.four, justifyContent: 'center' },

  logo: { width: 220, height: 116, alignSelf: 'center', borderRadius: Radius.xl },
  tagline: { textAlign: 'center', maxWidth: 320, alignSelf: 'center', marginTop: Spacing.two },

  card: {
    marginTop: Spacing.five,
    padding: Spacing.four,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  h: { textAlign: 'center' },
  hsub: { textAlign: 'center', marginTop: Spacing.one },
  fields: { gap: Spacing.three, marginTop: Spacing.four },
  forgot: { alignSelf: 'flex-start', marginTop: Spacing.two, marginBottom: Spacing.three },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.three, flexWrap: 'wrap' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginVertical: Spacing.three },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  gMark: { fontSize: 18, fontWeight: '700', color: '#4285F4' },
  gLabel: { fontWeight: '600' },
});
