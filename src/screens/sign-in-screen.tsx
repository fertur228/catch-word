/**
 * Экран входа (login-wall) — по email и паролю, в духе примера Qustar.
 * Логотип + карточка «Добро пожаловать / Войдите в свой аккаунт», поля Email и
 * Пароль, «Забыли пароль?», кнопка «Войти» и переход на регистрацию.
 *
 * Регистрация нового аккаунта — на отдельном экране (/register), подтверждение
 * почты кодом — /verify-email. Первый вход СОЗДАЁТСЯ только после подтверждения.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthField, PrimaryButton } from '@/components/auth-kit';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { alertAsync } from '@/lib/dialog';
import { feedbackTap } from '@/lib/feedback';
import { useT } from '@/lib/i18n';

const LOGO = require('../../assets/images/logo.png');

export function SignInScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scheme = useColorScheme();
  const t = useT();
  const { signInWithEmail, signInWithGoogle, signInWithApple } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [gbusy, setGbusy] = useState(false);
  const [abusy, setAbusy] = useState(false);
  // Sign in with Apple — только iOS 13+. Проверяем доступность и показываем кнопку.
  const [appleReady, setAppleReady] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setAppleReady).catch(() => {});
  }, []);

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
        void alertAsync(t('Не удалось войти'), t('Проверь email и пароль.'));
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
      void alertAsync(t('Не удалось войти'), t('Вход через Google не завершён. Попробуй ещё раз.'));
    } finally {
      setGbusy(false);
    }
  };

  const onApple = async () => {
    if (abusy) return;
    feedbackTap();
    setAbusy(true);
    try {
      await signInWithApple();
      // Успех — Apple подтвердил личность и почту; дальше ведёт гейт.
    } catch (e) {
      // Отмену пользователем не считаем ошибкой (Apple кидает ERR_REQUEST_CANCELED).
      if ((e as { code?: string })?.code !== 'ERR_REQUEST_CANCELED') {
        void alertAsync(t('Не удалось войти'), t('Вход через Apple не завершён. Попробуй ещё раз.'));
      }
    } finally {
      setAbusy(false);
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
            {t('Учи язык, фотографируя мир вокруг')}
          </ThemedText>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
            <ThemedText type="subtitle" style={styles.h}>
              {t('Добро пожаловать!')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.hsub}>
              {t('Войдите в свой аккаунт')}
            </ThemedText>

            <View style={styles.fields}>
              <AuthField
                label={t('Email')}
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
                placeholder={t('Введите пароль')}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={onLogin}
              />
            </View>

            <Pressable onPress={() => router.push('/forgot-password')} hitSlop={8} style={styles.forgot}>
              <ThemedText type="small" style={{ color: theme.primary, fontWeight: '600' }}>
                {t('Забыли пароль?')}
              </ThemedText>
            </Pressable>

            <PrimaryButton title={t('Войти')} onPress={onLogin} loading={busy} disabled={!canSubmit} />

            <View style={styles.divider}>
              <View style={[styles.line, { backgroundColor: theme.border }]} />
              <ThemedText type="small" themeColor="textSecondary">
                {t('или')}
              </ThemedText>
              <View style={[styles.line, { backgroundColor: theme.border }]} />
            </View>

            {Platform.OS === 'ios' && appleReady ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={
                  scheme === 'dark'
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={Radius.md}
                style={styles.apple}
                onPress={onApple}
              />
            ) : null}

            <Pressable
              onPress={onGoogle}
              disabled={gbusy}
              style={({ pressed }) => [
                styles.google,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
              ]}>
              {gbusy ? (
                <ActivityIndicator color={theme.text} />
              ) : (
                <>
                  <Text style={styles.gMark}>G</Text>
                  <ThemedText type="default" style={styles.gLabel}>
                    {t('Продолжить с Google')}
                  </ThemedText>
                </>
              )}
            </Pressable>

            <View style={styles.bottom}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Нет аккаунта?')}{' '}
              </ThemedText>
              <Pressable onPress={() => router.push('/register')} hitSlop={8}>
                <ThemedText type="small" style={{ color: theme.primary, fontWeight: '700' }}>
                  {t('Зарегистрироваться')}
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
  // Обе соц-кнопки — единый размер: высота 52, на всю ширину, радиус Radius.md.
  // Apple — нативная сплошная плашка (её стиль менять нельзя, Apple 4.0). Google
  // держим того же размера, но с ЗАЛИВКОЙ (systemGray6) и чёткой рамкой 1pt,
  // иначе белая кнопка на белой карточке читалась легче/«меньше» (фидбэк).
  apple: { height: 52, width: '100%', marginBottom: Spacing.two },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  // Размер шрифта подогнан под нативную кнопку Apple: её текст ≈20pt (cap ~14pt),
  // а ThemedText default = 17pt читался мельче. Apple-кнопку менять нельзя,
  // поэтому равняем Google на неё.
  gMark: { fontSize: 20, fontWeight: '700', color: '#4285F4' },
  gLabel: { fontSize: 20, fontWeight: '600' },
});
