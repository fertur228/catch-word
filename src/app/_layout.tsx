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
import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, Redirect, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { CollectionProvider, useCollection } from '@/lib/collection-context';

// Держим сплеш на экране, пока не загрузим коллекцию/настройки.
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Внутренний навигатор: уже внутри CollectionProvider, поэтому видит prefs. */
function RootNavigator() {
  const scheme = useColorScheme();
  const { loading, prefs } = useCollection();

  // Прячем сплеш, как только данные готовы.
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  // Пока грузимся — ничего не рисуем (под нами виден нативный сплеш).
  if (loading) return null;

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* Общая «гладкая» анимация переходов по умолчанию (push-экраны). */}
      <Stack screenOptions={{ animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="result" options={{ presentation: 'modal', title: 'Результат' }} />
        <Stack.Screen name="card/[id]" options={{ title: 'Карточка' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', title: 'CatchWord Premium' }} />
        <Stack.Screen name="settings" options={{ title: 'Настройки' }} />
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
      {!prefs.onboarded ? <Redirect href="/onboarding" /> : null}

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <CollectionProvider>
      <RootNavigator />
    </CollectionProvider>
  );
}
