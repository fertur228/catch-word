/**
 * Камера — веб-версия.
 * Десктоп: живое превью через getUserMedia + захват кадра по нажатию затвора.
 * Мобильный браузер: чистая кнопка-призыв вместо декоративного визира.
 * iOS Safari: input обязательно должен быть в DOM до .click().
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { QuestBanner } from '@/components/quest-banner';
import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCollection } from '@/lib/collection-context';
import { createScanJob, SCAN_FRAME, type ScanMode } from '@/lib/scan-job';

const ON_CAMERA = '#FFFFFF';
const FRAME_LINE = 'rgba(255,255,255,0.28)';
const FRAME_GLASS = 'rgba(255,255,255,0.08)';
const CAM_BG = '#0a0a10';

const FRAME = SCAN_FRAME;
const CORNER = 34;
const THICK = 4;
const RAD = 18;

const IS_DESKTOP =
  typeof navigator !== 'undefined' &&
  !/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

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

function pickImage(useCamera: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (useCamera) input.setAttribute('capture', 'environment');
    input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none';

    let resolved = false;
    const done = (val: string | null) => {
      if (resolved) return;
      resolved = true;
      input.remove();
      window.removeEventListener('focus', onFocus);
      resolve(val);
    };

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { done(null); return; }
      const reader = new FileReader();
      reader.onload = () => done(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => done(null);
      reader.readAsDataURL(file);
    };

    const onFocus = () => setTimeout(() => done(null), 500);
    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    input.click();
  });
}

export function CameraScreen() {
  const theme = useTheme();
  const router = useRouter();
  const isFocused = useIsFocused();
  const { scansLeft, scanLimit, tryScan, refundScan } = useCollection();
  const locked = scansLeft <= 0;
  const [mode, setMode] = useState<ScanMode>('single');
  const busy = useRef(false);

  // Веб-камера (только десктоп)
  const webcamDivRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [camError, setCamError] = useState(false);

  const webcamContainerRef = useCallback((node: unknown) => {
    webcamDivRef.current = node as HTMLDivElement | null;
  }, []);

  useEffect(() => {
    if (!IS_DESKTOP) return;
    const stopCam = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) { videoRef.current.remove(); videoRef.current = null; }
    };
    if (!isFocused) { stopCam(); return; }
    const div = webcamDivRef.current;
    if (!div) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
        div.appendChild(video);
        videoRef.current = video;
        setCamError(false);
      })
      .catch(() => { if (!cancelled) setCamError(true); });
    return () => { cancelled = true; stopCam(); };
  }, [isFocused]);

  const captureFrame = (): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.92);
  };

  // Анимации для десктоп-визира
  const pulse = useSharedValue(0);
  const scan = useSharedValue(0);
  const breath = useSharedValue(0);
  const press = useSharedValue(1);

  useEffect(() => {
    if (!isFocused || !IS_DESKTOP) {
      cancelAnimation(pulse); cancelAnimation(scan); cancelAnimation(breath);
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: Motion.duration.lazy, easing: Easing.inOut(Easing.ease) }), -1, true);
    scan.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.ease) }), -1, true);
    breath.value = withRepeat(withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }), -1, false);
    return () => { cancelAnimation(pulse); cancelAnimation(scan); cancelAnimation(breath); };
  }, [isFocused, pulse, scan, breath]);

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
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  const capture = useCallback(
    async (useCamera: boolean) => {
      if (busy.current) return;
      if (!tryScan()) { router.push('/paywall'); return; }
      busy.current = true;
      try {
        let uri: string | null = null;
        if (IS_DESKTOP && useCamera) {
          uri = captureFrame();
          if (!uri) uri = await pickImage(false);
        } else {
          uri = await pickImage(useCamera);
        }
        if (!uri) { refundScan(); return; }
        const jobId = createScanJob(uri, mode);
        router.push({ pathname: '/scanning', params: { jobId } });
      } finally {
        busy.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, tryScan, refundScan, mode],
  );

  return (
    <View style={styles.root}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: CAM_BG }]} />

      <SafeAreaView style={styles.overlay}>
        {/* ── ВЕРХ ── */}
        <View style={styles.topGroup}>
          <View style={styles.topRow}>
            <Pill
              label={`${scansLeft}/${scanLimit} сканов`}
              icon="bolt.fill"
              tone="overlay"
              onPress={() => router.push('/paywall')}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Настройки"
              onPress={() => router.push('/settings')}
              hitSlop={10}
              style={({ pressed }) => [styles.gear, { opacity: pressed ? 0.7 : 1 }]}>
              <Icon name="gearshape.fill" size={20} color={ON_CAMERA} />
            </Pressable>
          </View>
          <QuestBanner />
        </View>

        {/* ── ЦЕНТР ── */}
        {IS_DESKTOP ? (
          // Десктоп: анимированный визир с живым превью
          <View style={styles.centerWrap} pointerEvents="none">
            <Animated.View style={[styles.frame, frameStyle]}>
              <View ref={webcamContainerRef as React.Ref<View>} style={styles.webcamFill} />
              <View style={styles.frameGlass} />
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              <Animated.View
                style={[styles.scanLine, { backgroundColor: theme.accent, shadowColor: theme.accent }, scanStyle]}
              />
              {camError ? (
                <View style={styles.camErrorWrap}>
                  <Icon name="camera.fill" size={28} color="rgba(255,255,255,0.5)" />
                  <ThemedText style={styles.camErrorText}>Нет доступа к камере</ThemedText>
                </View>
              ) : null}
            </Animated.View>
            <View style={styles.hintWrap}>
              <Pill label="Наведи на предмет и нажми кнопку" icon="camera.fill" tone="overlay" />
            </View>
          </View>
        ) : (
          // Мобильный браузер: чистая tap-зона вместо декоративного квадрата
          <Pressable
            onPress={() => (locked ? router.push('/paywall') : capture(true))}
            style={({ pressed }) => [styles.tapZone, { opacity: pressed ? 0.75 : 1 }]}>
            <View style={[styles.tapIcon, { backgroundColor: locked ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.15)' }]}>
              <Icon name={locked ? 'lock.fill' : 'camera.fill'} size={36} color={ON_CAMERA} />
            </View>
            <ThemedText style={styles.tapLabel}>
              {locked ? 'Лимит сканов исчерпан' : 'Нажми, чтобы сфотографировать'}
            </ThemedText>
            {!locked && (
              <ThemedText style={styles.tapSub}>
                Наведи камеру на предмет
              </ThemedText>
            )}
          </Pressable>
        )}

        {/* ── НИЗ ── */}
        <View style={styles.bottomRow}>
          <View style={styles.modeToggle}>
            <Pill label="Предмет" icon="viewfinder" tone={mode === 'single' ? 'primary' : 'overlay'} onPress={() => setMode('single')} />
            <Pill label="Вся сцена" icon="square.grid.2x2" tone={mode === 'scene' ? 'primary' : 'overlay'} onPress={() => setMode('scene')} />
          </View>

          {IS_DESKTOP ? (
            // Десктоп: стандартная кнопка-затвор
            <View style={styles.shutterWrap}>
              {!locked ? (
                <Animated.View pointerEvents="none" style={[styles.breathRing, { borderColor: theme.accent }, breathStyle]} />
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => (locked ? router.push('/paywall') : capture(true))}
                onPressIn={() => (press.value = withSpring(Motion.scalePressed, Motion.spring.stiff))}
                onPressOut={() => (press.value = withSpring(1, Motion.spring.bouncy))}>
                <Animated.View style={[styles.shutterOuter, pressStyle, locked && styles.shutterLocked]}>
                  {locked ? <Icon name="lock.fill" size={26} color={ON_CAMERA} /> : <View style={styles.shutterInner} />}
                </Animated.View>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            onPress={() => capture(false)}
            disabled={locked}
            style={({ pressed }) => [styles.galleryLink, { opacity: pressed || locked ? 0.5 : 1 }]}>
            <Icon name="square.and.arrow.up" size={15} color={ON_CAMERA} />
            <ThemedText style={styles.galleryText}>Загрузить из галереи</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'space-between' },

  topGroup: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gear: {
    width: 40, height: 40, borderRadius: Radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },

  // Мобильный веб: tap-зона
  tapZone: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  tapIcon: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  tapLabel: { color: ON_CAMERA, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  tapSub: { color: 'rgba(255,255,255,0.55)', fontSize: 14, textAlign: 'center' },

  // Десктоп: визир
  centerWrap: { alignItems: 'center', gap: Spacing.four },
  frame: { width: FRAME, height: FRAME, alignItems: 'center', justifyContent: 'center' },
  webcamFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 30, overflow: 'hidden' },
  frameGlass: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 30, borderWidth: 1.5, borderColor: FRAME_LINE, backgroundColor: FRAME_GLASS,
  },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: ON_CAMERA },
  cornerTL: { top: 0, left: 0, borderTopWidth: THICK, borderLeftWidth: THICK, borderTopLeftRadius: RAD },
  cornerTR: { top: 0, right: 0, borderTopWidth: THICK, borderRightWidth: THICK, borderTopRightRadius: RAD },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: THICK, borderLeftWidth: THICK, borderBottomLeftRadius: RAD },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: THICK, borderRightWidth: THICK, borderBottomRightRadius: RAD },
  scanLine: {
    position: 'absolute', top: 0, left: Spacing.three, right: Spacing.three,
    height: 3, borderRadius: 2,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 8,
  },
  camErrorWrap: { position: 'absolute', alignItems: 'center', gap: Spacing.two },
  camErrorText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '500' },
  hintWrap: { alignItems: 'center' },

  // Низ
  bottomRow: { alignItems: 'center', gap: Spacing.three, paddingBottom: Spacing.five },
  modeToggle: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'center' },
  shutterWrap: { width: 110, height: 90, alignItems: 'center', justifyContent: 'center' },
  breathRing: { position: 'absolute', width: 84, height: 84, borderRadius: 42, borderWidth: 3 },
  shutterOuter: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 5,
    borderColor: ON_CAMERA, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: ON_CAMERA },
  shutterLocked: { opacity: 0.55, backgroundColor: 'rgba(0,0,0,0.35)' },
  galleryLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  galleryText: { color: ON_CAMERA, fontSize: 14, fontWeight: '500' },
});

export default CameraScreen;
