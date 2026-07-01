/**
 * Плитка карточки в сетке Коллекции: стикер + слово + перевод.
 * Все тайлы одинаковой высоты — фото или иконка занимают одну и ту же область.
 * На выученных словах — золотой бейдж «выучено» (появляется с пружинным pop).
 * Нажатие — лёгкое пружинное «вдавливание»; у самой свежей плитки — пульс-свечение.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Sticker } from '@/components/sticker';
import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { isMastered } from '@/lib/srs';
import type { WordCard } from '@/types';

export function WordTile({
  card,
  onPress,
  onLongPress,
  highlight = false,
}: {
  card: WordCard;
  onPress: () => void;
  onLongPress?: () => void;
  /** Только что добавленная карточка — коротко подсвечиваем свечением-кольцом. */
  highlight?: boolean;
}) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const learned = isMastered(card);
  const hasPhoto = Boolean(card.imageUri);

  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (highlight && !reduce) {
      glow.value = withRepeat(
        withSequence(withTiming(1, { duration: 600 }), withTiming(0, { duration: 600 })),
        4,
        false,
      );
    }
  }, [highlight, reduce, glow]);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      onPressIn={() => (scale.value = withSpring(0.96, Motion.spring.stiff))}
      onPressOut={() => (scale.value = withSpring(1, Motion.spring.bouncy))}>
      <Animated.View style={[styles.tile, { backgroundColor: theme.card, borderColor: theme.border }, pressStyle]}>
        {/* Зона изображения — одинаковая для всех тайлов */}
        <View style={styles.mediaWrap}>
          {hasPhoto ? (
            <Image
              source={{ uri: card.imageUri! }}
              style={styles.photo}
              contentFit="contain"
              transition={150}
            />
          ) : (
            <Sticker category={card.category} size={80} />
          )}
          {learned ? (
            <Animated.View
              entering={reduce ? undefined : ZoomIn.springify().damping(12).stiffness(200)}
              style={[styles.badge, { backgroundColor: theme.card }]}>
              <Icon name="checkmark.seal.fill" size={18} color={theme.gold} />
            </Animated.View>
          ) : null}
        </View>

        <ThemedText type="default" style={styles.word} numberOfLines={1}>
          {card.word}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {card.translation}
        </ThemedText>

        {/* Пульс-свечение у только что пойманного слова. */}
        {highlight ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.glow, { borderColor: theme.primary }, glowStyle]}
          />
        ) : null}
      </Animated.View>
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
    padding: Spacing.three,
  },
  // Фото вписывается целиком (contain) с отступом от краёв плитки.
  photo: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    borderRadius: Radius.pill,
    padding: 1,
  },
  word: { fontWeight: '600', paddingHorizontal: Spacing.two, letterSpacing: -0.2 },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Radius.lg,
    borderWidth: 2,
  },
});
