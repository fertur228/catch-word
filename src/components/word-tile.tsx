/**
 * Плитка карточки в сетке Коллекции: стикер + слово + перевод.
 */
import { Pressable, StyleSheet } from 'react-native';

import { Sticker } from '@/components/sticker';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { WordCard } from '@/types';

export function WordTile({ card, onPress }: { card: WordCard; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      <Sticker emoji={card.emoji} size={84} />
      <ThemedText type="default" style={styles.word} numberOfLines={1}>
        {card.word}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {card.translation}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  word: { fontWeight: '700', marginTop: Spacing.one },
});
