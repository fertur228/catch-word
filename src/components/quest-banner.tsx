/**
 * Баннер ежедневного квеста для оверлея камеры (поверх живого видео).
 * Показывает, что сегодня найти и сфотографировать, серию 🔥, и «выполнено» —
 * когда цель поймана. Цвета — белые/полупрозрачные (лежит на кадре камеры).
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useCollection } from '@/lib/collection-context';

const ON = '#FFFFFF';

export function QuestBanner() {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const { dailyQuest, questDoneToday, questStreak } = useCollection();

  const bob = useSharedValue(0); // лёгкое покачивание, пока квест не выполнен
  const flame = useSharedValue(1); // пульс огонька серии
  const donePop = useSharedValue(1); // «выскок» иконки при выполнении

  useEffect(() => {
    if (reduce || questDoneToday) {
      bob.value = 0;
      return;
    }
    bob.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [reduce, questDoneToday, bob]);

  useEffect(() => {
    if (reduce || questStreak <= 0) return;
    flame.value = withRepeat(
      withSequence(withTiming(1.18, { duration: 500 }), withTiming(1, { duration: 500 })),
      -1,
      false,
    );
  }, [reduce, questStreak, flame]);

  useEffect(() => {
    if (questDoneToday && !reduce) {
      donePop.value = 0.6;
      donePop.value = withSpring(1, Motion.spring.bouncy);
    }
  }, [questDoneToday, reduce, donePop]);

  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * bob.value }] }));
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: flame.value }] }));
  const donePopStyle = useAnimatedStyle(() => ({ transform: [{ scale: donePop.value }] }));

  return (
    <Animated.View
      pointerEvents="none"
      entering={reduce ? undefined : FadeIn.duration(Motion.duration.base)}
      style={[styles.banner, questDoneToday ? styles.bannerDone : null, bobStyle]}>
      <Animated.View style={[styles.iconWrap, donePopStyle]}>
        {questDoneToday ? (
          <Icon name="checkmark" size={18} color={ON} />
        ) : (
          <Text style={styles.emoji}>{dailyQuest.emoji}</Text>
        )}
      </Animated.View>

      <View style={styles.texts}>
        <Text style={styles.label}>{questDoneToday ? 'Квест выполнен' : 'Квест дня'}</Text>
        <Text style={styles.title} numberOfLines={1}>
          {questDoneToday
            ? 'Отличная работа!'
            : `Найди и поймай: ${dailyQuest.translation} · ${dailyQuest.word}`}
        </Text>
      </View>

      {questStreak > 0 ? (
        <View style={styles.streak}>
          <Animated.View style={flameStyle}>
            <Icon name="flame.fill" size={13} color={theme.gold} />
          </Animated.View>
          <Text style={styles.streakText}>{questStreak}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  bannerDone: { backgroundColor: 'rgba(31,157,85,0.55)' },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  emoji: { fontSize: 22 },
  texts: { flex: 1, gap: 1 },
  label: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  title: { color: ON, fontSize: 15, fontWeight: '700' },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  streakText: { color: ON, fontSize: 13, fontWeight: '800' },
});
