/**
 * FlyToTab — при сохранении слова мини-стикер «улетает» вниз к вкладке
 * «Коллекция» (2-я из 4) и схлопывается: слово будто отправилось в коллекцию.
 * Оверлей поверх экрана, не перехватывает касания. При «Reduce Motion» — тихо
 * сразу зовём onDone (без полёта).
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Sticker } from '@/components/sticker';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

const SIZE = 72;
const DURATION = 620;

export function FlyToTab({
  trigger,
  category,
  imageUri,
  startTop = 0.32,
  onDone,
}: {
  /** Меняй, чтобы запустить полёт (например, timestamp сохранения). */
  trigger: number;
  category?: string | null;
  imageUri?: string | null;
  /** Стартовая вертикаль (доля высоты экрана), примерно где стикер в Result. */
  startTop?: number;
  onDone?: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const reduce = useReduceMotion();
  const [active, setActive] = useState(false);
  const p = useSharedValue(0);

  // Старт — центр по X, заданная доля по Y. Цель — центр 2-й вкладки, низ экрана.
  const startX = width / 2 - SIZE / 2;
  const startY = height * startTop;
  const targetX = width * 0.375 - SIZE / 2;
  const targetY = height - 44 - SIZE / 2;
  const dx = targetX - startX;
  const dy = targetY - startY;

  useEffect(() => {
    if (!trigger) return;
    if (reduce) {
      onDone?.();
      return;
    }
    setActive(true);
    p.value = 0;
    p.value = withTiming(1, { duration: DURATION, easing: Easing.in(Easing.cubic) }, (f) => {
      if (f) {
        runOnJS(setActive)(false);
        if (onDone) runOnJS(onDone)();
      }
    });
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.75, 1], [1, 1, 0]),
    transform: [
      { translateX: interpolate(p.value, [0, 1], [0, dx]) },
      // Небольшая дуга вверх в начале — «подхват», затем вниз к вкладке.
      { translateY: interpolate(p.value, [0, 1], [0, dy]) - 40 * Math.sin(Math.PI * p.value) },
      { scale: interpolate(p.value, [0, 1], [1, 0.25]) },
    ],
  }));

  if (!active) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[{ position: 'absolute', left: startX, top: startY }, style]}>
        <Sticker category={category} imageUri={imageUri} size={SIZE} />
      </Animated.View>
    </View>
  );
}
