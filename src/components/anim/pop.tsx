/**
 * Pop — появление с пружинным «выскакиванием» (scale overshoot + лёгкий доворот).
 * Обобщает StickerPop/StickerHero из экранов. На UI-потоке, transform+opacity.
 * При «Reduce Motion» — мгновенное появление без движения.
 *
 *   <Pop delay={70}><Sticker .../></Pop>
 */
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Motion } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

type SpringPreset = keyof typeof Motion.spring;

export function Pop({
  children,
  delay = 0,
  from = 0.6,
  rotate = 0,
  spring = 'bouncy',
  style,
}: {
  children: ReactNode;
  delay?: number;
  /** Начальный масштаб (0.6 → пружинит до 1). */
  from?: number;
  /** Начальный доворот в градусах, отыгрывается к 0. */
  rotate?: number;
  spring?: SpringPreset;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  const scale = useSharedValue(reduce ? 1 : from);
  const opacity = useSharedValue(reduce ? 1 : 0);
  const rot = useSharedValue(reduce ? 0 : rotate);

  useEffect(() => {
    if (reduce) return;
    const cfg = Motion.spring[spring];
    scale.value = withDelay(delay, withSpring(1, cfg));
    rot.value = withDelay(delay, withSpring(0, cfg));
    opacity.value = withDelay(delay, withTiming(1, { duration: Motion.duration.fast }));
  }, [delay, spring, reduce, scale, opacity, rot]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${rot.value}deg` }],
  }));

  return <Animated.View style={[style, animStyle]}>{children}</Animated.View>;
}
