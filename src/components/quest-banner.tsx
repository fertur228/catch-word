/**
 * Баннер ежедневного квеста для оверлея камеры (поверх живого видео).
 * Показывает, что сегодня найти и сфотографировать, серию 🔥, и «выполнено» —
 * когда цель поймана. Цвета — белые/полупрозрачные (лежит на кадре камеры).
 */
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCollection } from '@/lib/collection-context';

const ON = '#FFFFFF';

export function QuestBanner() {
  const theme = useTheme();
  const { dailyQuest, questDoneToday, questStreak } = useCollection();

  return (
    <View
      pointerEvents="none"
      style={[styles.banner, questDoneToday ? styles.bannerDone : null]}>
      <View style={styles.iconWrap}>
        {questDoneToday ? (
          <Icon name="checkmark" size={18} color={ON} />
        ) : (
          <Text style={styles.emoji}>{dailyQuest.emoji}</Text>
        )}
      </View>

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
          <Icon name="flame.fill" size={13} color={theme.gold} />
          <Text style={styles.streakText}>{questStreak}</Text>
        </View>
      ) : null}
    </View>
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
