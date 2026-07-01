/**
 * Плитка карточки в сетке Коллекции: стикер + слово + перевод.
 * Все тайлы одинаковой высоты — фото или иконка занимают одну и ту же область.
 * На выученных словах — золотой бейдж «выучено».
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { Icon } from '@/components/icon';
import { Sticker } from '@/components/sticker';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isMastered } from '@/lib/srs';
import type { WordCard } from '@/types';

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
  const hasPhoto = Boolean(card.imageUri);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
      ]}>

      {/* Зона изображения — одинаковая для всех тайлов */}
      <View style={styles.mediaWrap}>
        {hasPhoto ? (
          <Image
            source={{ uri: card.imageUri! }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            transition={150}
          />
        ) : (
          <Sticker category={card.category} size={80} />
        )}
        {learned ? (
          <View style={[styles.badge, { backgroundColor: theme.card }]}>
            <Icon name="checkmark.seal.fill" size={18} color={theme.gold} />
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
    paddingBottom: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mediaWrap: {
    alignSelf: 'stretch',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    borderRadius: Radius.pill,
    padding: 1,
  },
  word: { fontWeight: '600', paddingHorizontal: Spacing.two, letterSpacing: -0.2 },
});
