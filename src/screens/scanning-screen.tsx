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
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
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
import { useCollection } from '@/lib/collection-context';
import { getScanJob, updateScanJob, type ScanResult } from '@/lib/scan-job';
import { cropToSticker, persistImage, recognizePhoto, toScanResult } from '@/lib/recognize';
import { liftToPNG } from '@/lib/subject-lift';

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
  const { prefs } = useCollection();
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
  const { height } = useWindowDimensions();
  // Реальный снятый кадр — показываем «обработку» именно его (а не абстрактный скрим).
  const photoUri = getScanJob(jobId)?.photoUri;

  // Защита от двойного перехода (StrictMode/быстрый ремоунт).
  const navigated = useRef(false);

  // --- Зацикленные анимации (reanimated v4) ---
  const enter = useSharedValue(0); // плавное проявление
  const scan = useSharedValue(0); // сканирующий луч
  const pulse = useSharedValue(0); // «дыхание» визира-фокуса
  const spin = useSharedValue(0); // вращение кольца-спиннера
  const ken = useSharedValue(0); // медленный зум кадра (ken burns)

  // Старт анимаций + реальное распознавание (Gemini) и вырезка стикера, затем
  // переход на Результат. Минимальная задержка ~900мс, чтобы анимация всегда
  // успела сыграть. Нет фото/бэкенда/ошибка — мягко уходим на мок.
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
    ken.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );

    let active = true;
    const goToResult = () => {
      if (!active || navigated.current) return;
      navigated.current = true;
      // replace, чтобы кадр сканирования не оставался в стеке назад.
      router.replace({ pathname: '/result', params: { jobId } });
    };

    (async () => {
      const started = Date.now();
      const job = getScanJob(jobId);
      const photoUri = job?.photoUri;
      let result: ScanResult | undefined;
      let cutoutUri: string | null = null;

      if (photoUri) {
        // Параллельно: облачное распознавание + нативная вырезка фона (iOS 17+).
        const [reco, liftedUri] = await Promise.all([
          recognizePhoto(photoUri, prefs.learningLang, prefs.nativeLang).catch(() => null),
          liftToPNG(photoUri).catch(() => null),
        ]);
        const primary = reco && reco.objects.length > 0 ? reco.objects[0] : null;
        if (primary) result = toScanResult(primary, prefs.learningLang);

        if (liftedUri) {
          // Настоящий вырез фона (Фаза 2) — лучший вариант.
          cutoutUri = await persistImage(liftedUri).catch(() => null);
        } else if (reco && primary && primary.bbox) {
          // Запасной вариант — кроп по рамке (Фаза 1).
          cutoutUri = await cropToSticker(
            reco.prepared.uri,
            reco.prepared.width,
            reco.prepared.height,
            primary.bbox,
          );
        }
        // Гарантируем постоянную картинку, если ничего выше не сработало.
        if (!cutoutUri) cutoutUri = await persistImage(photoUri).catch(() => null);
      }

      if (jobId) updateScanJob(jobId, { result, cutoutUri });
      const wait = Math.max(0, 900 - (Date.now() - started));
      setTimeout(goToResult, wait);
    })();

    return () => {
      active = false;
      cancelAnimation(enter);
      cancelAnimation(scan);
      cancelAnimation(pulse);
      cancelAnimation(spin);
      cancelAnimation(ken);
    };
  }, [enter, scan, pulse, spin, ken, router, jobId, prefs.learningLang, prefs.nativeLang]);

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

  // Кадр медленно «дышит» зумом; луч сканирует по всей высоте экрана.
  const kenStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(ken.value, [0, 1], [1, 1.08]) }],
  }));
  const beamStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scan.value, [0, 1], [0, height]) }],
    opacity: interpolate(scan.value, [0, 0.1, 0.9, 1], [0, 0.9, 0.9, 0]),
  }));

  return (
    <View style={styles.flex}>
      {photoUri ? (
        <>
          {/* Реальный кадр с медленным зумом — «обрабатываем именно твоё фото». */}
          <Animated.View style={[StyleSheet.absoluteFill, kenStyle]}>
            <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }, overlayStyle]}
          />
          {/* Сканирующий луч по всей высоте кадра. */}
          <Animated.View
            pointerEvents="none"
            style={[styles.beam, { backgroundColor: theme.accent, shadowColor: theme.accent }, beamStyle]}
          />
        </>
      ) : (
        <>
          {/* Фолбэк (симулятор/нет кадра): морозный скрим. */}
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }, bgStyle]}
          />
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }, overlayStyle]}
          />
        </>
      )}

      {/* Контент: ловим тапы, чтобы во время скана нельзя было нажать на камеру. */}
      <SafeAreaView style={styles.center}>
        <Animated.View entering={FadeIn.duration(Motion.duration.base)} style={styles.frameWrap}>
          {/* Рамка-визир с угловыми скобками + фокус. */}
          <View style={[styles.frame, { borderColor: photoUri ? 'rgba(255,255,255,0.25)' : theme.border }]}>
            <View style={[styles.corner, styles.cornerTL, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: theme.accent }]} />

            {/* Локальная полоска — только в фолбэке (при фото луч идёт по всему экрану). */}
            {!photoUri ? (
              <Animated.View
                style={[styles.scanLine, { backgroundColor: theme.accent, shadowColor: theme.accent }, scanStyle]}
              />
            ) : null}

            {/* Пульсирующий визир-фокус: кольцо-спиннер + центр */}
            <View style={styles.reticleWrap} pointerEvents="none">
              <Animated.View style={reticleStyle}>
                <Animated.View
                  style={[
                    styles.spinner,
                    {
                      borderColor: photoUri ? 'rgba(255,255,255,0.3)' : theme.primarySoft,
                      borderTopColor: theme.accent,
                    },
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
            <ThemedText type="smallBold" style={[styles.captionText, photoUri ? styles.captionOnPhoto : null]}>
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
  // Полноэкранный сканирующий луч (когда показываем реальный кадр).
  beam: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
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
  captionOnPhoto: { color: '#FFFFFF' },
  dots: { flexDirection: 'row', gap: Spacing.one + 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});

export default ScanningScreen;
