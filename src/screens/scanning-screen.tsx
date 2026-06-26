/**
 * Экран «Распознаю…» (фича 4) — мостик Камера → Результат.
 *
 * Поток: Камера (затвор) → router.push('/scanning', { word }) → этот экран
 * проигрывает короткую «распознающую» анимацию (~1.1–1.4 c) → router.replace
 * на '/result' с тем же словом. Никакого реального распознавания нет (мок),
 * это сатисфайная пауза-предвкушение перед reveal «Поймал!».
 *
 * Роут объявлен как `transparentModal` с анимацией `fade` (см. app/_layout.tsx),
 * поэтому кадр камеры остаётся виден снизу во время кросс-фейда. Здесь поверх
 * него рисуем затемняющий «морозный» скрим (theme.overlay поверх theme.background)
 * и центрированную анимацию: сканирующая рамка-визир + бегущая полоска +
 * пульсирующий визир-фокус со спиннером + текст «Распознаю предмет…» с точками.
 *
 * Цвета — из темы (работает и в светлой, и в тёмной). Свайп-закрытие отключено
 * на уровне роута, чтобы скан нельзя было прервать жестом. Таймер чистим при
 * размонтировании; повторный переход защищён флагом-рефом.
 */
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Размеры сканирующего «визира». */
const FRAME = 240;
const CORNER = 30;
const THICK = 3;
const RAD = 16;
/** Кольцо-спиннер + точка-фокус в центре рамки. */
const RETICLE = 84;

export function ScanningScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { word } = useLocalSearchParams<{ word?: string }>();

  // Защита от двойного перехода (StrictMode/быстрый ремоунт).
  const navigated = useRef(false);

  // --- Зацикленные анимации (reanimated v4) ---
  const enter = useSharedValue(0); // плавное проявление скрима
  const scan = useSharedValue(0); // бегущая полоска сверху вниз
  const pulse = useSharedValue(0); // «дыхание» визира-фокуса
  const spin = useSharedValue(0); // вращение кольца-спиннера

  // Старт анимаций + автопереход на Результат через ~1.1–1.4 c.
  useEffect(() => {
    enter.value = withTiming(1, { duration: Motion.duration.base, easing: Easing.out(Easing.ease) });
    scan.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    pulse.value = withRepeat(
      withTiming(1, { duration: Motion.duration.lazy, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    spin.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1, false);

    // Небольшой разброс длительности — ощущение «думает».
    const delay = 1100 + Math.floor(Math.random() * 300);
    const timer = setTimeout(() => {
      if (navigated.current) return;
      navigated.current = true;
      // replace, чтобы кадр сканирования не оставался в стеке назад.
      router.replace({ pathname: '/result', params: { word } });
    }, delay);

    return () => {
      clearTimeout(timer);
      cancelAnimation(enter);
      cancelAnimation(scan);
      cancelAnimation(pulse);
      cancelAnimation(spin);
    };
  }, [enter, scan, pulse, spin, router, word]);

  // Скрим: theme.background (морозная подложка) + theme.overlay (затемнение).
  const bgStyle = useAnimatedStyle(() => ({ opacity: enter.value * 0.82 }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: enter.value }));

  const scanStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scan.value, [0, 1], [THICK, FRAME - THICK]) }],
    opacity: interpolate(scan.value, [0, 0.12, 0.88, 1], [0, 1, 1, 0]),
  }));

  const reticleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.86, 1.06]) }],
    opacity: interpolate(pulse.value, [0, 1], [0.7, 1]),
  }));

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(spin.value, [0, 1], [0, 360])}deg` }],
  }));

  return (
    <View style={styles.flex}>
      {/* Затемняющий скрим: камера снизу остаётся чуть видна (морозное стекло). */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }, bgStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }, overlayStyle]}
      />

      {/* Контент: ловим тапы, чтобы во время скана нельзя было нажать на камеру. */}
      <SafeAreaView style={styles.center}>
        <Animated.View entering={FadeIn.duration(Motion.duration.base)} style={styles.frameWrap}>
          {/* Сканирующая рамка-визир */}
          <View style={[styles.frame, { borderColor: theme.border }]}>
            {/* Яркие угловые скобки */}
            <View style={[styles.corner, styles.cornerTL, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: theme.accent }]} />

            {/* Бегущая полоска «сканирования» */}
            <Animated.View
              style={[
                styles.scanLine,
                { backgroundColor: theme.accent, shadowColor: theme.accent },
                scanStyle,
              ]}
            />

            {/* Пульсирующий визир-фокус: кольцо-спиннер + центр */}
            <View style={styles.reticleWrap} pointerEvents="none">
              <Animated.View style={reticleStyle}>
                <Animated.View
                  style={[
                    styles.spinner,
                    { borderColor: theme.primarySoft, borderTopColor: theme.accent },
                    spinStyle,
                  ]}
                />
                <View style={styles.reticleCenter}>
                  <Icon name="viewfinder" size={26} color={theme.accent} />
                </View>
              </Animated.View>
            </View>
          </View>

          {/* Подпись + «думающие» точки */}
          <Animated.View
            entering={FadeInDown.duration(Motion.duration.base).delay(80)}
            style={styles.caption}>
            <ThemedText type="smallBold" style={styles.captionText}>
              Распознаю предмет…
            </ThemedText>
            <View style={styles.dots}>
              <Dot delay={0} color={theme.accent} />
              <Dot delay={160} color={theme.accent} />
              <Dot delay={320} color={theme.accent} />
            </View>
          </Animated.View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

/** Одна «думающая» точка: мягко пульсирует масштабом и прозрачностью. */
function Dot({ delay, color }: { delay: number; color: string }) {
  const v = useSharedValue(0);

  useEffect(() => {
    v.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 520, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(v);
  }, [v, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(v.value, [0, 1], [0.3, 1]),
    transform: [{ scale: interpolate(v.value, [0, 1], [0.7, 1]) }],
  }));

  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frameWrap: { alignItems: 'center', gap: Spacing.four },

  // --- Сканирующий визир ---
  frame: {
    width: FRAME,
    height: FRAME,
    borderRadius: RAD + 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  cornerTL: { top: -1, left: -1, borderTopWidth: THICK, borderLeftWidth: THICK, borderTopLeftRadius: RAD },
  cornerTR: { top: -1, right: -1, borderTopWidth: THICK, borderRightWidth: THICK, borderTopRightRadius: RAD },
  cornerBL: { bottom: -1, left: -1, borderBottomWidth: THICK, borderLeftWidth: THICK, borderBottomLeftRadius: RAD },
  cornerBR: { bottom: -1, right: -1, borderBottomWidth: THICK, borderRightWidth: THICK, borderBottomRightRadius: RAD },
  scanLine: {
    position: 'absolute',
    top: 0,
    left: Spacing.three,
    right: Spacing.three,
    height: 3,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },

  // --- Пульсирующий визир-фокус по центру рамки ---
  reticleWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  spinner: {
    position: 'absolute',
    width: RETICLE,
    height: RETICLE,
    borderRadius: RETICLE / 2,
    borderWidth: 3,
  },
  reticleCenter: {
    width: RETICLE,
    height: RETICLE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- Подпись + точки ---
  caption: { alignItems: 'center', gap: Spacing.two },
  captionText: { fontSize: 16, letterSpacing: 0.2 },
  dots: { flexDirection: 'row', gap: Spacing.one + 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});

export default ScanningScreen;
