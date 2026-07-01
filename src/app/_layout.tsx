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
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, Redirect, Stack, ThemeProvider, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { AuthProvider, useAuth } from '@/lib/auth-context';
import { CollectionProvider, useCollection } from '@/lib/collection-context';
import { useGuest } from '@/lib/web-guest';

// Держим сплеш на экране, пока не загрузим коллекцию/настройки.
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Внутренний навигатор: уже внутри CollectionProvider, поэтому видит prefs. */
function RootNavigator() {
  const scheme = useColorScheme();
  const { loading, prefs, completeOnboarding } = useCollection();
  const { session, loading: authLoading } = useAuth();
  const guest = useGuest();
  const segments = useSegments();
  const isWeb = Platform.OS === 'web';
  // Публичные (маркетинговые) маршруты, возврат OAuth и возврат с оплаты Polar —
  // без гейтов. Без payment-success покупатель, вернувшийся с Polar до того как
  // сессия восстановилась (или гость), улетал бы на лендинг со входом.
  const first = segments[0] as string | undefined;
  const onPublic =
    first === '(marketing)' || first === 'auth-callback' || first === 'payment-success';

  // Прячем сплеш, как только данные готовы.
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  // Веб: пользователь уже видел лендинг — онбординг не нужен.
  // Автоматически помечаем как пройденный при первом входе (гость или Google).
  useEffect(() => {
    if (isWeb && !loading && !prefs.onboarded && (guest || !!session)) {
      void completeOnboarding();
    }
  }, [isWeb, loading, prefs.onboarded, guest, session, completeOnboarding]);

  // Пока грузимся (на вебе ещё и сессия) — ничего не рисуем.
  if (loading || (isWeb && authLoading)) return null;

  // Веб-гейт: аноним (не вошёл и не гость) на приватном маршруте → на лендинг.
  if (isWeb && !onPublic && !session && !guest) {
    return <Redirect href="/welcome" />;
  }

  // Нужно ли показать онбординг (только нативные платформы, на вебе — никогда).
  const needOnboarding = !isWeb && !onPublic && !prefs.onboarded;

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* Общая «гладкая» анимация переходов по умолчанию (push-экраны). */}
      <Stack screenOptions={{ animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(marketing)" options={{ headerShown: false }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="payment-success" options={{ headerShown: false }} />
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

      {/* Гейт: не прошёл онбординг → на экран выбора языка (спека §5.1). */}
      {needOnboarding ? <Redirect href="/onboarding" /> : null}

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <CollectionProvider>
        <RootNavigator />
      </CollectionProvider>
    </AuthProvider>
  );
}
