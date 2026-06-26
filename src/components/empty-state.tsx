/**
 * EmptyState — дружелюбная заглушка для пустых экранов (пустая коллекция,
 * нет карточек на повтор, ничего не найдено). Большая иконка в мягком кружке,
 * заголовок, текст и опциональная кнопка-действие.
 */
import { StyleSheet, View } from 'react-native';
import type { SFSymbol } from 'expo-symbols';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface EmptyStateProps {
  icon: SFSymbol;
  title: string;
  message?: string;
  /** Текст кнопки (требует onAction). */
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={[styles.iconCircle, { backgroundColor: theme.primarySoft }]}>
        <Icon name={icon} size={44} color={theme.primary} />
      </View>
      <ThemedText type="subtitle" style={styles.center}>
        {title}
      </ThemedText>
      {message ? (
        <ThemedText type="default" themeColor="textSecondary" style={styles.center}>
          {message}
        </ThemedText>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  center: { textAlign: 'center' },
  action: { marginTop: Spacing.two, alignSelf: 'stretch' },
});
