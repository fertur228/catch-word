/**
 * Брендовый сплеш с анимацией — показывается поверх всего на холодном старте
 * (нативные платформы). Фон — фирменный синий логотипа (#1678B2), поэтому
 * квадратная подложка PNG «растворяется» и остаётся только вордмарк TakeWord.
 * Логотип «въезжает» пружиной, слоган мягко проявляется, затем оверлей плавно
 * исчезает и отдаёт управление (onDone) — за ним гейт уже решил, куда вести.
 */
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Motion, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

const LOGO = require('../../assets/images/logo.png');
/** Фирменный синий из логотипа — фон сплеша совпадает с подложкой PNG. */
const BRAND_BLUE = '#1678B2';

export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const reduce = useReduceMotion();

  const container = useSharedValue(1);
  const logoScale = useSharedValue(reduce ? 1 : 0.85);
  const logoOpacity = useSharedValue(reduce ? 1 : 0);
  const tagOpacity = useSharedValue(reduce ? 1 : 0);
  const tagShift = useSharedValue(reduce ? 0 : 10);

  useEffect(() => {
    if (!reduce) {
      logoScale.value = withSpring(1, Motion.spring.bouncy);
      logoOpacity.value = withTiming(1, { duration: Motion.duration.base });
      tagOpacity.value = withDelay(240, withTiming(1, { duration: Motion.duration.base }));
      tagShift.value = withDelay(240, withSpring(0, Motion.spring.soft));
    }
    // Держим брендовый кадр, затем плавно уходим и отдаём управление навигации.
    const hold = reduce ? 500 : 1500;
    container.value = withDelay(
      hold,
      withTiming(0, { duration: Motion.duration.base }, (finished) => {
        if (finished) runOnJS(onDone)();
      }),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const containerStyle = useAnimatedStyle(() => ({ opacity: container.value }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));
  const tagStyle = useAnimatedStyle(() => ({
    opacity: tagOpacity.value,
    transform: [{ translateY: tagShift.value }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, containerStyle]}>
      <Animated.Image source={LOGO} resizeMode="cover" style={[styles.logo, logoStyle]} />
      <Animated.Text style={[styles.tagline, tagStyle]}>Мир вокруг — твой словарь</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: BRAND_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    // Слоган держим вплотную к вордмарку — большой зазор смотрелся оторванно.
    gap: Spacing.half,
    zIndex: 100,
  },
  // cover обрезает квадрат по вертикали → вордмарк крупнее, без лишних полей.
  logo: { width: 300, height: 150 },
  tagline: { color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: '500' },
});
