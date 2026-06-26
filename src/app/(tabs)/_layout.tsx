/**
 * Нижняя навигация (спека §5.2, §5.5, §5.6): три вкладки —
 * Камера, Коллекция и Повторение. Доступ к Настройкам — иконка-шестерёнка
 * в заголовке (на Камере шестерёнка своя, поверх превью).
 *
 * На вкладке «Повторение» показываем бейдж с числом карточек, которые пора
 * повторить (из useCollection().stats.dueCount).
 */
import { Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';

import { Icon } from '@/components/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCollection } from '@/lib/collection-context';

export default function TabsLayout() {
  const theme = useTheme();
  const router = useRouter();
  const { stats } = useCollection();

  // Шестерёнка настроек в правом верхнем углу (для вкладок с заголовком).
  const gear = () => (
    <Pressable
      onPress={() => router.push('/settings')}
      hitSlop={10}
      style={{ paddingHorizontal: Spacing.three }}>
      <Icon name="gearshape.fill" size={22} color={theme.text} />
    </Pressable>
  );

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
          headerRight: gear,
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: 'Повторение',
          tabBarIcon: ({ color, size }) => <Icon name="graduationcap.fill" size={size} color={color} />,
          // Бейдж «пора повторить» — только если есть что повторять.
          tabBarBadge: stats.dueCount > 0 ? stats.dueCount : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.accent, color: '#FFFFFF' },
          headerRight: gear,
        }}
      />
    </Tabs>
  );
}
