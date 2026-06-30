/**
 * Плитка карточки в сетке Коллекции: стикер + слово + перевод.
 * Когда есть вырезка (imageUri) — фото занимает всю ширину тайла (высота 128).
 * Когда фото нет — компактный квадрат-иконка 80×80.
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

const ICON_SIZE = 80;
const PHOTO_HEIGHT = 128;

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

      {/* Изображение / иконка */}
      <View style={hasPhoto ? styles.photoWrap : styles.iconWrap}>
        {hasPhoto ? (
          <Image
            source={{ uri: card.imageUri! }}
            style={styles.photo}
            contentFit="contain"
            transition={150}
          />
        ) : (
          <Sticker category={card.category} size={ICON_SIZE} />
        )}
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
    paddingBottom: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },

  // Режим фото: на всю ширину тайла
  photoWrap: {
    alignSelf: 'stretch',
    height: PHOTO_HEIGHT,
    backgroundColor: 'transparent',
  },
  photo: {
    width: '100%',
    height: '100%',
  },

  // Режим иконки: компактный квадрат
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    marginTop: Spacing.three,
  },

  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    borderRadius: Radius.pill,
    padding: 1,
  },
  word: { fontWeight: '700', paddingHorizontal: Spacing.two },
});
