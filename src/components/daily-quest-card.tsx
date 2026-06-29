/**
 * Карточка ежедневного квеста для экрана Коллекции (на токенах темы).
 *
 * Показывает, что сегодня найти и сфотографировать, обратный отсчёт до смены
 * квеста (живой таймер ЧЧ:ММ:СС) и серию 🔥. Тап → Камера. Когда квест выполнен —
 * «зелёное» состояние с галочкой, а таймер превращается в «новый через …».
 *
 * Данные и статус берём из useCollection() (см. collection-context / daily-quest).
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCollection } from '@/lib/collection-context';
import { msUntilQuestReset } from '@/lib/daily-quest';

/** Миллисекунды → «ЧЧ:ММ:СС». */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function DailyQuestCard() {
  const theme = useTheme();
  const router = useRouter();
  const { dailyQuest, questDoneToday, questStreak } = useCollection();

  // Живой обратный отсчёт — тикает раз в секунду, пока экран смонтирован.
  const [remaining, setRemaining] = useState(() => msUntilQuestReset());
  useEffect(() => {
    const id = setInterval(() => setRemaining(msUntilQuestReset()), 1000);
    return () => clearInterval(id);
  }, []);

  const done = questDoneToday;
  // Акцентный цвет карточки: зелёный (выполнено) или фирменный (в процессе).
  const tint = done ? theme.success : theme.primary;
  const tintSoft = done ? theme.successSoft : theme.primarySoft;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={done ? 'Квест дня выполнен' : `Квест дня: найди ${dailyQuest.translation}`}
      onPress={() => router.navigate('/(tabs)')}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: tint }]}>
        {/* Шапка: ярлык «Квест дня» + таймер обратного отсчёта */}
        <View style={styles.top}>
          <View style={styles.labelRow}>
            <Icon name="target" size={14} color={tint} />
            <Text style={[styles.label, { color: tint }]}>Квест дня</Text>
          </View>
          <View style={[styles.timer, { backgroundColor: tintSoft }]}>
            <Icon name="clock.fill" size={12} color={tint} />
            <Text style={[styles.timerText, { color: tint }]}>{formatCountdown(remaining)}</Text>
          </View>
        </View>

        {/* Тело: предмет-цель + призыв сфотографировать */}
        <View style={styles.body}>
          <View style={[styles.emojiWrap, { backgroundColor: tintSoft }]}>
            {done ? (
              <Icon name="checkmark" size={24} color={tint} />
            ) : (
              <Text style={styles.emoji}>{dailyQuest.emoji}</Text>
            )}
          </View>

          <View style={styles.texts}>
            <ThemedText type="small" themeColor="textSecondary">
              {done ? 'Выполнено — отличная работа!' : 'Найди и сфотографируй'}
            </ThemedText>
            <ThemedText type="default" style={styles.target} numberOfLines={1}>
              {done
                ? `Новый квест через ${formatCountdown(remaining)}`
                : `${dailyQuest.translation} · ${dailyQuest.word}`}
            </ThemedText>
          </View>

          {questStreak > 0 ? (
            <View style={[styles.streak, { backgroundColor: theme.goldSoft }]}>
              <Icon name="flame.fill" size={13} color={theme.gold} />
              <Text style={[styles.streakText, { color: theme.gold }]}>{questStreak}</Text>
            </View>
          ) : !done ? (
            <Icon name="camera.fill" size={20} color={tint} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  body: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  emojiWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 26 },
  texts: { flex: 1, gap: Spacing.half },
  target: { fontWeight: '700' },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  streakText: { fontSize: 13, fontWeight: '800' },
});
