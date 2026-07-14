/**
 * Главный экран — Камера (спека §5.2), «CapWords-grade» полировка.
 *
 * Что делает:
 *  - корректно запрашивает доступ к камере (`useCameraPermissions`):
 *    загрузка → экран-приглашение (кнопка «Продолжить») → живое превью;
 *  - показывает живое превью (`CameraView`) — активно только когда вкладка
 *    в фокусе (`useIsFocused` через `useFocusEffect`), чтобы беречь батарею;
 *  - премиальный оверлей поверх камеры:
 *      • верх  — остаток сканов (тап → Пейволл) и шестерёнка настроек;
 *      • центр — «сканирующая» рамка-визир с мягким пульсом и бегущей
 *                полоской + подсказка «Наведи на предмет»;
 *      • низ   — большая кнопка съёмки с пружинным нажатием и «дышащим» кольцом.
 *  - по нажатию (мок): списываем скан и уходим на экран «Распознаю…»
 *    (scanning) со случайным «распознанным» словом; он сам перейдёт на
 *    Результат. Лимит исчерпан → Пейволл.
 *
 * Цвета элементов поверх живого видео намеренно белые/полупрозрачные
 * (не из темы): они лежат на кадре камеры и должны читаться при любой картинке.
 * Экраны-приглашения (без камеры) полностью на токенах темы.
 *
 * На iOS-симуляторе камеры нет — превью будет чёрным, но кнопка съёмки и
 * весь поток работают (мок). На реальном iPhone превью живое.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '@/components/button';
import { CameraModeToggle } from '@/components/camera-mode-toggle';
import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { Sticker } from '@/components/sticker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Reveal } from '@/components/reveal';
import { QuestBanner } from '@/components/quest-banner';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useAuth } from '@/lib/auth-context';
import { useCollection } from '@/lib/collection-context';
import { alertAsync } from '@/lib/dialog';
import { feedbackImpact, feedbackTap } from '@/lib/feedback';
import { useT } from '@/lib/i18n';
import { createScanJob, SCAN_FRAME, type ScanMode, type Visor } from '@/lib/scan-job';

/** Цвета элементов поверх живого видео (не зависят от темы — лежат на кадре). */
const ON_CAMERA = '#FFFFFF';
const FRAME_LINE = 'rgba(255,255,255,0.28)';
const FRAME_GLASS = 'rgba(255,255,255,0.12)';

/** Размеры «визира» (сканирующей рамки). */
const FRAME = SCAN_FRAME;
const CORNER = 34;
const THICK = 4;
const RAD = 18;

/** true, пока экран в фокусе (вкладка открыта). */
function useIsFocused() {
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}

export function CameraScreen() {
  const theme = useTheme();
  const t = useT();
  const router = useRouter();
  const isFocused = useIsFocused();
  const reduceMotion = useReduceMotion();
  const { user, signInWithGoogle } = useAuth();
  const { isPremium, scansLeft, scanLimit, tryScan } = useCollection();
  const locked = scansLeft <= 0;
  const lowScans = !isPremium && scansLeft > 0 && scansLeft <= 2;
  const [permission, requestPermission] = useCameraPermissions();
  // Режим съёмки: один предмет (по рамке) или вся сцена (несколько предметов).
  const [mode, setMode] = useState<ScanMode>('single');

  // --- Анимации оверлея (reanimated v4) ---
  const pulse = useSharedValue(0); // мягкое «дыхание» рамки
  const scan = useSharedValue(0); // бегущая полоска сверху вниз
  const breath = useSharedValue(0); // расходящееся кольцо у кнопки
  const flash = useSharedValue(0); // вспышка «затвора» при съёмке
  const press = useSharedValue(1); // пружинное нажатие кнопки
  const capture = useSharedValue(0); // «удар»-зум кадра при съёмке
  const scansBump = useSharedValue(1); // подскок счётчика при трате скана
  const lowPulse = useSharedValue(0); // пульс счётчика, когда сканов мало
  const prevScans = useRef(scansLeft);

  // Не даём списать скан дважды от быстрых тапов.
  const navigating = useRef(false);
  // Ссылка на камеру — чтобы снять реальный кадр.
  const cameraRef = useRef<CameraView>(null);
  // Ref на рамку-визир — меряем её реальное положение на экране, чтобы кроп совпал.
  const frameRef = useRef<View>(null);

  // Зацикленные анимации крутим только пока вкладка в фокусе (экономия батареи).
  useEffect(() => {
    if (!isFocused) {
      cancelAnimation(pulse);
      cancelAnimation(scan);
      cancelAnimation(breath);
      return;
    }
    navigating.current = false;
    if (reduceMotion) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: Motion.duration.lazy, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    scan.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    breath.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(scan);
      cancelAnimation(breath);
    };
  }, [isFocused, reduceMotion, pulse, scan, breath]);

  // Подскок счётчика сканов при трате + пульс, когда сканов мало.
  useEffect(() => {
    if (scansLeft < prevScans.current && !reduceMotion) {
      scansBump.value = withSequence(
        withSpring(1.18, Motion.spring.stiff),
        withSpring(1, Motion.spring.bouncy),
      );
    }
    prevScans.current = scansLeft;
  }, [scansLeft, reduceMotion, scansBump]);

  useEffect(() => {
    if (lowScans && !reduceMotion) {
      lowPulse.value = withRepeat(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(lowPulse);
      lowPulse.value = withTiming(0, { duration: 200 });
    }
    return () => cancelAnimation(lowPulse);
  }, [lowScans, reduceMotion, lowPulse]);

  const frameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.035]) }],
    opacity: interpolate(pulse.value, [0, 1], [0.85, 1]),
  }));

  const scanStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scan.value, [0, 1], [8, FRAME - 12]) }],
    opacity: interpolate(scan.value, [0, 0.12, 0.88, 1], [0, 1, 1, 0]),
  }));

  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(breath.value, [0, 1], [1, 1.7]) }],
    opacity: interpolate(breath.value, [0, 1], [0.4, 0]),
  }));

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const captureStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(capture.value, [0, 1], [1, 1.045]) }],
  }));
  const scansPillStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scansBump.value * interpolate(lowPulse.value, [0, 1], [1, 1.06]) }],
  }));

  const onShutter = useCallback(async () => {
    if (navigating.current) return;
    // Скан только для вошедших: иначе серверный лимит не привязать к аккаунту
    // (и слова/прогресс негде хранить). Вход через Google, как на пейволле.
    if (!user) {
      await alertAsync(
        t('Войдите, чтобы сканировать'),
        t('Так слова сохранятся в твоём аккаунте и синхронизируются между устройствами. Вход через Google.'),
      );
      try {
        await signInWithGoogle();
      } catch {
        void alertAsync(t('Не удалось войти'), t('Попробуй ещё раз.'));
      }
      return;
    }
    // Спека §5.2: перед съёмкой проверяем лимит; исчерпан → Пейволл.
    if (!tryScan()) {
      router.push('/paywall');
      return;
    }
    navigating.current = true;
    feedbackImpact(); // тактильный «щелчок затвора»
    // Вспышка «затвора» + короткий зум-удар кадра — ощущение пойманного кадра.
    flash.value = withSequence(
      withTiming(0.9, { duration: 70 }),
      withTiming(0, { duration: 240 }),
    );
    capture.value = withSequence(
      withTiming(1, { duration: 80 }),
      withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) }),
    );
    // Снимаем реальный кадр. На симуляторе/при ошибке — без фото, поток продолжится.
    let photoUri: string | undefined;
    try {
      // Максимальное качество кадра → чёткая вырезка предмета (меньше JPEG-артефактов
      // на краях). Обработку iOS (шумоподавление/резкость) НЕ пропускаем — она
      // делает края чище для subject-lift.
      const photo = await cameraRef.current?.takePictureAsync({ quality: 1 });
      photoUri = photo?.uri;
    } catch (e) {
      console.warn('Съёмка не удалась:', e);
    }
    // Меряем реальное положение визира на экране (он выше центра) — чтобы кроп по
    // рамке совпал с тем, что пользователь навёл. Сбой замера → undefined (кроп
    // упадёт на прежний центр-кроп, без регресса).
    const { width: sw, height: sh } = Dimensions.get('window');
    const visor = await Promise.race<Visor | undefined>([
      new Promise<Visor | undefined>((resolve) => {
        const node = frameRef.current;
        if (!node) return resolve(undefined);
        node.measureInWindow((x, y, w, h) => {
          if (!w || !h || !Number.isFinite(x) || !Number.isFinite(y)) return resolve(undefined);
          resolve({ cx: x + w / 2, cy: y + h / 2, side: SCAN_FRAME, screenW: sw, screenH: sh });
        });
      }),
      // Страховка от подвисания, если колбэк не пришёл.
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 150)),
    ]);
    // Сначала экран «Распознаю…» (scanning), он сам уйдёт на Результат.
    const jobId = createScanJob(photoUri, mode, visor);
    router.push({ pathname: '/scanning', params: { jobId } });
  }, [router, tryScan, flash, capture, mode, user, signInWithGoogle, t]);

  // 1) Разрешение ещё загружается.
  if (!permission) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  // 2) Доступ к камере не выдан — корректно и дружелюбно просим.
  if (!permission.granted) {
    return (
      <ThemedView style={styles.center}>
        <SafeAreaView style={styles.permission}>
          <Reveal delay={0} distance={16}>
            <Sticker symbol="camera.fill" tone="primary" size={132} />
          </Reveal>
          <Reveal delay={80}>
            <ThemedText type="subtitle" style={styles.textCenter}>
              {t('Включи камеру')}
            </ThemedText>
          </Reveal>
          <Reveal delay={140}>
            <ThemedText type="default" themeColor="textSecondary" style={styles.textCenter}>
              {t('TakeWord наводится на предметы вокруг и превращает их в слова. Для этого нужен доступ к камере.')}
            </ThemedText>
          </Reveal>
          <Reveal delay={200} style={styles.permissionAction}>
            {/* Guideline 5.1.1(iv): на кнопке ПЕРЕД системным запросом нельзя
                слова вида «Разрешить/Allow» — только нейтральные «Продолжить/
                Continue» (отказ ревью 14.07.2026, билд 6). Решение о доступе
                юзер принимает в СИСТЕМНОМ диалоге, наша кнопка лишь ведёт к нему. */}
            <Button title={t('Продолжить')} icon="camera.fill" onPress={requestPermission} />
            {!permission.canAskAgain ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.textCenter}>
                {t('Доступ был запрещён. Включить можно в Настройках iOS → TakeWord → Камера.')}
              </ThemedText>
            ) : null}
          </Reveal>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // 3) Доступ есть — живое превью + премиальный оверлей.
  return (
    <View style={styles.flex}>
      {isFocused ? (
        <Animated.View style={[StyleSheet.absoluteFill, captureStyle]}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        </Animated.View>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.cameraOff]} />
      )}

      {/* Вспышка затвора (поверх всего, не ловит нажатия). */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.flash, flashStyle]}
      />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topGroup} pointerEvents="box-none">
        {/* Верх: счётчик сканов + настройки */}
        <View style={styles.topRow} pointerEvents="box-none">
          <Animated.View style={scansPillStyle}>
            <Pill
              label={isPremium ? t('Неограниченно') : `${scansLeft}/${scanLimit} ${t('сканов')}`}
              icon="bolt.fill"
              tone={lowScans ? 'primary' : 'overlay'}
              onPress={() => router.push('/paywall')}
            />
          </Animated.View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Настройки')}
            onPress={() => {
              feedbackTap();
              router.push('/settings');
            }}
            hitSlop={10}
            style={({ pressed }) => [styles.gear, { opacity: pressed ? 0.7 : 1 }]}>
            <Icon name="gearshape.fill" size={20} color={ON_CAMERA} />
          </Pressable>
        </View>
        {/* Квест дня */}
        <QuestBanner />
        </View>

        {/* Центр: сканирующий визир (квадрат) + подсказка */}
        <View style={styles.centerWrap} pointerEvents="none">
          <Animated.View ref={frameRef} style={[styles.frame, frameStyle]}>
            {/* Полупрозрачная подложка-«стекло» и тонкая полная рамка */}
            <View style={styles.frameGlass} />
            {/* Яркие угловые скобки */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            {/* Бегущая полоска «сканирования» */}
            <Animated.View
              style={[styles.scanLine, { backgroundColor: theme.accent, shadowColor: theme.accent }, scanStyle]}
            />
          </Animated.View>

          <View style={styles.hintWrap}>
            <Pill
              label={mode === 'scene' ? t('Наведи на комнату или полку') : t('Наведи на предмет')}
              icon="viewfinder"
              tone="overlay"
            />
          </View>
        </View>

        {/* Низ: переключатель режима + заметка про симулятор + кнопка съёмки */}
        <View style={styles.bottomRow} pointerEvents="box-none">
          <View style={styles.modeToggle} pointerEvents="auto">
            <CameraModeToggle
              mode={mode}
              sceneLocked={!isPremium}
              onChange={(m) => (m === 'scene' && !isPremium ? router.push('/paywall') : setMode(m))}
            />
          </View>

          <View style={styles.shutterWrap}>
            {!locked ? (
              <Animated.View
                pointerEvents="none"
                style={[styles.breathRing, { borderColor: theme.accent }, breathStyle]}
              />
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={locked ? t('Сканы кончились — открыть тарифы') : t('Снять кадр')}
              onPress={onShutter}
              onPressIn={() => (press.value = withSpring(Motion.scalePressed, Motion.spring.stiff))}
              onPressOut={() => (press.value = withSpring(1, Motion.spring.bouncy))}>
              <Animated.View style={[styles.shutterOuter, pressStyle, locked && styles.shutterLocked]}>
                {locked ? (
                  <Icon name="lock.fill" size={26} color={ON_CAMERA} />
                ) : (
                  <View style={styles.shutterInner} />
                )}
              </Animated.View>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraOff: { backgroundColor: '#000000' },

  // --- Экран-приглашение (без камеры, на токенах темы) ---
  permission: { alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.four },
  permissionAction: { alignSelf: 'stretch', gap: Spacing.three, marginTop: Spacing.one },
  textCenter: { textAlign: 'center' },

  // --- Оверлей поверх камеры ---
  overlay: { flex: 1 },
  flash: { backgroundColor: ON_CAMERA },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topGroup: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  gear: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },

  // --- Сканирующий визир (квадрат) ---
  // flex:1 + center — рамка ровно по центру между верхними и нижними контролами
  // (раньше space-between «плавал» в зависимости от высоты блоков).
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.four },
  frame: {
    width: FRAME,
    height: FRAME,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameGlass: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: FRAME_LINE,
    backgroundColor: FRAME_GLASS,
  },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: ON_CAMERA },
  cornerTL: { top: 0, left: 0, borderTopWidth: THICK, borderLeftWidth: THICK, borderTopLeftRadius: RAD },
  cornerTR: { top: 0, right: 0, borderTopWidth: THICK, borderRightWidth: THICK, borderTopRightRadius: RAD },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: THICK, borderLeftWidth: THICK, borderBottomLeftRadius: RAD },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: THICK, borderRightWidth: THICK, borderBottomRightRadius: RAD },
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
  hintWrap: { alignItems: 'center' },

  // --- Низ: заметка + кнопка съёмки ---
  bottomRow: { alignItems: 'center', gap: Spacing.three, paddingBottom: Spacing.five },
  modeToggle: { flexDirection: 'row', justifyContent: 'center' },
  shutterWrap: { width: 110, height: 90, alignItems: 'center', justifyContent: 'center' },
  breathRing: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
  },
  shutterOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 5,
    borderColor: ON_CAMERA,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: ON_CAMERA },
  shutterLocked: { opacity: 0.55, backgroundColor: 'rgba(0,0,0,0.35)' },
});
