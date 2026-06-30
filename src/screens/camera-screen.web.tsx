/**
 * Камера — ВЕБ-вариант (спека §5.2). Живого превью expo-camera на десктопе нет,
 * поэтому используем нативный выбор файла: «Сделать фото» открывает камеру на
 * телефоне (input capture=environment), а на десктопе — выбор файла; «Загрузить
 * фото» — всегда галерея/файл. Дальше тот же поток: createScanJob → /scanning →
 * /result (распознавание идёт через recognize.web.ts на ту же edge-функцию).
 */
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { QuestBanner } from '@/components/quest-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCollection } from '@/lib/collection-context';
import { createScanJob, type ScanMode } from '@/lib/scan-job';

/** Открыть выбор изображения. useCamera=true → на телефоне откроется камера. */
function pickImage(useCamera: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (useCamera) input.setAttribute('capture', 'environment');
    // iOS Safari: input должен быть в DOM, иначе .click() игнорируется.
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

    // iOS Safari: при закрытии пикера без выбора onchange не всегда стреляет —
    // окно снова получает focus; ждём 500ms на случай медленного onchange.
    const onFocus = () => setTimeout(() => done(null), 500);
    window.addEventListener('focus', onFocus);

    document.body.appendChild(input);
    input.click();
  });
}

export function CameraScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { scansLeft, scanLimit, tryScan, refundScan } = useCollection();
  const [mode, setMode] = useState<ScanMode>('single');
  const locked = scansLeft <= 0;
  const busy = useRef(false);

  const capture = useCallback(
    async (useCamera: boolean) => {
      if (busy.current) return;
      // Лимит исчерпан → Пейволл (как на нативе).
      if (!tryScan()) {
        router.push('/paywall');
        return;
      }
      busy.current = true;
      try {
        const uri = await pickImage(useCamera);
        if (!uri) {
          refundScan(); // отменили выбор — скан не «сжигаем»
          return;
        }
        const jobId = createScanJob(uri, mode);
        router.push({ pathname: '/scanning', params: { jobId } });
      } finally {
        busy.current = false;
      }
    },
    [router, tryScan, refundScan, mode],
  );

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.container}>
        {/* Верх: счётчик сканов + настройки */}
        <View style={styles.topRow}>
          <Pill
            label={`${scansLeft}/${scanLimit} сканов`}
            icon="bolt.fill"
            tone={locked ? 'primary' : 'neutral'}
            onPress={() => router.push('/paywall')}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Настройки"
            onPress={() => router.push('/settings')}
            hitSlop={10}>
            <Icon name="gearshape.fill" size={22} color={theme.text} />
          </Pressable>
        </View>

        <QuestBanner />

        {/* Центр: «видоискатель»-плейсхолдер + переключатель режима */}
        <View style={styles.center}>
          <View style={[styles.frame, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <Icon name="viewfinder" size={64} color={theme.textSecondary} />
            <ThemedText type="default" themeColor="textSecondary" style={styles.frameText}>
              {mode === 'scene'
                ? 'Сфотографируй комнату или полку — поймаем несколько слов'
                : 'Сфотографируй один предмет — поймаем слово'}
            </ThemedText>
          </View>

          <View style={styles.modeToggle}>
            <Pill
              label="Предмет"
              icon="viewfinder"
              tone={mode === 'single' ? 'primary' : 'neutral'}
              onPress={() => setMode('single')}
            />
            <Pill
              label="Вся сцена"
              icon="square.grid.2x2"
              tone={mode === 'scene' ? 'primary' : 'neutral'}
              onPress={() => setMode('scene')}
            />
          </View>
        </View>

        {/* Низ: действия */}
        <View style={styles.actions}>
          <Button
            title={locked ? 'Сканы кончились — тарифы' : 'Сделать фото'}
            icon={locked ? 'lock.fill' : 'camera.fill'}
            onPress={() => capture(true)}
          />
          <Button
            title="Загрузить фото"
            variant="secondary"
            icon="square.and.arrow.up"
            onPress={() => capture(false)}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.four },
  frame: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 1,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  frameText: { textAlign: 'center' },
  modeToggle: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'center' },
  actions: { gap: Spacing.two },
});

export default CameraScreen;
