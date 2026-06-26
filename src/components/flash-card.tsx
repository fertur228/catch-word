/**
 * FlashCard — карточка с переворотом (3D-флип) для сессии повтора (спека §5.6).
 * Спереди — слово/стикер, сзади — перевод/пример. Можно управлять снаружи
 * (`flipped`) или дать ей самой переворачиваться по тапу (если `flipped` не задан).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface FlashCardProps {
  front: ReactNode;
  back: ReactNode;
  /** Управляемый режим: true — показана задняя сторона. Не задан — переворот по тапу. */
  flipped?: boolean;
  /** Дополнительно к перевороту по тапу (напр. озвучить слово). */
  onPress?: () => void;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export function FlashCard({ front, back, flipped, onPress, height = 320, style }: FlashCardProps) {
  const theme = useTheme();
  const [local, setLocal] = useState(false);
  const isFlipped = flipped ?? local;
  const progress = useSharedValue(isFlipped ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(isFlipped ? 1 : 0, { duration: Motion.duration.slow });
  }, [isFlipped, progress]);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1000 }, { rotateY: `${interpolate(progress.value, [0, 1], [0, 180])}deg` }],
    opacity: progress.value < 0.5 ? 1 : 0,
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1000 }, { rotateY: `${interpolate(progress.value, [0, 1], [180, 360])}deg` }],
    opacity: progress.value < 0.5 ? 0 : 1,
  }));

  const handlePress = () => {
    onPress?.();
    if (flipped === undefined) setLocal((v) => !v);
  };

  const faceColor = { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow };

  return (
    <Pressable onPress={handlePress} style={[{ height }, style]} accessibilityRole="button">
      <Animated.View style={[styles.face, faceColor, frontStyle]}>{front}</Animated.View>
      <Animated.View style={[styles.face, faceColor, backStyle]}>{back}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    backfaceVisibility: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
  },
});
