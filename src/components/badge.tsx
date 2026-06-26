/**
 * Badge — маленький счётчик/метка. Применяется для «сколько пора повторить»,
 * новинок и т.п. Может быть точкой (dot), числом (count) или текстом (label).
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Tone = 'danger' | 'primary' | 'accent' | 'success' | 'neutral';

const TONE_BG: Record<Tone, ThemeColor> = {
  danger: 'danger',
  primary: 'primary',
  accent: 'accent',
  success: 'success',
  neutral: 'backgroundSelected',
};

interface BadgeProps {
  /** Число (свыше 99 → «99+»). */
  count?: number;
  /** Текстовая метка вместо числа. */
  label?: string;
  /** Просто цветная точка (без текста). */
  dot?: boolean;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ count, label, dot = false, tone = 'danger', style }: BadgeProps) {
  const theme = useTheme();
  const bg = theme[TONE_BG[tone]];
  const fg = tone === 'neutral' ? theme.text : '#FFFFFF';

  if (dot) {
    return <View style={[styles.dot, { backgroundColor: bg }, style]} />;
  }

  // Если задан count и он 0 — ничего не показываем (нечего считать).
  if (count != null && count <= 0 && !label) return null;
  const text = label ?? (count != null ? (count > 99 ? '99+' : String(count)) : '');

  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <ThemedText type="smallBold" style={[styles.text, { color: fg }]}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 12, lineHeight: 16 },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
