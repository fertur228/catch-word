/**
 * Нижняя навигация: четыре вкладки — Камера, Коллекция, Повторение, Настройки.
 * На вкладке «Повторение» — бейдж с числом карточек к повторению.
 */
import { Tabs } from 'expo-router';

import { Icon } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';
import { useCollection } from '@/lib/collection-context';

export default function TabsLayout() {
  const theme = useTheme();
  const { stats } = useCollection();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: theme.tabBar, borderTopColor: theme.border },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Камера',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Icon name="camera.fill" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: 'Коллекция',
          tabBarIcon: ({ color, size }) => <Icon name="square.grid.2x2.fill" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: 'Повторение',
          tabBarIcon: ({ color, size }) => <Icon name="graduationcap.fill" size={size} color={color} />,
          tabBarBadge: stats.dueCount > 0 ? stats.dueCount : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.accent, color: '#FFFFFF' },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Настройки',
          tabBarIcon: ({ color, size }) => <Icon name="gearshape.fill" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
