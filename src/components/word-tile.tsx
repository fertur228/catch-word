/**
 * Плитка карточки в сетке Коллекции: стикер + слово + перевод.
 * На выученных словах (mastery≥4) в углу стикера — золотой бейдж «выучено».
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Sticker } from '@/components/sticker';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isMastered } from '@/lib/srs';
import type { WordCard } from '@/types';

/** Размер стикера на плитке. */
const STICKER = 84;

export function WordTile({
  card,
  onPress,
  onLongPress,
}: {
  card: WordCard;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const theme = useTheme();
  const learned = isMastered(card);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      <View style={styles.stickerWrap}>
        <Sticker category={card.category} imageUri={card.imageUri} size={STICKER} />
        {learned ? (
          <View style={[styles.badge, { backgroundColor: theme.card }]}>
            <Icon name="checkmark.seal.fill" size={20} color={theme.gold} />
          </View>
        ) : null}
      </View>
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
  stickerWrap: { width: STICKER, height: STICKER },
  // Бейдж «выучено» — кружок фона карточки с золотой печатью-галочкой в углу стикера.
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    borderRadius: Radius.pill,
    padding: 1,
  },
  word: { fontWeight: '700', marginTop: Spacing.one },
});
