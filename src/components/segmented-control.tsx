/**
 * SegmentedControl — переключатель из нескольких сегментов (как в iOS).
 * Под выбранным сегментом ездит «таблетка»-подсветка на пружине.
 * Дженерик по значению: <SegmentedControl<'all'|'due'> ... />.
 */
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Option<T extends string> {
  label: string;
  value: T;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const [trackW, setTrackW] = useState(0);
  const count = options.length || 1;
  const segW = trackW / count;
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const tx = useSharedValue(0);

  useEffect(() => {
    tx.value = withSpring(index * segW, Motion.spring.soft);
  }, [index, segW, tx]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }], width: segW }));

  const onLayout = (e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundElement }, style]}>
      <View style={styles.track} onLayout={onLayout}>
        {trackW > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.thumb, { backgroundColor: theme.card, shadowColor: theme.shadow }, thumbStyle]}
          />
        ) : null}
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              style={styles.segment}
              onPress={() => onChange(o.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}>
              <ThemedText
                type="smallBold"
                themeColor={active ? 'text' : 'textSecondary'}
                numberOfLines={1}>
                {o.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.half, borderRadius: Radius.md },
  track: { flexDirection: 'row', position: 'relative' },
  thumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: Radius.sm,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.two },
});
