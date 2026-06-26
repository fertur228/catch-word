/**
 * ProgressBar — тонкая полоса прогресса с плавной анимацией заполнения
 * (react-native-reanimated). Используется для освоения коллекции, прогресса
 * сессии повтора и т.п.
 */
import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Motion, Radius, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ProgressBarProps {
  /** Прогресс 0..1. */
  progress: number;
  /** Высота полосы, px. */
  height?: number;
  /** Цвет заполнения (ключ темы). По умолчанию — primary. */
  tone?: ThemeColor;
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({ progress, height = 10, tone = 'primary', style }: ProgressBarProps) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));
  const p = useSharedValue(clamped);

  useEffect(() => {
    p.value = withTiming(clamped, { duration: Motion.duration.slow });
  }, [clamped, p]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));

  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: theme.backgroundElement }, style]}>
      <Animated.View
        style={[styles.fill, { borderRadius: height / 2, backgroundColor: theme[tone] }, fillStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill },
});
