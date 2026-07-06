/**
 * LoadingOrb — аккуратный спиннер на reanimated: кольцо-трек + подсвеченная дуга,
 * которая плавно крутится (UI-поток, 60fps). Не голый ActivityIndicator. При
 * «Reduce Motion» отдаём системный ActivityIndicator (без бесконечной анимации).
 * Работает и на web.
 */
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';

export function LoadingOrb({ size = 56 }: { size?: number }) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const rot = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    rot.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(rot);
  }, [reduce, rot]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  if (reduce) return <ActivityIndicator size="large" color={theme.primary} />;

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 4,
          borderColor: theme.backgroundSelected,
          borderTopColor: theme.primary,
        },
        style,
      ]}
    />
  );
}
