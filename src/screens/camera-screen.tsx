/**
 * Главный экран — Камера (спека §5.2).
 *
 * Что делает:
 *  - корректно запрашивает доступ к камере (`useCameraPermissions`);
 *  - показывает живое превью (`CameraView`) — но активно только когда вкладка
 *    в фокусе (экономия батареи);
 *  - сверху: остаток бесплатных сканов (тап → Пейволл) и шестерёнка настроек;
 *  - снизу: большая кнопка съёмки. По нажатию (мок): списываем скан и
 *    переходим на экран Результата со случайным «распознанным» словом.
 *    Лимит исчерпан → Пейволл.
 *
 * На iOS-симуляторе камеры нет — превью будет чёрным, но кнопка съёмки и
 * весь поток работают (мок). На реальном iPhone превью живое.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCollection } from '@/lib/collection-context';
import { getRandomRecognizable } from '@/lib/mock-data';

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
  const router = useRouter();
  const isFocused = useIsFocused();
  const { scansLeft, scanLimit, tryScan } = useCollection();
  const [permission, requestPermission] = useCameraPermissions();

  const onShutter = useCallback(() => {
    // Спека §5.2: перед съёмкой проверяем лимит; исчерпан → Пейволл.
    if (!tryScan()) {
      router.push('/paywall');
      return;
    }
    const word = getRandomRecognizable();
    router.push({ pathname: '/result', params: { word: word.word } });
  }, [router, tryScan]);

  // 1) Разрешение ещё загружается.
  if (!permission) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  // 2) Доступ к камере не выдан — корректно просим (спека: «Запроси разрешение корректно»).
  if (!permission.granted) {
    return (
      <ThemedView style={styles.center}>
        <SafeAreaView style={styles.permission}>
          <Icon name="camera.fill" size={56} color={theme.primary} />
          <ThemedText type="subtitle" style={styles.textCenter}>
            Нужен доступ к камере
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.textCenter}>
            CatchWord наводится на предметы вокруг и превращает их в слова. Для этого нужен доступ к камере.
          </ThemedText>
          <Button title="Разрешить камеру" icon="camera.fill" onPress={requestPermission} />
          {!permission.canAskAgain ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.textCenter}>
              Доступ был запрещён. Включить можно в Настройках iOS → CatchWord → Камера.
            </ThemedText>
          ) : null}
        </SafeAreaView>
      </ThemedView>
    );
  }

  // 3) Доступ есть — показываем превью камеры с оверлеем.
  return (
    <View style={styles.flex}>
      {isFocused ? (
        <CameraView style={StyleSheet.absoluteFill} facing="back" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.cameraOff]} />
      )}

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        {/* Верх: счётчик сканов + настройки */}
        <View style={styles.topRow} pointerEvents="box-none">
          <Pill
            label={`${scansLeft}/${scanLimit} сканов`}
            icon="bolt.fill"
            tone="overlay"
            onPress={() => router.push('/paywall')}
          />
          <Pressable onPress={() => router.push('/settings')} hitSlop={10} style={styles.gear}>
            <Icon name="gearshape.fill" size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* Подсказка по центру */}
        <View style={styles.hintWrap} pointerEvents="none">
          <ThemedText type="smallBold" style={styles.hint}>
            Наведи на предмет и нажми кнопку
          </ThemedText>
        </View>

        {/* Низ: большая кнопка съёмки */}
        <View style={styles.bottomRow} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Снять кадр"
            onPress={onShutter}
            style={({ pressed }) => [styles.shutterOuter, { opacity: pressed ? 0.8 : 1 }]}>
            <View style={styles.shutterInner} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraOff: { backgroundColor: '#000000' },
  permission: { alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.four },
  textCenter: { textAlign: 'center' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  gear: { padding: Spacing.one },
  hintWrap: { alignItems: 'center' },
  hint: {
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  bottomRow: { alignItems: 'center', paddingBottom: Spacing.five },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF' },
});
