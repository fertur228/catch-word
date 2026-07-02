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
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { SFSymbol } from 'expo-symbols';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { CelebrationModal } from '@/components/anim/celebration-modal';
import { Confetti } from '@/components/anim/confetti';
import { SwipeToRate } from '@/components/anim/swipe-to-rate';
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
import { feedbackCorrect, feedbackTap, feedbackWrong } from '@/lib/feedback';
import { speakWord } from '@/lib/speech';
import { buildQuiz, type QuizKind, type QuizQuestion } from '@/lib/quiz';
import { computeNextReview } from '@/lib/srs';
import type { SrsRating, WordCard } from '@/types';

/** Сколько карточек максимум в одной сессии повтора. */
const MAX_SESSION = 20;
/** Сколько случайных слов брать для «тренировки», когда всё выучено. */
const PRACTICE_COUNT = 5;

/** Этапы сессии. */
type Phase = 'intro' | 'flashcards' | 'test' | 'summary';
/** Режим тренировки, выбранный на интро-экране. */
type Mode = 'flashcards' | 'smart' | 'listen' | 'sentence';

/** Фиксированный формат вопроса для режима (undefined = адаптивный «Умный тест»). */
function forceKindFor(m: Mode): QuizKind | undefined {
  if (m === 'listen') return 'audioToWord';
  if (m === 'sentence') return 'clozeExample';
  return undefined;
}

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

export function ReviewSessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { loading, dueCards, cards, reviewCard, stats, prefs } = useCollection();

  // Очередь фиксируем один раз (снимок), чтобы она не «съезжала», когда
  // оценённые карточки покидают dueCards. null — ещё не собрана.
  const [queue, setQueue] = useState<WordCard[] | null>(null);
  const [practice, setPractice] = useState(false);

  // Текущий этап сессии. Режим один — единый адаптивный тест (mode оставлен для
  // совместимости со сводкой/расписанием, всегда 'test').
  const [phase, setPhase] = useState<Phase>('intro');
  const [mode, setMode] = useState<Mode>('smart');

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
  // Ввод для «Впиши слово»: текст + результат проверки (null — ещё не проверяли).
  const [typed, setTyped] = useState('');
  const [typeChecked, setTypeChecked] = useState<boolean | null>(null);

  // Слова, которые не дались в этой сессии (тест — неверный ответ, карточки —
  // оценка «Забыл»). Используем для блока «Разбор ошибок» и кнопки «Повторить
  // ошибки» на экране итога. Дедуплицируем по id.
  const [missed, setMissed] = useState<WordCard[]>([]);
  const addMissed = useCallback((card: WordCard) => {
    setMissed((prev) => (prev.some((c) => c.id === card.id) ? prev : [...prev, card]));
  }, []);

  // Салют при верном ответе, шейк промпта при неверном, празднование идеальной сессии.
  const [burst, setBurst] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const celebratedRef = useRef(false);
  const promptShake = useSharedValue(0);
  const promptShakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: promptShake.value }] }));

  // Повторение — строго по активной паре языков (курсу): сменили пару в
  // Настройках → начинаем сессию заново по её словам (cards/dueCards уже scoped).
  useEffect(() => {
    setQueue(null);
    setPhase('intro');
    setIndex(0);
    setRevealed(false);
    setReviewedCount(0);
    setMissed([]);
  }, [prefs.learningLang, prefs.nativeLang]);

  // Сборка очереди. Пересобираем, ПОКА не начата сессия (phase 'intro') и очередь
  // ещё пустая/не собрана — чтобы подхватить карточки, подгрузившиеся из облака
  // позже (частый кейс на вебе: раздел открыли раньше, чем синк вернул слова).
  useEffect(() => {
    if (loading || phase !== 'intro') return;
    if (queue && queue.length > 0) return; // валидная очередь уже собрана — не трогаем
    if (cards.length === 0) {
      if (queue === null) setQueue([]);
      return;
    }
    if (dueCards.length > 0) {
      setQueue(dueCards.slice(0, MAX_SESSION));
      setPractice(false);
    } else {
      setQueue(pickRandom(cards, Math.min(PRACTICE_COUNT, cards.length)));
      setPractice(true);
    }
  }, [loading, queue, dueCards, cards, phase]);

  const current = queue && index < queue.length ? queue[index] : undefined;

  // Duolingo-style: как только перевернули карточку — автоматически озвучиваем слово.
  useEffect(() => {
    if (phase === 'flashcards' && revealed && current) {
      speakWord(current.word, current.learningLang);
    }
  }, [phase, revealed, current]);

  // Аудио-вопрос в тесте: проигрываем слово сразу при появлении вопроса.
  useEffect(() => {
    if (phase !== 'test' || !quiz) return;
    const q = quiz[qIndex];
    if (q && q.promptMode === 'audio') speakWord(q.card.word, q.card.learningLang);
  }, [phase, qIndex, quiz]);

  // Идеальная сессия (без ошибок) достаточной длины → празднование-модалка.
  useEffect(() => {
    if (phase !== 'summary') {
      celebratedRef.current = false;
      return;
    }
    if (celebratedRef.current || missed.length > 0) return;
    const enough = mode !== 'flashcards' ? (quiz?.length ?? 0) >= 5 : reviewedCount >= 5;
    if (enough) {
      celebratedRef.current = true;
      setShowCelebration(true);
    }
  }, [phase, missed.length, mode, quiz, reviewedCount]);

  // Подписи «когда повторим снова» под кнопками оценки (для текущей карточки).
  const intervals = useMemo(() => {
    if (!current) return { again: '', good: '', easy: '' };
    return {
      again: formatInterval(computeNextReview('again', current).interval),
      good: formatInterval(computeNextReview('good', current).interval),
      easy: formatInterval(computeNextReview('easy', current).interval),
    };
  }, [current]);

  // Собрать свежую очередь «с нуля» (для «Пройти ещё раз»): сначала то, что пора
  // повторить, иначе — случайная тренировка. Тот же приоритет, что при первом входе.
  const buildFreshQueue = useCallback((): WordCard[] => {
    if (cards.length === 0) return [];
    if (dueCards.length > 0) {
      setPractice(false);
      return dueCards.slice(0, MAX_SESSION);
    }
    setPractice(true);
    return pickRandom(cards, Math.min(PRACTICE_COUNT, cards.length));
  }, [cards, dueCards]);

  // Запустить сессию заданного режима по заданной очереди. Сбрасывает всё
  // прогресс-состояние, поэтому годится и для старта, и для «пройти заново».
  const startWith = useCallback(
    (m: Mode, q: WordCard[]) => {
      if (q.length === 0) return;
      setQueue(q);
      setMode(m);
      setMissed([]);
      if (m === 'flashcards') {
        setIndex(0);
        setRevealed(false);
        setReviewedCount(0);
        setPhase('flashcards');
      } else {
        // Вопросы из очереди; дистракторы/картинки — из всей коллекции (пула).
        // «На слух» и «Слово в предложение» фиксируют формат через forceKindFor.
        setQuiz(buildQuiz(q, q.length, cards, forceKindFor(m)));
        setQIndex(0);
        setSelected(null);
        setAnswered(false);
        setScore(0);
        setPhase('test');
      }
    },
    [cards],
  );

  // --- Пройти ещё раз тем же режимом (свежая очередь) ---
  const onRestart = useCallback(() => {
    feedbackTap();
    startWith(mode, buildFreshQueue());
  }, [mode, startWith, buildFreshQueue]);

  // --- Вернуться к выбору режима (свежая очередь) ---
  const onChangeMode = useCallback(() => {
    feedbackTap();
    setQueue(buildFreshQueue());
    setMissed([]);
    setPhase('intro');
  }, [buildFreshQueue]);

  // --- Повторить только ошибки тестом ---
  const onRetryMissed = useCallback(() => {
    if (missed.length === 0) return;
    feedbackTap();
    startWith('smart', missed);
  }, [missed, startWith]);

  // --- Оценка карточки (режим флеш-карточек) ---
  const onRate = useCallback(
    async (rating: SrsRating) => {
      if (lock.current || !queue) return;
      const card = queue[index];
      if (!card) return;
      lock.current = true;
      feedbackTap();
      if (rating === 'again') addMissed(card);
      await reviewCard(card.id, rating);
      setReviewedCount((c) => c + 1);
      setRevealed(false);
      const next = index + 1;
      setIndex(next);
      if (next >= queue.length) setPhase('summary');
      lock.current = false;
    },
    [queue, index, reviewCard, addMissed],
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
      // Звук + вибрация (как Duolingo) и озвучка правильного слова.
      if (opt.correct) {
        setScore((s) => s + 1);
        feedbackCorrect();
        setBurst((b) => b + 1); // мини-салют за верный ответ
      } else {
        addMissed(q.card);
        feedbackWrong();
        // Красный шейк промпта — сразу видно, что мимо.
        promptShake.value = withSequence(
          withTiming(-9, { duration: 55 }),
          withTiming(9, { duration: 55 }),
          withTiming(-5, { duration: 55 }),
          withTiming(0, { duration: 55 }),
        );
      }
      speakWord(q.card.word, q.card.learningLang);
      // Верно → «вспомнил» (good), неверно → «забыл» (again): двигаем SRS.
      await reviewCard(q.card.id, opt.correct ? 'good' : 'again');
    },
    [answered, quiz, qIndex, reviewCard, addMissed, promptShake],
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
    setTyped('');
    setTypeChecked(null);
  }, [quiz, qIndex]);

  // --- «Знакомство» (новое слово): показали → мягко планируем и идём дальше ---
  const onIntroNext = useCallback(async () => {
    if (!quiz) return;
    const q = quiz[qIndex];
    if (q) await reviewCard(q.card.id, 'good'); // экспозиция → назначить скорый повтор
    onNextQuestion();
  }, [quiz, qIndex, reviewCard, onNextQuestion]);

  // --- «Впиши слово»: проверка ввода (регистр/пробелы не важны) ---
  const onTypeSubmit = useCallback(async () => {
    if (typeChecked !== null || !quiz) return;
    const q = quiz[qIndex];
    if (!q) return;
    const norm = (s: string) => s.trim().toLowerCase();
    const correct = norm(typed) === norm(q.card.word);
    setTypeChecked(correct);
    if (correct) {
      setScore((s) => s + 1);
      feedbackCorrect();
      setBurst((b) => b + 1);
    } else {
      addMissed(q.card);
      feedbackWrong();
      promptShake.value = withSequence(
        withTiming(-9, { duration: 55 }),
        withTiming(9, { duration: 55 }),
        withTiming(-5, { duration: 55 }),
        withTiming(0, { duration: 55 }),
      );
    }
    speakWord(q.card.word, q.card.learningLang);
    await reviewCard(q.card.id, correct ? 'good' : 'again');
  }, [typeChecked, typed, quiz, qIndex, reviewCard, addMissed, promptShake]);

  // --- «Скажи вслух»: самооценка (нет объективной проверки до ASR) ---
  const onSpeakRate = useCallback(
    async (rating: SrsRating) => {
      if (!quiz) return;
      const q = quiz[qIndex];
      if (q) {
        if (rating === 'again') addMissed(q.card);
        await reviewCard(q.card.id, rating);
      }
      onNextQuestion();
    },
    [quiz, qIndex, reviewCard, addMissed, onNextQuestion],
  );

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
          <Reveal delay={60}>
            <ThemedText type="subtitle" style={styles.centerText}>
              Повторение
            </ThemedText>
          </Reveal>
          <Reveal delay={90}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
              Ежедневная практика помогает лучше запоминать слова
            </ThemedText>
          </Reveal>
          <Reveal delay={110}>
            <ThemedText type="default" themeColor="textSecondary" style={styles.centerText}>
              {practice
                ? `На сегодня всё выучено — потренируемся на ${n} ${pluralWords(n)}.`
                : `${n} ${pluralWords(n)} ждут повторения. Выбери режим:`}
            </ThemedText>
          </Reveal>

          <View style={styles.modeList}>
            <Reveal delay={170}>
              <ModeCard
                icon="rectangle.on.rectangle.angled"
                title="Карточки"
                subtitle="Фото → слово, перевод и звук"
                selected={false}
                onPress={() => startWith('flashcards', queue)}
              />
            </Reveal>
            <Reveal delay={210}>
              <ModeCard
                icon="brain.head.profile"
                title="Умный тест"
                subtitle="Разные форматы под твой уровень"
                selected={false}
                onPress={() => startWith('smart', queue)}
              />
            </Reveal>
            <Reveal delay={250}>
              <ModeCard
                icon="ear"
                title="На слух"
                subtitle="Слушай слово — выбери ответ"
                selected={false}
                onPress={() => startWith('listen', queue)}
              />
            </Reveal>
            <Reveal delay={290}>
              <ModeCard
                icon="text.insert"
                title="Слово в предложение"
                subtitle="Вставь пропущенное слово"
                selected={false}
                onPress={() => startWith('sentence', queue)}
              />
            </Reveal>
          </View>
        </View>
      </Screen>
    );
  }

  // ===================== ИТОГ =====================
  if (phase === 'summary') {
    // Точность считаем только по «объективным» вопросам (выбор + впиши):
    // знакомство и «скажи вслух» не имеют объективного «верно/неверно».
    const objTotal = quiz?.filter((q) => q.answerMode === 'choice' || q.answerMode === 'type').length ?? 0;
    const accuracy = objTotal > 0 ? Math.round((score / objTotal) * 100) : null;
    // «Идеально» — сессия без единой ошибки.
    const perfect = missed.length === 0;

    return (
      <Screen scroll>
        {/* Салют, если сессия без единой ошибки. */}
        <Confetti trigger={perfect ? 1 : 0} count={28} originTop="22%" />
        <View style={styles.summary}>
          <Reveal distance={0}>
            <Sticker
              symbol={perfect ? 'trophy.fill' : 'checkmark.seal.fill'}
              tone={perfect ? 'gold' : 'primary'}
              size={120}
            />
          </Reveal>
          <Reveal delay={80}>
            <ThemedText type="subtitle" style={styles.centerText}>
              {perfect ? 'Идеально!' : 'Готово!'}
            </ThemedText>
          </Reveal>
          <Reveal delay={140}>
            <ThemedText type="default" themeColor="textSecondary" style={styles.centerText}>
              {perfect
                ? 'Без единой ошибки — так держать!'
                : objTotal > 0
                  ? `Верно ${score} из ${objTotal}. Разберём промахи ниже.`
                  : 'Готово. Разберём промахи ниже.'}
            </ThemedText>
          </Reveal>

          <Reveal delay={200} style={styles.summaryStats}>
            {accuracy !== null ? (
              <StatCard
                icon="target"
                value={`${accuracy}%`}
                label="Точность"
                tone={accuracy >= 80 ? 'success' : 'primary'}
              />
            ) : (
              <StatCard icon="checkmark" value={objTotal} label="Проверок" tone="primary" />
            )}
            {missed.length > 0 ? (
              <StatCard icon="xmark.circle.fill" value={missed.length} label="Ошибок" tone="warning" />
            ) : (
              <StatCard icon="flame.fill" value={stats.streak} label="Серия дней" tone="accent" />
            )}
          </Reveal>

          {/* Разбор ошибок: слова, которые не дались — с переводом */}
          {missed.length > 0 ? (
            <Reveal delay={240} style={styles.mistakesBlock}>
              <View style={styles.mistakesHeader}>
                <Icon name="exclamationmark.triangle.fill" size={16} color={theme.danger} />
                <ThemedText type="smallBold" style={{ color: theme.danger }}>
                  Разбор ошибок
                </ThemedText>
              </View>
              <View style={[styles.mistakesCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {missed.map((card, i) => (
                  <View
                    key={card.id}
                    style={[
                      styles.mistakeRow,
                      i > 0 ? { borderTopWidth: 1, borderTopColor: theme.border } : null,
                    ]}>
                    <Sticker imageUri={card.imageUri} category={card.category} size={40} />
                    <View style={styles.mistakeText}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {card.word}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {card.translation}
                      </ThemedText>
                    </View>
                    <SpeakButton text={card.word} language={card.learningLang} size={36} />
                  </View>
                ))}
              </View>
              <Button title={`Повторить ошибки · ${missed.length}`} icon="arrow.counterclockwise" onPress={onRetryMissed} />
            </Reveal>
          ) : null}

          <Reveal delay={300} style={styles.summaryActions}>
            <Button title="Пройти ещё раз" icon="play.fill" onPress={onRestart} />
            <Button title="К режимам" icon="chevron.left" variant="ghost" onPress={onChangeMode} />
          </Reveal>
        </View>

        {/* Празднование идеальной сессии. */}
        <CelebrationModal
          visible={showCelebration}
          title="Идеальная сессия!"
          subtitle={
            objTotal > 0
              ? `Все ${objTotal} проверок верны — блестяще!`
              : 'Ни одной ошибки — блестяще!'
          }
          icon="trophy.fill"
          tone="gold"
          onClose={() => setShowCelebration(false)}
        />
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
        <BackToModes onPress={onChangeMode} />
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

        {/* Салют за верный ответ (поверх всего, не ловит нажатия). */}
        <Confetti trigger={burst} originTop="26%" count={16} />

        {/* Знакомство / впиши слово / скажи вслух — свои тела. */}
        {q.answerMode === 'intro' ? (
          <IntroBody card={q.card} onNext={onIntroNext} />
        ) : q.answerMode === 'type' ? (
          <TypeBody
            card={q.card}
            typed={typed}
            onChange={setTyped}
            checked={typeChecked}
            onSubmit={onTypeSubmit}
            onNext={onNextQuestion}
            last={qIndex + 1 >= total}
            shakeStyle={promptShakeStyle}
          />
        ) : q.answerMode === 'speak' ? (
          <SpeakBody key={q.id} card={q.card} onRate={onSpeakRate} />
        ) : null}

        {/* Вопрос + варианты — только для выбора (choice). */}
        {q.answerMode === 'choice' ? (
          <>
        <Reveal key={q.id} distance={16} style={styles.testBody}>
          {/* Карточка-вопрос (формат зависит от promptMode) — красный шейк при ошибке */}
          <Animated.View style={[styles.prompt, { backgroundColor: theme.card, borderColor: theme.border }, promptShakeStyle]}>
            <View style={[styles.promptTag, { backgroundColor: theme.primarySoft }]}>
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                {q.label}
              </ThemedText>
            </View>

            {q.promptMode === 'image' ? (
              // Фото/стикер из коллекции → угадать слово/перевод.
              <Sticker imageUri={q.card.imageUri} category={q.card.category} size={140} />
            ) : q.promptMode === 'audio' ? (
              // Чисто аудио (как в Duolingo): слово не показываем, только звук.
              <View style={styles.audioPrompt}>
                <SpeakButton text={q.card.word} language={q.card.learningLang} size={96} />
                <SpeakButton text={q.card.word} language={q.card.learningLang} size={44} slow />
              </View>
            ) : q.promptMode === 'cloze' ? (
              // Пример с пропуском «____» → вставить слово.
              <ThemedText type="subtitle" style={styles.clozeText}>
                {q.prompt}
              </ThemedText>
            ) : (
              // Текст: слово или перевод. Слово — со звуком.
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
          </Animated.View>

          {/* Варианты ответа: текстом или картинками (сетка 2×2) */}
          {q.optionMode === 'image' ? (
            <View style={styles.imageOptions}>
              {q.options.map((opt, i) => (
                <ImageOption
                  key={`${q.id}-${i}`}
                  card={opt.card!}
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
          ) : (
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
          )}
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
          </>
        ) : null}
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
        <BackToModes onPress={onChangeMode} />
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

        {/* Сама карточка с переворотом (новый key → плавное появление).
            После показа её можно оценить свайпом: ← Забыл · ↑ Вспомнил · Легко → */}
        <View style={styles.cardArea}>
          <Reveal key={current.id} distance={16} style={styles.cardWrap}>
            <SwipeToRate
              enabled={revealed}
              left={{ label: 'Забыл', color: theme.danger }}
              up={{ label: 'Вспомнил', color: theme.primary }}
              right={{ label: 'Легко', color: theme.success }}
              onLeft={() => onRate('again')}
              onUp={() => onRate('good')}
              onRight={() => onRate('easy')}>
            <FlashCard
              flipped={revealed}
              onPress={() => setRevealed(true)}
              height={360}
              front={
                <View style={styles.face}>
                  <Sticker imageUri={current.imageUri} category={current.category} size={128} />
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
                  {current.notes ? (
                    <View style={[styles.noteRow, { backgroundColor: theme.goldSoft }]}>
                      <Icon name="lightbulb.fill" size={14} color={theme.gold} />
                      <ThemedText type="small" style={[styles.noteText, { color: theme.gold }]}>
                        {current.notes}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              }
            />
            </SwipeToRate>
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

/** Компактная кнопка «‹ К режимам» — вернуться к выбору режима из активной сессии. */
function BackToModes({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Назад к режимам"
      style={styles.backToModes}>
      <Icon name="chevron.left" size={18} color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary">
        К режимам
      </ThemedText>
    </Pressable>
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
        <Icon name="chevron.right" size={20} color={theme.textSecondary} />
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
 * Вариант-картинка в тесте (формат «выбери картинку»): плашка со стикером/фото
 * предмета. До ответа — нейтральная рамка; после — зелёная (правильная) или
 * красная (выбранная неверная), остальные приглушаются. На выбранной/правильной
 * рисуем значок-вердикт в углу. Лёгкая пружинная отдача при нажатии.
 */
function ImageOption({
  card,
  state,
  disabled,
  onPress,
}: {
  card: WordCard;
  state: OptionState;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const palette: Record<
    OptionState,
    { border: string; icon: SFSymbol | null; iconColor: string; opacity: number }
  > = {
    idle: { border: theme.border, icon: null, iconColor: theme.text, opacity: 1 },
    correct: { border: theme.success, icon: 'checkmark.circle.fill', iconColor: theme.success, opacity: 1 },
    wrong: { border: theme.danger, icon: 'xmark.circle.fill', iconColor: theme.danger, opacity: 1 },
    dim: { border: theme.border, icon: null, iconColor: theme.text, opacity: 0.4 },
  };
  const p = palette[state];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Выбрать картинку"
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => (scale.value = withSpring(Motion.scalePressed, Motion.spring.stiff))}
      onPressOut={() => (scale.value = withSpring(1, Motion.spring.bouncy))}
      style={styles.imageOptionPressable}>
      <Animated.View
        style={[
          styles.imageOption,
          { backgroundColor: theme.card, borderColor: p.border, opacity: p.opacity },
          state !== 'idle' && state !== 'dim' ? { borderWidth: 2 } : null,
          animStyle,
        ]}>
        <Sticker imageUri={card.imageUri} category={card.category} size={120} />
        {p.icon ? (
          <View style={styles.imageOptionBadge}>
            <Icon name={p.icon} size={26} color={p.iconColor} />
          </View>
        ) : null}
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

/** «Знакомство»: показываем новое слово целиком (без теста) → «Далее». */
function IntroBody({ card, onNext }: { card: WordCard; onNext: () => void }) {
  const theme = useTheme();
  return (
    <>
      <Reveal key={card.id} distance={16} style={styles.testBody}>
        <View style={[styles.prompt, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.promptTag, { backgroundColor: theme.accentSoft }]}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Новое слово
            </ThemedText>
          </View>
          <Sticker imageUri={card.imageUri} category={card.category} size={132} />
          <View style={styles.promptWordRow}>
            <ThemedText type="title" numberOfLines={2} adjustsFontSizeToFit style={styles.promptWord}>
              {card.word}
            </ThemedText>
            <SpeakButton text={card.word} language={card.learningLang} />
          </View>
          {card.ipa ? (
            <ThemedText type="small" themeColor="textSecondary">
              /{card.ipa}/
            </ThemedText>
          ) : null}
          <ThemedText type="subtitle" style={styles.centerText}>
            {card.translation}
          </ThemedText>
          {card.examples[0] ? (
            <View style={[styles.example, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="default" style={styles.centerText}>
                {card.examples[0]}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </Reveal>
      <View style={styles.footer}>
        <Button title="Далее" icon="arrow.right" onPress={onNext} />
      </View>
    </>
  );
}

/** «Впиши слово»: ввод L2-слова (регистр/пробелы не важны) + проверка. */
function TypeBody({
  card,
  typed,
  onChange,
  checked,
  onSubmit,
  onNext,
  last,
  shakeStyle,
}: {
  card: WordCard;
  typed: string;
  onChange: (s: string) => void;
  checked: boolean | null;
  onSubmit: () => void;
  onNext: () => void;
  last: boolean;
  shakeStyle: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- animated style
}) {
  const theme = useTheme();
  const answered = checked !== null;
  const correct = checked === true;
  const borderColor = answered ? (correct ? theme.success : theme.danger) : theme.border;
  return (
    <>
      <Reveal distance={16} style={styles.testBody}>
        <Animated.View style={[styles.prompt, { backgroundColor: theme.card, borderColor: theme.border }, shakeStyle]}>
          <View style={[styles.promptTag, { backgroundColor: theme.primarySoft }]}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              Впиши слово
            </ThemedText>
          </View>
          <Sticker imageUri={card.imageUri} category={card.category} size={110} />
          <ThemedText type="subtitle" style={styles.centerText}>
            {card.translation}
          </ThemedText>
          <TextInput
            value={typed}
            onChangeText={onChange}
            editable={!answered}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            placeholder="Впиши слово"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (!answered && typed.trim()) onSubmit();
            }}
            style={[styles.typeInput, { borderColor, color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          {answered ? (
            <View style={styles.typeResultRow}>
              <Icon
                name={correct ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
                size={18}
                color={correct ? theme.success : theme.danger}
              />
              <ThemedText type="smallBold" style={{ color: correct ? theme.success : theme.danger }}>
                {correct ? 'Верно!' : card.word}
              </ThemedText>
              <SpeakButton text={card.word} language={card.learningLang} size={38} />
            </View>
          ) : null}
        </Animated.View>
      </Reveal>
      <View style={styles.footer}>
        {answered ? (
          <Button title={last ? 'Завершить' : 'Дальше'} icon="arrow.right" onPress={onNext} />
        ) : (
          <Button title="Проверить" icon="checkmark" onPress={onSubmit} disabled={!typed.trim()} />
        )}
      </View>
    </>
  );
}

/** «Скажи вслух»: произнести → показать ответ → самооценка (до ASR — на честность). */
function SpeakBody({ card, onRate }: { card: WordCard; onRate: (r: SrsRating) => void }) {
  const theme = useTheme();
  const [shown, setShown] = useState(false);
  return (
    <>
      <Reveal distance={16} style={styles.testBody}>
        <View style={[styles.prompt, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.promptTag, { backgroundColor: theme.primarySoft }]}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              Скажи вслух
            </ThemedText>
          </View>
          <Sticker imageUri={card.imageUri} category={card.category} size={120} />
          <ThemedText type="subtitle" style={styles.centerText}>
            {card.translation}
          </ThemedText>
          {shown ? (
            <View style={styles.promptWordRow}>
              <ThemedText type="title" numberOfLines={2} adjustsFontSizeToFit style={styles.promptWord}>
                {card.word}
              </ThemedText>
              <SpeakButton text={card.word} language={card.learningLang} />
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
              Произнеси слово вслух, потом проверь себя.
            </ThemedText>
          )}
        </View>
      </Reveal>
      <View style={styles.footer}>
        {!shown ? (
          <Button
            title="Показать ответ"
            icon="eye.fill"
            onPress={() => {
              setShown(true);
              speakWord(card.word, card.learningLang);
            }}
          />
        ) : (
          <View style={styles.ratingRow}>
            <RatingButton icon="arrow.counterclockwise" label="Забыл" sub="" bg={theme.dangerSoft} fg={theme.danger} onPress={() => onRate('again')} />
            <RatingButton icon="checkmark" label="Норм" sub="" bg={theme.primarySoft} fg={theme.primary} onPress={() => onRate('good')} />
            <RatingButton icon="star.fill" label="Легко" sub="" bg={theme.successSoft} fg={theme.success} onPress={() => onRate('easy')} />
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  centerText: { textAlign: 'center' },

  // Интро (выбор режима)
  intro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  modeList: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.two },
  backToModes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
    marginBottom: Spacing.one,
  },
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
  summary: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  summaryStats: { flexDirection: 'row', gap: Spacing.two, alignSelf: 'stretch', marginTop: Spacing.two },
  summaryActions: { gap: Spacing.two, alignSelf: 'stretch', marginTop: Spacing.two },
  summaryNavRow: { flexDirection: 'row', gap: Spacing.two },
  summaryNavItem: { flex: 1 },

  // Разбор ошибок
  mistakesBlock: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.one },
  mistakesHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  mistakesCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  mistakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  mistakeText: { flex: 1, gap: Spacing.half },

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
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    alignSelf: 'stretch',
  },
  noteText: { flex: 1 },

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
  audioPrompt: { alignItems: 'center', gap: Spacing.two },
  clozeText: { textAlign: 'center', lineHeight: 34 },
  options: { gap: Spacing.two },
  imageOptions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.two },
  imageOptionPressable: { width: '48%' },
  imageOption: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  imageOptionBadge: { position: 'absolute', top: Spacing.two, right: Spacing.two },
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
  // «Впиши слово»
  typeInput: {
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: Radius.md,
    borderWidth: 2,
    paddingHorizontal: Spacing.three,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  typeResultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },

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
