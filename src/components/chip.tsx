/**
 * Chip — выбираемая «таблетка» (фильтр по категориям, теги).
 * В отличие от Pill (статичный бейдж) — кликабельная, с активным состоянием
 * и лёгкой пружинной отдачей при нажатии.
 */
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { SFSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ChipProps {
  label: string;
  /** Подсвечен ли чип (выбран). */
  selected?: boolean;
  onPress?: () => void;
  icon?: SFSymbol;
}

export function Chip({ label, selected = false, onPress, icon }: ChipProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const bg = selected ? theme.primary : theme.backgroundElement;
  const fg = selected ? theme.onPrimary : theme.text;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => (scale.value = withSpring(Motion.scalePressed, Motion.spring.stiff))}
      onPressOut={() => (scale.value = withSpring(1, Motion.spring.bouncy))}
      accessibilityRole="button"
      accessibilityState={{ selected }}>
      <Animated.View style={[styles.chip, { backgroundColor: bg }, animStyle]}>
        {icon ? <Icon name={icon} size={14} color={fg} /> : null}
        <ThemedText type="smallBold" style={{ color: fg }}>
          {label}
        </ThemedText>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
});
