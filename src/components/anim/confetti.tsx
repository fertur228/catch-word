/**
 * Конфетти на чистом Reanimated — без нативных зависимостей (работает в Expo Go).
 *
 * Один общий shared value `progress` (0→1) крутит все частицы: каждая летит по
 * баллистической дуге (vx·t + гравитация·t²) со своим вращением и цветом. Всё на
 * UI-потоке, только transform+opacity. При «Reduce Motion» не рендерим ничего.
 *
 *   <Confetti trigger={burstKey} />   // перезапуск при смене trigger
 */
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

interface Particle {
  vx: number;
  vy: number;
  g: number;
  spin: number;
  size: number;
  color: string;
  rounded: boolean;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function makeParticles(count: number, palette: string[]): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    vx: rand(-150, 150),
    vy: rand(-300, -150),
    g: rand(420, 620),
    spin: rand(-720, 720),
    size: rand(7, 12),
    color: palette[i % palette.length],
    rounded: Math.random() > 0.5,
  }));
}

function ConfettiPiece({ p, progress }: { p: Particle; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const translateX = p.vx * t;
    const translateY = p.vy * t + p.g * t * t;
    const rotate = p.spin * t;
    const opacity = interpolate(t, [0, 0.65, 1], [1, 1, 0]);
    const scale = interpolate(t, [0, 0.15, 1], [0.3, 1, 0.85]);
    return {
      opacity,
      transform: [{ translateX }, { translateY }, { rotate: `${rotate}deg` }, { scale }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: p.size,
          height: p.size * (p.rounded ? 1 : 0.5),
          borderRadius: p.rounded ? p.size / 2 : 2,
          backgroundColor: p.color,
        },
        style,
      ]}
    />
  );
}

export function Confetti({
  trigger = 0,
  count = 20,
  duration = 1100,
  originTop = '42%',
  colors,
  style,
}: {
  /** Меняй это значение, чтобы перезапустить взрыв. */
  trigger?: number;
  count?: number;
  duration?: number;
  /** Вертикальный якорь взрыва внутри родителя. */
  originTop?: number | `${number}%`;
  colors?: string[];
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const progress = useSharedValue(0);

  const palette = colors ?? [theme.success, theme.gold, theme.primary, theme.accent2, theme.danger];
  const particles = useMemo(() => makeParticles(count, palette), [count, trigger]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Запускаем только по «взводу» (trigger>0) — иначе салют выстрелил бы на
    // каждом монтировании, даже когда он не нужен.
    if (reduce || !trigger) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration, easing: Easing.linear });
  }, [trigger, reduce, duration, progress]);

  if (reduce || !trigger) return null;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <View style={{ position: 'absolute', left: '50%', top: originTop }}>
        {particles.map((p, i) => (
          <ConfettiPiece key={i} p={p} progress={progress} />
        ))}
      </View>
    </View>
  );
}
