/**
 * Нижняя навигация: четыре вкладки — Камера, Коллекция, Повторение, Настройки.
 * На вкладке «Повторение» — бейдж с числом карточек к повторению.
 */
import { Tabs } from 'expo-router';

import { AnimatedTabBar } from '@/components/animated-tab-bar';
import { Icon } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';
import { useCollection } from '@/lib/collection-context';
import { useT } from '@/lib/i18n';

export default function TabsLayout() {
  const theme = useTheme();
  const { stats } = useCollection();
  const t = useT();

  return (
    <Tabs
      // Кастомный анимированный таб-бар (скользящий индикатор, pop иконок, хаптика).
      // props типизированы недрами React Navigation — приводим к нашему узкому типу.
      tabBar={(props) => <AnimatedTabBar {...(props as any)} />}
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('Камера'),
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Icon name="camera.fill" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: t('Коллекция'),
          tabBarIcon: ({ color, size }) => <Icon name="square.grid.2x2.fill" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: t('Повторение'),
          tabBarIcon: ({ color, size }) => <Icon name="graduationcap.fill" size={size} color={color} />,
          tabBarBadge: stats.dueCount > 0 ? stats.dueCount : undefined,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('Настройки'),
          tabBarIcon: ({ color, size }) => <Icon name="gearshape.fill" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
