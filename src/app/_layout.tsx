/**
 * Корневой layout приложения.
 *  - оборачивает всё в CollectionProvider (коллекция + настройки пользователя);
 *  - держит нативный сплеш, пока грузятся данные/настройки;
 *  - «гейт онбординга»: если пользователь ещё не выбрал язык — перенаправляем
 *    его на /onboarding (спека §5.1);
 *  - задаёт навигацию верхнего уровня (Stack): группа вкладок + модалки.
 *
 * «Группа» (tabs) не видна в URL — это просто способ сгруппировать роуты.
 * Экраны result/paywall/onboarding открываются как модалки поверх вкладок.
 */
import { useEffect, useState } from 'react';
import { Platform, Pressable, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, Redirect, Stack, ThemeProvider, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplash } from '@/components/animated-splash';
import { Icon } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { closeModal } from '@/lib/close-modal';
import { CollectionProvider, useCollection } from '@/lib/collection-context';
import { initLang, useT } from '@/lib/i18n';

/** Крестик в хедере модалки — единственный гарантированный выход на вебе. */
function HeaderClose() {
  const theme = useTheme();
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Закрыть')}
      hitSlop={12}
      onPress={closeModal}
      style={({ pressed }) => ({ padding: 6, opacity: pressed ? 0.6 : 1 })}>
      <Icon name="xmark" size={18} color={theme.text} />
    </Pressable>
  );
}

// Держим сплеш на экране, пока не загрузим коллекцию/настройки.
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Внутренний навигатор: уже внутри CollectionProvider, поэтому видит prefs. */
function RootNavigator() {
  const scheme = useColorScheme();
  const t = useT();
  const { loading, prefs } = useCollection();
  const { session, loading: authLoading } = useAuth();
  const segments = useSegments();
  const isWeb = Platform.OS === 'web';
  // Брендовый сплеш проигрывается один раз на старте (только нативно).
  const [splashDone, setSplashDone] = useState(false);
  // Публичные (маркетинговые) маршруты, возврат OAuth и возврат с оплаты Polar —
  // без гейтов. Без payment-success покупатель, вернувшийся с Polar до того как
  // сессия восстановилась (или гость), улетал бы на лендинг со входом.
  const first = segments[0] as string | undefined;
  const onPublic =
    first === '(marketing)' || first === 'auth-callback' || first === 'payment-success';

  // Прячем нативный сплеш, когда готовы и данные, и сессия (иначе на нативе
  // мелькнул бы экран входа до восстановления сессии). Дальше поверх играет
  // брендовый AnimatedSplash.
  useEffect(() => {
    if (!loading && !authLoading) SplashScreen.hideAsync().catch(() => {});
  }, [loading, authLoading]);

  // Пока грузимся (данные + сессия) — ничего не рисуем (нативный сплеш держит кадр).
  if (loading || authLoading) return null;

  // Единый login-wall (веб и натив одинаково): вход → регистрация/подтверждение
  // → профиль → онбординг → приложение. Экраны авторизации и маркетинг доступны
  // без сессии (между ними можно свободно ходить).
  const onAuthRoute =
    first === 'sign-in' ||
    first === 'register' ||
    first === 'verify-email' ||
    first === 'forgot-password' ||
    first === 'reset-password';
  // Sign in with Apple / Google уже сообщают имя и email (Authentication
  // Services / OAuth). Apple Guideline 4 запрещает потом заставлять вводить их
  // вручную, поэтому для сторонних провайдеров экран complete-profile НЕ
  // показываем — имя берём из провайдера (см. signInWithApple), пустое допустимо
  // и его можно дозаполнить позже. Провайдер известен сразу из сессии, поэтому
  // экран имени не мелькнёт даже на время записи метаданных. complete-profile
  // остаётся лишь фолбэком для email-аккаунтов без profile_completed.
  const appMeta = session?.user?.app_metadata;
  const providerList = [appMeta?.provider, ...((appMeta?.providers as string[] | undefined) ?? [])];
  const isThirdPartyLogin = providerList.includes('apple') || providerList.includes('google');
  const needsProfile =
    !!session && !isThirdPartyLogin && !session.user.user_metadata?.profile_completed;
  let authRedirect: '/' | '/sign-in' | '/welcome' | '/complete-profile' | '/onboarding' | null = null;
  if (!onPublic) {
    if (!session) {
      // Аноним → сразу на вход (login-wall). Маркетинг-лендинг теперь отдельный
      // статический сайт на catch-words.com; приложение (app.catch-words.com) —
      // это уже сам продукт, публичный /welcome тут не нужен.
      if (!onAuthRoute) authRedirect = '/sign-in';
    } else if (needsProfile) authRedirect = '/complete-profile';
    else if (!prefs.onboarded) authRedirect = '/onboarding';
    // Уже вошёл + профиль + онбординг пройдены, но всё ещё на экране входа
    // (вернулся после логаута — флаг онбординга остаётся) → уводим в приложение.
    // Только /sign-in: /verify-email и /reset-password имеют легитимную сессию по ходу флоу.
    else if (first === 'sign-in') authRedirect = '/';
  }

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* Общая «гладкая» анимация переходов по умолчанию (push-экраны). */}
      <Stack screenOptions={{ animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(marketing)" options={{ headerShown: false }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="payment-success" options={{ headerShown: false }} />
        <Stack.Screen
          name="sign-in"
          options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }}
        />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="verify-email" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen
          name="complete-profile"
          options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
        />
        <Stack.Screen name="result" options={{ presentation: 'modal', title: t('Результат') }} />
        <Stack.Screen name="card/[id]" options={{ title: t('Карточка') }} />
        <Stack.Screen
          name="paywall"
          options={{
            presentation: 'modal',
            title: 'TakeWord Premium',
            // Явный выход обязателен: на вебе у модалки нет back после прямого
            // захода, и юзер запирался на пейволле (фидбэк тестеров 14.07).
            headerRight: () => <HeaderClose />,
          }}
        />
        {/* Промежуточный экран съёмки: плавный кросс-фейд поверх камеры,
            свайп-закрытие отключено (камера → /scanning → replace на /result). */}
        <Stack.Screen
          name="scanning"
          options={{
            headerShown: false,
            presentation: 'transparentModal',
            animation: 'fade',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="onboarding"
          options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }}
        />
      </Stack>

      {/* Гейт входа/профиля/онбординга (нативный login-wall). */}
      {authRedirect ? <Redirect href={authRedirect} /> : null}

      {/* Брендовый сплеш поверх всего — короткая анимация на старте (нативно). */}
      {!isWeb && !splashDone ? <AnimatedSplash onDone={() => setSplashDone(true)} /> : null}

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  // Читаем сохранённый язык интерфейса на старте (дефолт — английский).
  useEffect(() => {
    void initLang();
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <CollectionProvider>
          <RootNavigator />
        </CollectionProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
