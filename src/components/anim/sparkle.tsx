/**
 * Sparkle — короткий «искрящийся» салют из нескольких точек вокруг центра
 * (для бейджа «выучено», момента освоения слова).
 * Shine — одиночный световой блик, проезжающий по контейнеру (по стикеру/карте).
 *
 * Оба на чистом Reanimated, transform+opacity, off при «Reduce Motion».
 */
import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Motion } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

const RAYS = 6;

function Ray({ angle, progress, color }: { angle: number; progress: SharedValue<number>; color: string }) {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const dist = interpolate(t, [0, 1], [4, 22]);
    const scale = interpolate(t, [0, 0.4, 1], [0, 1, 0]);
    return {
      opacity: interpolate(t, [0, 0.4, 1], [0, 1, 0]),
      transform: [{ translateX: dx * dist }, { translateY: dy * dist }, { scale }],
    };
  });
  return (
    <Animated.View
      style={[{ position: 'absolute', width: 5, height: 5, borderRadius: 2.5, backgroundColor: color }, style]}
    />
  );
}

/** Разовый салют из точек. Меняй `trigger`, чтобы повторить. */
export function Sparkle({
  trigger = 0,
  color,
  style,
}: {
  trigger?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) });
  }, [trigger, reduce, progress]);

  if (reduce) return null;

  return (
    <View pointerEvents="none" style={[styles.center, style]}>
      {Array.from({ length: RAYS }, (_, i) => (
        <Ray key={i} angle={(360 / RAYS) * i} progress={progress} color={color ?? theme.gold} />
      ))}
    </View>
  );
}

/** Диагональный световой блик, проезжающий один раз (или зациклено). */
export function Shine({
  trigger = 0,
  loop = false,
  width = 140,
  style,
}: {
  trigger?: number;
  loop?: boolean;
  width?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  const x = useSharedValue(-1);

  useEffect(() => {
    if (reduce) return;
    x.value = -1;
    const anim = withTiming(1, { duration: Motion.duration.lazy, easing: Easing.inOut(Easing.ease) });
    x.value = loop
      ? withRepeat(withSequence(withDelay(1200, anim), withTiming(-1, { duration: 0 })), -1, false)
      : withDelay(120, anim);
  }, [trigger, loop, reduce, x]);

  const style2 = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-1, -0.5, 0.5, 1], [0, 0.5, 0.5, 0]),
    transform: [{ translateX: interpolate(x.value, [-1, 1], [-width, width]) }, { rotate: '18deg' }],
  }));

  if (reduce) return null;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, style]}>
      <Animated.View style={[styles.streak, { width: width * 0.5 }, style2]} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: '50%', left: '50%', alignItems: 'center', justifyContent: 'center' },
  clip: { overflow: 'hidden' },
  streak: { position: 'absolute', top: -20, bottom: -20, backgroundColor: 'rgba(255,255,255,0.55)' },
});
