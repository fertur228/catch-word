/**
 * Тоггл режима съёмки над камерой (как сегмент-контрол в системной Камере iOS):
 * тёмная стеклянная дорожка, под выбранным режимом скользит белый «thumb» на
 * пружине. Выбранный сегмент — тёмный текст на белом (яркий), невыбранный — белый.
 *
 * Общий для нативной и веб-камеры, чтобы дизайн совпадал 1:1.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { SFSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { feedbackTap } from '@/lib/feedback';
import type { ScanMode } from '@/lib/scan-job';

/** Белый — активные элементы поверх кадра; тёмный — текст на белом «thumb». */
const ON_CAMERA = '#FFFFFF';
const CAMERA_DARK = '#1C1C1E';

function ModeSeg({
  icon,
  label,
  active,
  onPress,
}: {
  icon: SFSymbol;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        feedbackTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={styles.seg}>
      <Icon name={icon} size={15} color={active ? CAMERA_DARK : ON_CAMERA} />
      <ThemedText type="smallBold" style={{ color: active ? CAMERA_DARK : ON_CAMERA }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function CameraModeToggle({ mode, onChange }: { mode: ScanMode; onChange: (m: ScanMode) => void }) {
  const [w, setW] = useState(0);
  const reduceMotion = useReduceMotion();
  const PAD = 3;
  const segW = w > 0 ? (w - PAD * 2) / 2 : 0;
  const index = mode === 'single' ? 0 : 1;
  const tx = useSharedValue(0);

  useEffect(() => {
    const target = index * segW;
    tx.value = reduceMotion ? target : withSpring(target, Motion.spring.snappy);
  }, [index, segW, reduceMotion, tx]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }], width: segW }));

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={styles.track}>
      {segW > 0 ? <Animated.View pointerEvents="none" style={[styles.thumb, thumbStyle]} /> : null}
      <ModeSeg icon="viewfinder" label="Предмет" active={mode === 'single'} onPress={() => onChange('single')} />
      <ModeSeg icon="square.grid.2x2" label="Вся сцена" active={mode === 'scene'} onPress={() => onChange('scene')} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    width: 268,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: Radius.pill,
    padding: 3,
  },
  thumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    backgroundColor: ON_CAMERA,
    borderRadius: Radius.pill,
  },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
});
