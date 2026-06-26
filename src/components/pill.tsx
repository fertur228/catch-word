/**
 * Маленькая «пилюля» (бейдж со скруглением) — для счётчика сканов, категорий и т.п.
 * Может быть кликабельной (если передан onPress).
 */
import { Pressable, StyleSheet, View } from 'react-native';
import type { SFSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Tone = 'neutral' | 'primary' | 'overlay';

interface PillProps {
  label: string;
  icon?: SFSymbol;
  tone?: Tone;
  onPress?: () => void;
}

export function Pill({ label, icon, tone = 'neutral', onPress }: PillProps) {
  const theme = useTheme();

  const bg: Record<Tone, string> = {
    neutral: theme.backgroundElement,
    primary: theme.primarySoft,
    overlay: theme.overlay,
  };
  const fg: Record<Tone, string> = {
    neutral: theme.text,
    primary: theme.primary,
    overlay: '#FFFFFF',
  };

  const content = (
    <View style={[styles.pill, { backgroundColor: bg[tone] }]}>
      {icon ? <Icon name={icon} size={14} color={fg[tone]} /> : null}
      <ThemedText type="smallBold" style={{ color: fg[tone] }}>
        {label}
      </ThemedText>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.pill,
  },
});
