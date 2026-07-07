/**
 * Кастомный нижний таб-бар: под активной вкладкой едет мягкая «таблетка»
 * (skользящий индикатор, spring), иконка выбранной вкладки чуть подрастает,
 * на выбор — хаптика, а бейдж «к повтору» появляется с пружинным pop.
 *
 * Всё на Reanimated (UI-поток, transform+opacity). Поведение вкладок (навигация,
 * события tabPress, доступность) сохранено как в React Navigation.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { feedbackSelection } from '@/lib/feedback';

/**
 * Минимальный тип пропсов таб-бара (то, что реально используем). React Navigation
 * не отдаёт типы напрямую в этом окружении, поэтому описываем локально.
 */
type TabRoute = { key: string; name: string; params?: object };
type TabIconArgs = { focused: boolean; color: string; size: number };
type TabDescriptorOptions = {
  title?: string;
  tabBarLabel?: string | ((p: { focused: boolean; color: string }) => React.ReactNode);
  tabBarBadge?: string | number;
  tabBarAccessibilityLabel?: string;
  tabBarIcon?: (p: TabIconArgs) => React.ReactNode;
};
interface TabBarProps {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, { options: TabDescriptorOptions }>;
  navigation: {
    emit: (e: { type: string; target: string; canPreventDefault?: boolean }) => { defaultPrevented: boolean };
    navigate: (name: string, params?: object) => void;
  };
}

function TabItem({
  focused,
  color,
  label,
  badge,
  renderIcon,
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
  focused: boolean;
  color: string;
  label: string;
  badge?: number;
  renderIcon: (color: string, size: number) => React.ReactNode;
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel?: string;
}) {
  const reduce = useReduceMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduce) return;
    scale.value = withSpring(focused ? 1.12 : 1, Motion.spring.snappy);
  }, [focused, reduce, scale]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.item}>
      <Animated.View style={iconStyle}>
        {renderIcon(color, 26)}
        {badge != null && badge > 0 ? (
          <View style={styles.badgeWrap}>
            <Badge value={badge} />
          </View>
        ) : null}
      </Animated.View>
      <ThemedText type="code" style={[styles.label, { color }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Badge({ value }: { value: number }) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const scale = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (reduce) return;
    scale.value = withSpring(1, Motion.spring.bouncy);
  }, [reduce, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[styles.badge, { backgroundColor: theme.danger }, style]}>
      <ThemedText style={styles.badgeText}>{value > 99 ? '99+' : value}</ThemedText>
    </Animated.View>
  );
}

export function AnimatedTabBar({ state, descriptors, navigation }: TabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);

  const count = state.routes.length;
  const tabWidth = width > 0 ? width / count : 0;
  const indicatorX = useSharedValue(0);

  useEffect(() => {
    // + Spacing.two: пилюля вставлена на этот отступ ВНУТРИ вкладки (симметрично,
    // по Spacing.two с каждой стороны), поэтому её translateX должен включать тот
    // же отступ. Иначе индикатор съезжает влево (было: 8px слева / 16px справа).
    const target = state.index * tabWidth + Spacing.two;
    indicatorX.value = reduce ? target : withSpring(target, Motion.spring.snappy);
  }, [state.index, tabWidth, reduce, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[
        styles.bar,
        { backgroundColor: theme.tabBar, borderTopColor: theme.border, paddingBottom: insets.bottom },
      ]}>
      {tabWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            { width: tabWidth - Spacing.two * 2, backgroundColor: theme.primarySoft },
            indicatorStyle,
          ]}
        />
      ) : null}

      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const color = focused ? theme.primary : theme.textSecondary;
        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : options.title ?? route.name;
        const badge = typeof options.tabBarBadge === 'number' ? options.tabBarBadge : undefined;

        const onPress = () => {
          feedbackSelection();
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params as object);
          }
        };
        const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

        return (
          <TabItem
            key={route.key}
            focused={focused}
            color={color}
            label={String(label)}
            badge={badge}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            renderIcon={(c, size) => options.tabBarIcon?.({ focused, color: c, size }) ?? null}
            onPress={onPress}
            onLongPress={onLongPress}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
  // Высота = высоте элемента (paddingV 8 + иконка 26 + gap 2 + подпись 13), top = paddingTop
  // бара → пилюля покрывает элемент целиком, и иконка+подпись стоят РОВНО по её центру.
  indicator: { position: 'absolute', top: Spacing.two, bottom: 'auto', height: 49, borderRadius: Radius.md, left: 0 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: Spacing.one },
  label: { fontSize: 11, lineHeight: 13 },
  badgeWrap: { position: 'absolute', top: -6, right: -12 },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontWeight: '700' },
});
