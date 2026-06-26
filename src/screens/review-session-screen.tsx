/**
 * Экран «Повторение» — сессия интервального повторения (спека §5.6).
 *
 * Сессия идёт через несколько состояний (`phase`):
 *  1. intro      — выбор режима: «Флеш-карточки» или «Тест» + кнопка «Начать»;
 *  2. flashcards — переворот карточки + оценка Again/Good/Easy (→ `reviewCard`);
 *  3. test       — вопрос с 4 вариантами (см. `buildQuiz`), верно/неверно
 *                  маппится в оценку good/again и тоже двигает SRS;
 *  4. summary    — итог: «Повторено N» (карточки) или «N/total верно» (тест).
 *
 * Очередь берём из карточек, которые пора повторить (`dueCards`). Если на сегодня
 * всё выучено — даём «тренировку» на случайных сохранённых словах. Пустая
 * коллекция → заглушка с отправкой на Камеру.
 *
 * Данные — мок (см. src/lib/mock-data.ts). Бэкенда и реального SRS-сервера нет.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { SFSymbol } from 'expo-symbols';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { FlashCard } from '@/components/flash-card';
import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { ProgressBar } from '@/components/progress-bar';
import { FadeIn, Reveal } from '@/components/reveal';
import { Screen } from '@/components/screen';
import { SpeakButton } from '@/components/speak-button';
import { StatCard } from '@/components/stat-card';
import { Sticker } from '@/components/sticker';
import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCollection } from '@/lib/collection-context';
import { buildQuiz, type QuizQuestion } from '@/lib/quiz';
import { computeNextReview } from '@/lib/srs';
import type { SrsRating, WordCard } from '@/types';

/** Сколько карточек максимум в одной сессии повтора. */
const MAX_SESSION = 20;
/** Сколько случайных слов брать для «тренировки», когда всё выучено. */
const PRACTICE_COUNT = 5;

/** Этапы сессии. */
type Phase = 'intro' | 'flashcards' | 'test' | 'summary';
/** Режим тренировки, выбранный на интро-экране. */
type Mode = 'flashcards' | 'test';

/** Склонение слова «слово» по числу (1 слово / 2 слова / 5 слов). */
function pluralWords(n: number): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'слов';
  if (b === 1) return 'слово';
  if (b > 1 && b < 5) return 'слова';
  return 'слов';
}

/** Человеко-понятный интервал «когда увидишь снова» (минуты → «10 мин» / «1 ч» / «4 д»). */
function formatInterval(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} мин`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} ч`;
  return `${Math.round(hours / 24)} д`;
}

/** Перемешать и взять первые n элементов (Фишер–Йейтс). */
function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/** Подпись-вопрос для теста в зависимости от вида вопроса. */
function questionLabel(q: QuizQuestion): string {
  if (q.kind === 'wordToTranslation') return 'Как переводится?';
  return 'Какое это слово?';
}

export function ReviewSessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { loading, dueCards, cards, reviewCard, stats } = useCollection();

  // Очередь фиксируем один раз (снимок), чтобы она не «съезжала», когда
  // оценённые карточки покидают dueCards. null — ещё не собрана.
  const [queue, setQueue] = useState<WordCard[] | null>(null);
  const [practice, setPractice] = useState(false);

  // Текущий этап сессии и выбранный режим.
  const [phase, setPhase] = useState<Phase>('intro');
  const [mode, setMode] = useState<Mode>('flashcards');

  // --- Состояние режима «Флеш-карточки» ---
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  // Защита от двойного тапа по оценке, пока идёт переход к следующей карточке.
  const lock = useRef(false);

  // --- Состояние режима «Тест» ---
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);

  // Сборка очереди после загрузки коллекции (срабатывает один раз).
  useEffect(() => {
    if (loading || queue !== null) return;
    if (cards.length === 0) {
      setQueue([]);
      return;
    }
    if (dueCards.length > 0) {
      setQueue(dueCards.slice(0, MAX_SESSION));
      setPractice(false);
    } else {
      setQueue(pickRandom(cards, Math.min(PRACTICE_COUNT, cards.length)));
      setPractice(true);
    }
  }, [loading, queue, dueCards, cards]);

  const current = queue && index < queue.length ? queue[index] : undefined;

  // Подписи «когда повторим снова» под кнопками оценки (для текущей карточки).
  const intervals = useMemo(() => {
    if (!current) return { again: '', good: '', easy: '' };
    return {
      again: formatInterval(computeNextReview('again', current).interval),
      good: formatInterval(computeNextReview('good', current).interval),
      easy: formatInterval(computeNextReview('easy', current).interval),
    };
  }, [current]);

  // --- Старт выбранного режима с интро-экрана ---
  const onStart = useCallback(() => {
    if (!queue) return;
    if (mode === 'test') {
      // Готовим вопросы из снимка очереди (3 типа, по 4 варианта).
      setQuiz(buildQuiz(queue, queue.length));
      setQIndex(0);
      setSelected(null);
      setAnswered(false);
      setScore(0);
      setPhase('test');
    } else {
      setIndex(0);
      setRevealed(false);
      setReviewedCount(0);
      setPhase('flashcards');
    }
  }, [queue, mode]);

  // --- Оценка карточки (режим флеш-карточек) ---
  const onRate = useCallback(
    async (rating: SrsRating) => {
      if (lock.current || !queue) return;
      const card = queue[index];
      if (!card) return;
      lock.current = true;
      await reviewCard(card.id, rating);
      setReviewedCount((c) => c + 1);
      setRevealed(false);
      const next = index + 1;
      setIndex(next);
      if (next >= queue.length) setPhase('summary');
      lock.current = false;
    },
    [queue, index, reviewCard],
  );

  // --- Ответ на вопрос теста ---
  const onAnswer = useCallback(
    async (optIndex: number) => {
      if (answered || !quiz) return;
      const q = quiz[qIndex];
      if (!q) return;
      const opt = q.options[optIndex];
      setSelected(optIndex);
      setAnswered(true);
      if (opt.correct) setScore((s) => s + 1);
      // Верно → «вспомнил» (good), неверно → «забыл» (again): двигаем SRS.
      await reviewCard(q.card.id, opt.correct ? 'good' : 'again');
    },
    [answered, quiz, qIndex, reviewCard],
  );

  // --- Переход к следующему вопросу теста / к итогу ---
  const onNextQuestion = useCallback(() => {
    if (!quiz) return;
    const next = qIndex + 1;
    if (next >= quiz.length) {
      setPhase('summary');
      return;
    }
    setQIndex(next);
    setSelected(null);
    setAnswered(false);
  }, [quiz, qIndex]);

  // --- Состояние: ждём загрузку коллекции ---
  if (loading || queue === null) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
          <ThemedText type="default" themeColor="textSecondary">
            Готовим повторение…
          </ThemedText>
        </View>
      </Screen>
    );
  }

  // --- Состояние: коллекция пуста → отправляем на Камеру ---
  if (queue.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="camera.fill"
          title="Пока нечего повторять"
          message="Поймай несколько слов камерой — и они появятся здесь на повторение."
          actionLabel="Открыть камеру"
          onAction={() => router.replace('/(tabs)')}
        />
      </Screen>
    );
  }

  // ===================== ИНТРО: выбор режима =====================
  if (phase === 'intro') {
    const n = queue.length;
    return (
      <Screen scroll>
        <View style={styles.intro}>
          <Reveal distance={0}>
            <Sticker emoji={practice ? '✨' : '🧠'} size={120} />
          </Reveal>
          <Reveal delay={60}>
            <ThemedText type="subtitle" style={styles.centerText}>
              Повторение
            </ThemedText>
          </Reveal>
          <Reveal delay={110}>
            <ThemedText type="default" themeColor="textSecondary" style={styles.centerText}>
              {practice
                ? `На сегодня всё выучено! Потренируемся на ${n} ${pluralWords(n)}.`
                : `Готово к повторению: ${n} ${pluralWords(n)}.`}
            </ThemedText>
          </Reveal>

          <Reveal delay={170} style={styles.modeList}>
            <ModeCard
              icon="rectangle.stack.fill"
              title="Флеш-карточки"
              subtitle="Переворачивай и вспоминай"
              selected={mode === 'flashcards'}
              onPress={() => setMode('flashcards')}
            />
            <ModeCard
              icon="checklist"
              title="Тест"
              subtitle="Выбери правильный ответ"
              selected={mode === 'test'}
              onPress={() => setMode('test')}
            />
          </Reveal>

          <Reveal delay={240} style={styles.introAction}>
            <Button title="Начать" icon="play.fill" onPress={onStart} />
          </Reveal>
        </View>
      </Screen>
    );
  }

  // ===================== ИТОГ =====================
  if (phase === 'summary') {
    const isTest = mode === 'test';
    const total = quiz?.length ?? 0;
    return (
      <Screen>
        <View style={styles.center}>
          <Reveal distance={0}>
            <Sticker emoji="🎉" size={132} />
          </Reveal>
          <Reveal delay={80}>
            <ThemedText type="subtitle" style={styles.centerText}>
              Готово!
            </ThemedText>
          </Reveal>
          <Reveal delay={140}>
            <ThemedText type="default" themeColor="textSecondary" style={styles.centerText}>
              {isTest
                ? `Верно ${score} из ${total}. Так держать!`
                : `Повторено ${reviewedCount} ${pluralWords(reviewedCount)}. Так держать!`}
            </ThemedText>
          </Reveal>

          <Reveal delay={200} style={styles.summaryStats}>
            {isTest ? (
              <StatCard
                icon="checkmark.circle.fill"
                value={`${score}/${total}`}
                label="Верно"
                tone="success"
              />
            ) : (
              <StatCard icon="checkmark" value={reviewedCount} label="Повторено" tone="primary" />
            )}
            <StatCard icon="flame.fill" value={stats.streak} label="Серия дней" tone="accent" />
          </Reveal>

          <Reveal delay={260} style={styles.summaryActions}>
            <Button
              title="В коллекцию"
              icon="square.grid.2x2.fill"
              onPress={() => router.replace('/(tabs)/collection')}
            />
            <Button
              title="К камере"
              icon="camera.fill"
              variant="ghost"
              onPress={() => router.replace('/(tabs)')}
            />
          </Reveal>
        </View>
      </Screen>
    );
  }

  // ===================== ТЕСТ =====================
  if (phase === 'test' && quiz) {
    const q = quiz[qIndex];
    const total = quiz.length;
    if (!q) {
      // Подстраховка: вопросов нет — сразу к итогу.
      return (
        <Screen>
          <View style={styles.center}>
            <ActivityIndicator color={theme.primary} />
          </View>
        </Screen>
      );
    }

    return (
      <Screen scroll>
        {/* Шапка прогресса */}
        <View style={styles.progressBlock}>
          <View style={styles.progressRow}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Вопрос {qIndex + 1} из {total}
            </ThemedText>
            <Pill label={`${Math.round((qIndex / total) * 100)}%`} tone="primary" />
          </View>
          <ProgressBar progress={qIndex / total} tone="primary" />
        </View>

        {/* Вопрос + варианты (новый key → плавная смена) */}
        <Reveal key={q.id} distance={16} style={styles.testBody}>
          {/* Карточка-вопрос */}
          <View style={[styles.prompt, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.promptTag, { backgroundColor: theme.primarySoft }]}>
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                {questionLabel(q)}
              </ThemedText>
            </View>
            {q.kind === 'stickerToWord' ? (
              <Sticker emoji={q.prompt} size={104} />
            ) : (
              <View style={styles.promptWordRow}>
                <ThemedText
                  type="title"
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  style={styles.promptWord}>
                  {q.prompt}
                </ThemedText>
                {q.kind === 'wordToTranslation' ? (
                  <SpeakButton text={q.card.word} language={q.card.learningLang} />
                ) : null}
              </View>
            )}
          </View>

          {/* Варианты ответа */}
          <View style={styles.options}>
            {q.options.map((opt, i) => (
              <OptionButton
                key={`${q.id}-${i}`}
                text={opt.text}
                state={
                  !answered
                    ? 'idle'
                    : opt.correct
                      ? 'correct'
                      : i === selected
                        ? 'wrong'
                        : 'dim'
                }
                disabled={answered}
                onPress={() => onAnswer(i)}
              />
            ))}
          </View>
        </Reveal>

        {/* Низ: после ответа — «Дальше» */}
        <View style={styles.footer}>
          {answered ? (
            <FadeIn key="next">
              <Button
                title={qIndex + 1 >= total ? 'Завершить' : 'Дальше'}
                icon="arrow.right"
                onPress={onNextQuestion}
              />
            </FadeIn>
          ) : null}
        </View>
      </Screen>
    );
  }

  // ===================== ФЛЕШ-КАРТОЧКИ =====================
  // Подстраховка: если карточка кончилась — показываем итог.
  if (!current) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </Screen>
    );
  }

  const total = queue.length;

  return (
    <Screen>
      <View style={styles.container}>
        {/* Шапка прогресса */}
        <View style={styles.progressBlock}>
          {practice ? (
            <View style={[styles.banner, { backgroundColor: theme.accent2Soft }]}>
              <Icon name="sparkles" size={16} color={theme.accent2} />
              <ThemedText type="small" style={{ color: theme.accent2, flex: 1 }}>
                На сегодня всё выучено — тренируемся
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.progressRow}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Карточка {index + 1} из {total}
            </ThemedText>
            <Pill label={`${Math.round((index / total) * 100)}%`} tone="primary" />
          </View>
          <ProgressBar progress={index / total} tone="primary" />
        </View>

        {/* Сама карточка с переворотом (новый key → плавное появление) */}
        <View style={styles.cardArea}>
          <Reveal key={current.id} distance={16} style={styles.cardWrap}>
            <FlashCard
              flipped={revealed}
              onPress={() => setRevealed(true)}
              height={360}
              front={
                <View style={styles.face}>
                  <Sticker emoji={current.emoji} size={128} />
                  <ThemedText type="subtitle" style={styles.centerText}>
                    Вспомни слово
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Нажми, чтобы показать
                  </ThemedText>
                </View>
              }
              back={
                <View style={styles.face}>
                  <View style={styles.wordRow}>
                    <ThemedText
                      type="title"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      style={styles.word}>
                      {current.word}
                    </ThemedText>
                    <SpeakButton text={current.word} language={current.learningLang} />
                  </View>
                  <ThemedText type="default" themeColor="textSecondary">
                    /{current.ipa}/
                  </ThemedText>
                  <ThemedText type="subtitle" style={styles.centerText}>
                    {current.translation}
                  </ThemedText>
                  {current.examples[0] ? (
                    <View style={[styles.example, { backgroundColor: theme.backgroundElement }]}>
                      <ThemedText type="default" style={styles.centerText}>
                        {current.examples[0]}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              }
            />
          </Reveal>
        </View>

        {/* Низ: до показа — кнопка «Показать», после — оценка */}
        <View style={styles.footer}>
          {revealed ? (
            <FadeIn key="rate" style={styles.ratingRow}>
              <RatingButton
                icon="arrow.counterclockwise"
                label="Забыл"
                sub={intervals.again}
                bg={theme.dangerSoft}
                fg={theme.danger}
                onPress={() => onRate('again')}
              />
              <RatingButton
                icon="checkmark"
                label="Вспомнил"
                sub={intervals.good}
                bg={theme.primarySoft}
                fg={theme.primary}
                onPress={() => onRate('good')}
              />
              <RatingButton
                icon="star.fill"
                label="Легко"
                sub={intervals.easy}
                bg={theme.successSoft}
                fg={theme.success}
                onPress={() => onRate('easy')}
              />
            </FadeIn>
          ) : (
            <FadeIn key="show">
              <Button title="Показать слово" icon="sparkles" onPress={() => setRevealed(true)} />
            </FadeIn>
          )}
        </View>
      </View>
    </Screen>
  );
}

/**
 * Карточка выбора режима на интро-экране — мягкий блок с иконкой, заголовком и
 * подписью. Выбранный обведён основным цветом и помечен галочкой. Лёгкая
 * пружинная отдача при нажатии.
 */
function ModeCard({
  icon,
  title,
  subtitle,
  selected,
  onPress,
}: {
  icon: SFSymbol;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={() => (scale.value = withSpring(Motion.scalePressed, Motion.spring.stiff))}
      onPressOut={() => (scale.value = withSpring(1, Motion.spring.bouncy))}>
      <Animated.View
        style={[
          styles.modeCard,
          {
            backgroundColor: selected ? theme.primarySoft : theme.card,
            borderColor: selected ? theme.primary : theme.border,
            borderWidth: selected ? 2 : 1,
          },
          animStyle,
        ]}>
        <View
          style={[
            styles.modeIcon,
            { backgroundColor: selected ? theme.primary : theme.backgroundElement },
          ]}>
          <Icon name={icon} size={22} color={selected ? theme.onPrimary : theme.textSecondary} />
        </View>
        <View style={styles.modeText}>
          <ThemedText type="default" style={styles.modeTitle}>
            {title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        </View>
        <Icon
          name={selected ? 'checkmark.circle.fill' : 'circle'}
          size={24}
          color={selected ? theme.primary : theme.border}
        />
      </Animated.View>
    </Pressable>
  );
}

/** Визуальное состояние варианта ответа в тесте. */
type OptionState = 'idle' | 'correct' | 'wrong' | 'dim';

/**
 * Кнопка-вариант ответа в тесте. До ответа — нейтральная и нажимается; после —
 * подсвечивается зелёным (правильный) или красным (выбранный неверный), остальные
 * приглушаются. Лёгкая пружинная отдача при нажатии.
 */
function OptionButton({
  text,
  state,
  disabled,
  onPress,
}: {
  text: string;
  state: OptionState;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // Палитра под каждое состояние (мягкий фон / рамка / цвет текста / иконка).
  const palette: Record<
    OptionState,
    { bg: string; border: string; fg: string; icon: SFSymbol | null; opacity: number }
  > = {
    idle: { bg: theme.card, border: theme.border, fg: theme.text, icon: null, opacity: 1 },
    correct: {
      bg: theme.successSoft,
      border: theme.success,
      fg: theme.success,
      icon: 'checkmark.circle.fill',
      opacity: 1,
    },
    wrong: {
      bg: theme.dangerSoft,
      border: theme.danger,
      fg: theme.danger,
      icon: 'xmark.circle.fill',
      opacity: 1,
    },
    dim: { bg: theme.card, border: theme.border, fg: theme.textSecondary, icon: null, opacity: 0.5 },
  };
  const p = palette[state];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => (scale.value = withSpring(Motion.scalePressed, Motion.spring.stiff))}
      onPressOut={() => (scale.value = withSpring(1, Motion.spring.bouncy))}>
      <Animated.View
        style={[
          styles.option,
          { backgroundColor: p.bg, borderColor: p.border, opacity: p.opacity },
          animStyle,
        ]}>
        <ThemedText type="default" numberOfLines={2} style={[styles.optionText, { color: p.fg }]}>
          {text}
        </ThemedText>
        {p.icon ? <Icon name={p.icon} size={22} color={p.fg} /> : null}
      </Animated.View>
    </Pressable>
  );
}

/**
 * Кнопка оценки в сессии повтора — мягкий цветной блок с иконкой, подписью и
 * интервалом «когда увидишь снова». Лёгкая пружинная отдача при нажатии.
 */
function RatingButton({
  icon,
  label,
  sub,
  bg,
  fg,
  onPress,
}: {
  icon: SFSymbol;
  label: string;
  sub: string;
  bg: string;
  fg: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => (scale.value = withSpring(Motion.scalePressed, Motion.spring.stiff))}
      onPressOut={() => (scale.value = withSpring(1, Motion.spring.bouncy))}
      style={styles.ratingPressable}>
      <Animated.View style={[styles.ratingBtn, { backgroundColor: bg }, animStyle]}>
        <Icon name={icon} size={22} color={fg} />
        <ThemedText type="smallBold" style={{ color: fg }}>
          {label}
        </ThemedText>
        {sub ? (
          <ThemedText type="small" style={{ color: fg, opacity: 0.7 }}>
            {sub}
          </ThemedText>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  centerText: { textAlign: 'center' },

  // Интро (выбор режима)
  intro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  modeList: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.two },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  modeIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeText: { flex: 1, gap: Spacing.half },
  modeTitle: { fontWeight: '700' },
  introAction: { alignSelf: 'stretch', marginTop: Spacing.two },

  // Итог
  summaryStats: { flexDirection: 'row', gap: Spacing.two, alignSelf: 'stretch', marginTop: Spacing.two },
  summaryActions: { gap: Spacing.two, alignSelf: 'stretch', marginTop: Spacing.two },

  // Сессия
  container: { flex: 1, paddingVertical: Spacing.three },
  progressBlock: { gap: Spacing.two },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  cardArea: { flex: 1, justifyContent: 'center' },
  cardWrap: { width: '100%' },
  face: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, alignSelf: 'stretch' },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    alignSelf: 'stretch',
  },
  word: { flexShrink: 1, fontSize: 40, lineHeight: 46, textAlign: 'center' },
  example: {
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    alignSelf: 'stretch',
  },

  // Тест
  testBody: { gap: Spacing.three, marginTop: Spacing.one },
  prompt: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.xl,
    borderWidth: 1,
    minHeight: 200,
  },
  promptTag: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
  },
  promptWordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    alignSelf: 'stretch',
  },
  promptWord: { flexShrink: 1, fontSize: 36, lineHeight: 42, textAlign: 'center' },
  options: { gap: Spacing.two },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    minHeight: 56,
  },
  optionText: { flex: 1, fontWeight: '600' },

  // Низ
  footer: { minHeight: 92, justifyContent: 'center' },
  ratingRow: { flexDirection: 'row', gap: Spacing.two },
  ratingPressable: { flex: 1 },
  ratingBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.three,
    borderRadius: Radius.lg,
  },
});
