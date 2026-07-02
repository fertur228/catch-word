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
import { Platform, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, Redirect, Stack, ThemeProvider, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplash } from '@/components/animated-splash';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { CollectionProvider, useCollection } from '@/lib/collection-context';

// Держим сплеш на экране, пока не загрузим коллекцию/настройки.
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Внутренний навигатор: уже внутри CollectionProvider, поэтому видит prefs. */
function RootNavigator() {
  const scheme = useColorScheme();
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
  const needsProfile = !!session && !session.user.user_metadata?.profile_completed;
  let authRedirect: '/sign-in' | '/complete-profile' | '/onboarding' | null = null;
  if (!onPublic) {
    if (!session) {
      if (!onAuthRoute) authRedirect = '/sign-in';
    } else if (needsProfile) authRedirect = '/complete-profile';
    else if (!prefs.onboarded) authRedirect = '/onboarding';
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
        <Stack.Screen name="result" options={{ presentation: 'modal', title: 'Результат' }} />
        <Stack.Screen name="card/[id]" options={{ title: 'Карточка' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', title: 'CatchWord Premium' }} />
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
