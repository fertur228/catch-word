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
import { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, useWindowDimensions, View } from 'react-native';
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
  ZoomIn,
} from 'react-native-reanimated';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { useCollection } from '@/lib/collection-context';
import { useT } from '@/lib/i18n';
import { getScanJob, SCAN_FRAME, updateScanJob, type ScanResult, type SceneItem } from '@/lib/scan-job';
import {
  cropToFrame,
  cropToSticker,
  isRecognitionConfigured,
  persistImage,
  recognizePhoto,
  ScanLimitError,
  toScanResult,
} from '@/lib/recognize';
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
  const t = useT();
  const router = useRouter();
  const { prefs, refundScan, markScansExhausted } = useCollection();
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
  const { height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  // Ошибка распознавания (нет сети / не понял) — показываем вместо результата.
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  // Локальная вырезка (VisionKit) готова раньше слова — показываем её сразу как
  // превью в визире («поймал!»), не дожидаясь облачного распознавания.
  const [cutoutPreview, setCutoutPreview] = useState<string | null>(null);
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
  const prog = useSharedValue(0); // полоса прогресса распознавания (чувство продвижения)

  // Старт анимаций + реальное распознавание и вырезка стикера, затем переход на
  // Результат. Reduce Motion → без зацикленных анимаций. Реальная ошибка
  // распознавания (нет сети / не понял) → показываем ошибку и возвращаем скан.
  useEffect(() => {
    if (reduceMotion) {
      enter.value = 1;
      prog.value = 1;
    } else {
      enter.value = withTiming(1, { duration: Motion.duration.base, easing: Easing.out(Easing.ease) });
      scan.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, true);
      pulse.value = withRepeat(withTiming(1, { duration: Motion.duration.lazy, easing: Easing.inOut(Easing.ease) }), -1, true);
      spin.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1, false);
      ken.value = withRepeat(withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }), -1, true);
      // Полоса прогресса плавно доходит до конца за время «распознавания».
      prog.value = withTiming(1, { duration: 1000, easing: Easing.out(Easing.ease) });
    }

    let active = true;
    const goToResult = () => {
      if (!active || navigated.current) return;
      navigated.current = true;
      router.replace({ pathname: '/result', params: { jobId } });
    };
    const fail = (title: string, message: string) => {
      if (!active) return;
      refundScan();
      setError({ title, message });
    };
    // Сервер вернул 402 — бесплатные сканы кончились → на пейволл. Оптимистичный
    // клиентский скан НЕ возвращаем (лимит реально исчерпан), фиксируем 0.
    // Лимит сканов. free → пейволл; premium (fair-use 100/день) → мягкое сообщение
    // «вернись завтра» — пейволл ему бессмысленен, он уже premium.
    const onLimitReached = (premium: boolean) => {
      if (!active || navigated.current) return;
      if (premium) {
        setError({
          title: t('Лимит на сегодня'),
          message: t('Сегодня уже очень много сканов — это честный дневной лимит. Возвращайся завтра, он обновится.'),
        });
        return;
      }
      navigated.current = true;
      markScansExhausted();
      router.replace('/paywall');
    };

    (async () => {
      const started = Date.now();
      const job = getScanJob(jobId);
      const mode = job?.mode ?? 'single';
      let result: ScanResult | undefined;
      let cutoutUri: string | null = null;
      let items: SceneItem[] | undefined;

      // single — по КВАДРАТУ под визиром (кроп по рамке, см. ниже): предмет крупный
      // → точнее распознавание и чище нативная вырезка. scene — по всему кадру.
      const photoUri = job?.photoUri;

      if (photoUri) {
        const configured = isRecognitionConfigured();

        if (mode === 'scene') {
          // «Поймай всю сцену»: до 8 предметов, у каждого — свой вырез по bbox.
          let reco: Awaited<ReturnType<typeof recognizePhoto>> = null;
          try {
            reco = await recognizePhoto(photoUri, prefs.learningLang, prefs.nativeLang, 8);
          } catch (e) {
            if (e instanceof ScanLimitError) { onLimitReached(e.premium); return; }
            reco = null;
          }
          if (!active) return;
          if (configured && !reco) {
            fail(t('Не получилось распознать'), t('Проверь интернет и попробуй ещё раз. Скан не списан.'));
            return;
          }
          if (configured && reco && reco.objects.length === 0) {
            fail(t('Не понял, что тут'), t('Наведи на сцену с предметами и попробуй снова. Скан не списан.'));
            return;
          }
          if (reco && reco.objects.length > 0) {
            items = [];
            for (const obj of reco.objects) {
              const cut = obj.bbox
                ? await cropToSticker(reco.prepared.uri, reco.prepared.width, reco.prepared.height, obj.bbox)
                : null;
              items.push({ result: toScanResult(obj, prefs.learningLang), cutoutUri: cut });
            }
            result = items[0]?.result; // «основной» — на случай экрана без сцены
            cutoutUri = items[0]?.cutoutUri ?? null;
          } else {
            cutoutUri = await persistImage(photoUri).catch(() => null);
          }
        } else {
          // single: сначала вырезаем КВАДРАТ ПОД ВИЗИРОМ (рамкой наведения) из кадра.
          // Его отдаём и в распознавание (предмет крупный → выше точность), и в
          // нативную вырезку (Vision получает центрированный субъект → чище результат).
          const { width: screenW, height: screenH } = Dimensions.get('window');
          const framed = await cropToFrame(photoUri, screenW, screenH, SCAN_FRAME);
          const scanUri = framed?.uri ?? photoUri;

          // Вырезку запускаем параллельно, но распознавание ждём отдельно, чтобы
          // поймать ScanLimitError (402) и уйти на пейволл, не «сжигая» вырезку.
          const liftP = liftToPNG(scanUri).catch(() => null);
          // Мгновенное превью: как только VisionKit вернул вырез — показываем его,
          // не дожидаясь облачного распознавания, и визуально ЗАВЕРШАЕМ прогресс,
          // чтобы ожидание слова читалось как «готово», а не «ждём медленный ИИ».
          void liftP.then((uri) => {
            if (!active || !uri) return;
            setCutoutPreview(uri);
            prog.value = reduceMotion ? 1 : withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) });
          });
          let reco: Awaited<ReturnType<typeof recognizePhoto>> = null;
          try {
            reco = await recognizePhoto(scanUri, prefs.learningLang, prefs.nativeLang, 1);
          } catch (e) {
            if (e instanceof ScanLimitError) { onLimitReached(e.premium); return; }
            reco = null;
          }
          const liftedUri = await liftP;
          if (!active) return;

          if (configured && !reco) {
            fail(t('Не получилось распознать'), t('Проверь интернет и попробуй ещё раз. Скан не списан.'));
            return;
          }
          if (configured && reco && reco.objects.length === 0) {
            fail(t('Не понял, что это'), t('Наведи ближе на один предмет и попробуй снова. Скан не списан.'));
            return;
          }

          // На квадрате под рамкой берём предмет ближе к центру — это и есть тот, что в визире.
          const centerDist = (b: number[] | null) =>
            b && b.length === 4 ? (b[0] + b[2] / 2 - 0.5) ** 2 + (b[1] + b[3] / 2 - 0.5) ** 2 : 2;
          const primary =
            reco && reco.objects.length > 0
              ? reco.objects.reduce((best, o) => (centerDist(o.bbox) < centerDist(best.bbox) ? o : best), reco.objects[0])
              : null;
          if (primary) result = toScanResult(primary, prefs.learningLang);

          if (liftedUri) {
            cutoutUri = await persistImage(liftedUri).catch(() => null);
          } else if (reco && primary && primary.bbox) {
            cutoutUri = await cropToSticker(
              reco.prepared.uri,
              reco.prepared.width,
              reco.prepared.height,
              primary.bbox,
            );
          }
          if (!cutoutUri) cutoutUri = await persistImage(scanUri).catch(() => null);
        }
      }

      if (jobId) updateScanJob(jobId, { result, cutoutUri, items });
      const wait = Math.max(0, (reduceMotion ? 300 : 900) - (Date.now() - started));
      setTimeout(goToResult, wait);
    })();

    return () => {
      active = false;
      cancelAnimation(enter);
      cancelAnimation(scan);
      cancelAnimation(pulse);
      cancelAnimation(spin);
      cancelAnimation(ken);
      cancelAnimation(prog);
    };
  }, [enter, scan, pulse, spin, ken, prog, router, jobId, prefs.learningLang, prefs.nativeLang, reduceMotion, refundScan, markScansExhausted]);

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
  const progStyle = useAnimatedStyle(() => ({ width: `${interpolate(prog.value, [0, 1], [0, 100])}%` }));

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
      {error ? (
        <SafeAreaView style={styles.center}>
          <View
            style={[styles.errorCard, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
            <View style={[styles.errorIcon, { backgroundColor: theme.warningSoft }]}>
              <Icon name="exclamationmark.triangle.fill" size={26} color={theme.warning} />
            </View>
            <ThemedText type="subtitle" style={styles.errorTitle}>
              {error.title}
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary" style={styles.errorMsg}>
              {error.message}
            </ThemedText>
            <Button title={t('Назад к камере')} icon="camera.fill" onPress={() => router.back()} style={styles.errorBtn} />
          </View>
        </SafeAreaView>
      ) : (
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

            {/* Готова локальная вырезка → показываем её сразу («поймал!»); иначе — визир. */}
            <View style={styles.reticleWrap} pointerEvents="none">
              {cutoutPreview ? (
                <Animated.View entering={reduceMotion ? undefined : ZoomIn.springify().damping(13).stiffness(150)}>
                  <Image source={{ uri: cutoutPreview }} style={styles.cutoutPreview} contentFit="contain" />
                </Animated.View>
              ) : (
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
              )}
            </View>
          </View>

          {/* Подпись + «думающие» точки */}
          <Animated.View
            entering={FadeInDown.duration(Motion.duration.base).delay(80)}
            style={styles.caption}>
            <ThemedText type="smallBold" style={[styles.captionText, photoUri ? styles.captionOnPhoto : null]}>
              {cutoutPreview ? t('Поймал!') : t('Распознаю предмет…')}
            </ThemedText>
            {cutoutPreview ? null : (
              <View style={styles.dots}>
                <Dot delay={0} color={theme.accent} reduce={reduceMotion} />
                <Dot delay={160} color={theme.accent} reduce={reduceMotion} />
                <Dot delay={320} color={theme.accent} reduce={reduceMotion} />
              </View>
            )}
            {/* Полоса прогресса распознавания. */}
            <View style={[styles.progTrack, { backgroundColor: photoUri ? 'rgba(255,255,255,0.22)' : theme.primarySoft }]}>
              <Animated.View style={[styles.progFill, { backgroundColor: theme.accent }, progStyle]} />
            </View>
          </Animated.View>
        </Animated.View>
      </SafeAreaView>
      )}
    </View>
  );
}

/** Одна «думающая» точка: мягко пульсирует масштабом и прозрачностью. */
function Dot({ delay, color, reduce }: { delay: number; color: string; reduce?: boolean }) {
  const v = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (reduce) return;
    v.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 520, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(v);
  }, [v, delay, reduce]);

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
  cutoutPreview: { width: 200, height: 200 },
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

  // --- Ошибка распознавания ---
  errorCard: {
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    borderRadius: Radius.xl,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
  },
  errorIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  errorTitle: { textAlign: 'center' },
  errorMsg: { textAlign: 'center' },
  errorBtn: { alignSelf: 'stretch', marginTop: Spacing.two },
  dots: { flexDirection: 'row', gap: Spacing.one + 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  progTrack: { width: 160, height: 4, borderRadius: 2, overflow: 'hidden', marginTop: Spacing.one },
  progFill: { height: '100%', borderRadius: 2 },
});

export default ScanningScreen;
