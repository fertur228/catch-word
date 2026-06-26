/**
 * SectionHeader — заголовок секции с опциональной подписью и действием справа
 * (напр. «Смотреть все»). Единый отступ/типографика для всех списков.
 */
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { SFSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  /** Иконка перед заголовком (SF Symbol). */
  icon?: SFSymbol;
  /** Текст действия справа (напр. «Все»). Требует onAction. */
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({
  title,
  subtitle,
  icon,
  actionLabel,
  onAction,
  style,
}: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, style]}>
      {icon ? <Icon name={icon} size={20} color={theme.primary} /> : null}
      <View style={styles.titles}>
        <ThemedText type="default" style={styles.title}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <ThemedText type="smallBold" themeColor="primary">
            {actionLabel}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  titles: { flex: 1, gap: 1 },
  title: { fontWeight: '700', fontSize: 18, lineHeight: 22 },
});
