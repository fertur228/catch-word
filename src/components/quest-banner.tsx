/**
 * Баннер ежедневного квеста для оверлея камеры (поверх живого видео).
 * Показывает, что сегодня найти и сфотографировать, серию 🔥, и «выполнено» —
 * когда цель поймана. Тап по баннеру открывает подробное окно-объяснение
 * (как работают квесты — в духе игр). Цвета — белые/полупрозрачные.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useCollection } from '@/lib/collection-context';
import { msUntilQuestReset, type DailyQuest } from '@/lib/daily-quest';
import { feedbackTap } from '@/lib/feedback';

const ON = '#FFFFFF';

export function QuestBanner() {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const { dailyQuest, questDoneToday, questStreak } = useCollection();
  const [open, setOpen] = useState(false);

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
    <Animated.View entering={reduce ? undefined : FadeIn.duration(Motion.duration.base)} style={bobStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Подробнее о квесте дня"
        onPress={() => {
          feedbackTap();
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.banner,
          questDoneToday ? styles.bannerDone : null,
          { opacity: pressed ? 0.9 : 1 },
        ]}>
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

        <Icon name="info.circle" size={16} color="rgba(255,255,255,0.7)" />
      </Pressable>

      <QuestDetailSheet
        visible={open}
        onClose={() => setOpen(false)}
        quest={dailyQuest}
        done={questDoneToday}
        streak={questStreak}
      />
    </Animated.View>
  );
}

/** Форматирование «через Хч Yм» до смены квеста. */
function formatLeft(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

/** Подробное окно-объяснение квеста (снизу, как игровая подсказка). */
function QuestDetailSheet({
  visible,
  onClose,
  quest,
  done,
  streak,
}: {
  visible: boolean;
  onClose: () => void;
  quest: DailyQuest;
  done: boolean;
  streak: number;
}) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.card }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />

          <View style={styles.hero}>
            <View
              style={[
                styles.heroIcon,
                { backgroundColor: done ? theme.successSoft : theme.primarySoft },
              ]}>
              {done ? (
                <Icon name="checkmark.seal.fill" size={40} color={theme.success} />
              ) : (
                <Text style={styles.heroEmoji}>{quest.emoji}</Text>
              )}
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
              {done ? 'КВЕСТ ВЫПОЛНЕН' : 'КВЕСТ ДНЯ'}
            </ThemedText>
            <ThemedText type="subtitle" style={styles.qTitle}>
              {done ? 'Отличная работа!' : `Найди и поймай ${quest.translation}`}
            </ThemedText>
            {!done ? (
              <ThemedText type="small" themeColor="textSecondary">
                {quest.word} · {quest.ipa}
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.rows}>
            {!done ? (
              <Row
                icon="camera.viewfinder"
                tone={theme.primary}
                soft={theme.primarySoft}
                title="Как выполнить"
                text="Наведи камеру на этот предмет и поймай слово — квест засчитается автоматически."
              />
            ) : null}
            <Row
              icon="flame.fill"
              tone={theme.gold}
              soft={theme.goldSoft}
              title={streak > 0 ? `Серия: ${streak} дн. подряд` : 'Серия дней'}
              text={
                streak > 0
                  ? 'Выполняй квест каждый день, чтобы серия росла и не сгорала.'
                  : 'Выполни квест — начнётся серия 🔥. Заходи каждый день, чтобы её держать.'
              }
            />
            <Row
              icon="clock"
              tone={theme.accent2}
              soft={theme.accent2Soft}
              title="Новый квест"
              text={`Обновится через ${formatLeft(msUntilQuestReset())} — новая цель на завтра.`}
            />
          </View>

          <Button title="Понятно" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Строка-объяснение: цветной кружок-иконка + заголовок + текст. */
function Row({
  icon,
  tone,
  soft,
  title,
  text,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  tone: string;
  soft: string;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: soft }]}>
        <Icon name={icon} size={18} color={tone} />
      </View>
      <View style={styles.rowBody}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.rowText}>
          {text}
        </ThemedText>
      </View>
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

  // --- Окно-объяснение ---
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: Radius.pill, marginBottom: Spacing.two },
  hero: { alignItems: 'center', gap: Spacing.one },
  heroIcon: {
    width: 84,
    height: 84,
    borderRadius: Radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  heroEmoji: { fontSize: 44 },
  eyebrow: { letterSpacing: 0.6, fontWeight: '700' },
  qTitle: { textAlign: 'center' },
  rows: { gap: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  rowIcon: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 2, paddingTop: 1 },
  rowText: { lineHeight: 20 },
});
