/**
 * Toast — короткое всплывающее подтверждение внизу экрана (например, «Язык
 * обновлён»). Управляется через prop `message`: как только он не пустой — тост
 * выезжает снизу, держится ~1.6с и сам прячется, дёргая onHide.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { SFSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

export function Toast({
  message,
  onHide,
  icon = 'checkmark.circle.fill',
}: {
  message: string | null;
  onHide: () => void;
  icon?: SFSymbol;
}) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const y = useSharedValue(40);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!message) return;
    y.value = reduce ? 0 : withSpring(0, Motion.spring.soft);
    opacity.value = withTiming(1, { duration: 180 });
    const t = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 220 });
      y.value = withTiming(40, { duration: 220 }, (f) => {
        if (f) runOnJS(onHide)();
      });
    }, 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: y.value }] }));

  if (!message) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, style]}>
      <View style={[styles.toast, { backgroundColor: theme.text }]}>
        <Icon name={icon} size={16} color={theme.background} />
        <ThemedText type="smallBold" style={{ color: theme.background }}>
          {message}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: Spacing.five, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
});
