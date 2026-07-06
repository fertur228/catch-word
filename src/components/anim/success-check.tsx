/**
 * SuccessCheck — крупная «галочка успеха»: пружинное появление кружка (scale+fade
 * через Pop) и одноразовое кольцо-ореол, которое расходится и гаснет. Ореол НЕ
 * зациклен — стреляет один раз, поэтому не жрёт батарею. При «Reduce Motion» —
 * статичная галочка без движения. Всё на UI-потоке, работает и на web.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Pop } from '@/components/anim/pop';
import { Icon } from '@/components/icon';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';

export function SuccessCheck({ size = 108 }: { size?: number }) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const halo = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    // Ореол: чуть позже пружины кружка, один проход 0→1 (расходится и гаснет).
    halo.value = 0;
    halo.value = withDelay(140, withTiming(1, { duration: 640, easing: Easing.out(Easing.cubic) }));
  }, [reduce, halo]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: (1 - halo.value) * 0.45,
    transform: [{ scale: 0.7 + halo.value * 1.1 }],
  }));

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {!reduce ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: size / 2, borderWidth: 2, borderColor: theme.success },
            haloStyle,
          ]}
        />
      ) : null}
      <Pop from={0.3} spring="celebration">
        <View
          style={[
            styles.disc,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.successSoft },
          ]}>
          <Icon name="checkmark" size={size * 0.46} color={theme.success} />
        </View>
      </Pop>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  disc: { alignItems: 'center', justifyContent: 'center' },
});
