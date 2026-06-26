/**
 * Корневой layout приложения.
 *  - оборачивает всё в CollectionProvider (глобальная коллекция карточек);
 *  - задаёт навигацию верхнего уровня (Stack): группа вкладок + модалки.
 *
 * «Группа» (tabs) не видна в URL — это просто способ сгруппировать роуты.
 * Экраны result/paywall открываются как модалки поверх вкладок.
 */
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { CollectionProvider } from '@/lib/collection-context';

export default function RootLayout() {
  const scheme = useColorScheme();

  // Прячем нативный сплеш, когда JS готов (иначе он может «зависнуть»).
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <CollectionProvider>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="result" options={{ presentation: 'modal', title: 'Результат' }} />
          <Stack.Screen name="card/[id]" options={{ title: 'Карточка' }} />
          <Stack.Screen name="paywall" options={{ presentation: 'modal', title: 'CatchWord Premium' }} />
          <Stack.Screen name="settings" options={{ title: 'Настройки' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </CollectionProvider>
  );
}
