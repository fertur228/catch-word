/**
 * SwipeToRate — карточка, которую можно свайпнуть влево / вправо / вверх, чтобы
 * поставить оценку (Забыл / Легко / Норм). Пока тянешь — карточка наклоняется, а
 * в сторону оценки нарастает цветная подсказка; на пороге срабатывает хаптика.
 *
 * Жест — через react-native-gesture-handler (значения крутятся на UI-потоке,
 * без JS-моста покадрово). При «Reduce Motion» жест работает без наклона-«резинки».
 */
import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { feedbackSelection } from '@/lib/feedback';

export interface SwipeHint {
  label: string;
  color: string;
}

export function SwipeToRate({
  children,
  onLeft,
  onRight,
  onUp,
  left,
  right,
  up,
  enabled = true,
  threshold = 110,
  style,
}: {
  children: ReactNode;
  onLeft?: () => void;
  onRight?: () => void;
  onUp?: () => void;
  left?: SwipeHint;
  right?: SwipeHint;
  up?: SwipeHint;
  enabled?: boolean;
  threshold?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const armed = useSharedValue(0); // 0 — ещё не переступили порог; 1 — да (чтобы дзынькнуть раз)

  const fire = (dir: 'left' | 'right' | 'up') => {
    if (dir === 'left') onLeft?.();
    else if (dir === 'right') onRight?.();
    else onUp?.();
  };

  const pan = Gesture.Pan()
    .enabled(enabled)
    .onUpdate((e) => {
      tx.value = e.translationX;
      ty.value = e.translationY;
      const past =
        Math.abs(e.translationX) > threshold || (onUp && -e.translationY > threshold) ? 1 : 0;
      if (past && !armed.value) {
        armed.value = 1;
        runOnJS(feedbackSelection)();
      } else if (!past && armed.value) {
        armed.value = 0;
      }
    })
    .onEnd((e) => {
      const upSwipe = !!onUp && -e.translationY > threshold && -e.translationY > Math.abs(e.translationX);
      // После «вылета» мгновенно возвращаем узел в центр — следующая карточка
      // (та же View, но новый контент) должна появиться по центру, а не за экраном.
      const done = (dir: 'left' | 'right' | 'up', finished?: boolean) => {
        'worklet';
        if (!finished) return;
        runOnJS(fire)(dir);
        tx.value = 0;
        ty.value = 0;
        armed.value = 0;
      };
      if (upSwipe) {
        ty.value = withTiming(-height * 1.2, { duration: 240 }, (f) => done('up', f));
      } else if (e.translationX > threshold) {
        tx.value = withTiming(width * 1.3, { duration: 240 }, (f) => done('right', f));
      } else if (e.translationX < -threshold) {
        tx.value = withTiming(-width * 1.3, { duration: 240 }, (f) => done('left', f));
      } else {
        tx.value = withSpring(0, Motion.spring.soft);
        ty.value = withSpring(0, Motion.spring.soft);
        armed.value = 0;
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${interpolate(tx.value, [-width / 2, 0, width / 2], [-10, 0, 10])}deg` },
    ],
  }));

  const leftHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [-threshold, -20], [1, 0], 'clamp'),
  }));
  const rightHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [20, threshold], [0, 1], 'clamp'),
  }));
  const upHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ty.value, [-threshold, -20], [1, 0], 'clamp'),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[style, cardStyle]}>
        {children}
        {left ? (
          <Animated.View style={[styles.hint, styles.hintLeft, { borderColor: left.color }, leftHintStyle]}>
            <ThemedText type="smallBold" style={{ color: left.color }}>
              {left.label}
            </ThemedText>
          </Animated.View>
        ) : null}
        {right ? (
          <Animated.View style={[styles.hint, styles.hintRight, { borderColor: right.color }, rightHintStyle]}>
            <ThemedText type="smallBold" style={{ color: right.color }}>
              {right.label}
            </ThemedText>
          </Animated.View>
        ) : null}
        {up ? (
          <Animated.View style={[styles.hint, styles.hintUp, { borderColor: up.color }, upHintStyle]}>
            <ThemedText type="smallBold" style={{ color: up.color }}>
              {up.label}
            </ThemedText>
          </Animated.View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hint: {
    position: 'absolute',
    top: Spacing.three,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.sm,
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  hintLeft: { left: Spacing.three, transform: [{ rotate: '-12deg' }] },
  hintRight: { right: Spacing.three, transform: [{ rotate: '12deg' }] },
  hintUp: { alignSelf: 'center', top: Spacing.two },
});
