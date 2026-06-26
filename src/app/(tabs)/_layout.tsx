/**
 * Нижняя навигация (спека §5.2): две вкладки — Камера и Коллекция.
 * Доступ к Настройкам — иконка-шестерёнка в заголовке Коллекции
 * (на Камере шестерёнка своя, поверх превью).
 */
import { Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';

import { Icon } from '@/components/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function TabsLayout() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
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
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/settings')}
              hitSlop={10}
              style={{ paddingHorizontal: Spacing.three }}>
              <Icon name="gearshape.fill" size={22} color={theme.text} />
            </Pressable>
          ),
        }}
      />
    </Tabs>
  );
}
