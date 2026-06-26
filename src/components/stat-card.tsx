/**
 * StatCard — карточка показателя для дашборда (всего слов, освоено, серия и т.п.).
 * Иконка в цветном кружке + крупное число + подпись.
 */
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { SFSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Tone = 'primary' | 'accent' | 'accent2' | 'success' | 'warning' | 'gold' | 'neutral';

/** Пара цветов (мягкий фон кружка, насыщенный цвет иконки) для каждого тона. */
const TONES: Record<Tone, { soft: ThemeColor; strong: ThemeColor }> = {
  primary: { soft: 'primarySoft', strong: 'primary' },
  accent: { soft: 'accentSoft', strong: 'accent' },
  accent2: { soft: 'accent2Soft', strong: 'accent2' },
  success: { soft: 'successSoft', strong: 'success' },
  warning: { soft: 'warningSoft', strong: 'warning' },
  gold: { soft: 'goldSoft', strong: 'gold' },
  neutral: { soft: 'backgroundElement', strong: 'text' },
};

interface StatCardProps {
  icon: SFSymbol;
  value: string | number;
  label: string;
  tone?: Tone;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function StatCard({ icon, value, label, tone = 'primary', onPress, style }: StatCardProps) {
  const theme = useTheme();
  const t = TONES[tone];

  const content = (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, style]}>
      <View style={[styles.iconWrap, { backgroundColor: theme[t.soft] }]}>
        <Icon name={icon} size={18} color={theme[t.strong]} />
      </View>
      <ThemedText style={styles.value}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.85 : 1 })}>
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  value: { fontSize: 26, lineHeight: 30, fontWeight: '800' },
});
