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
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'expo-symbols';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { CelebrationModal } from '@/components/anim/celebration-modal';
import { Confetti } from '@/components/anim/confetti';
import { SwipeToRate } from '@/components/anim/swipe-to-rate';
import { ContributionGrid } from '@/components/contribution-grid';
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
import { useAuth } from '@/lib/auth-context';
import { useCollection } from '@/lib/collection-context';
import { getPref, setPref } from '@/lib/db';
import { feedbackCorrect, feedbackTap, feedbackWrong } from '@/lib/feedback';
import { getLang, useT } from '@/lib/i18n';
import { gradeAnswer, type GradeVerdict } from '@/lib/grade';
import { hasVoiceForLang, speakWord } from '@/lib/speech';
import {
  buildQuiz,
  buildSpeakPhotoQuiz,
  buildWorkoutQuiz,
  checkDictationSentence,
  dictationLabel,
  dictationSentence,
  type DictationResult,
  type QuizKind,
  type QuizQuestion,
} from '@/lib/quiz';
import { buildSessionQueue, computeNextReview, hasReviewWork } from '@/lib/srs';
import { fetchCoachDigest, todayIndex, type CoachDigest } from '@/lib/daily-quest';
import { flushReviewEvents, logReviewEvent } from '@/lib/telemetry';
import { fetchNeighbors } from '@/lib/semantic';
import type { SrsRating, WordCard } from '@/types';

/** Сколько карточек максимум в одной сессии повтора. */
const MAX_SESSION = 20;
/** Сколько недель показываем в карте активности (совпадает с подписью «N недель»). */
const REVIEW_WEEKS = 18;
/** Цвета иконок-плиток режимов (как в дизайне): оранж / синий / бирюза / фиолет
 *  + индиго «Диктант», роза «Напиши сам», зелёный «Расскажи о фото» —
 *  задания тренера (Э2/Э4, спека B.3). */
const MODE_TILE = {
  flash: '#FF9500',
  listen: '#0A84FF',
  sentence: '#2FB8A8',
  smart: '#AF52DE',
  dictation: '#5856D6',
  write: '#FF2D55',
  speakPhoto: '#34C759',
};
/** Этапы сессии. */
type Phase = 'intro' | 'flashcards' | 'test' | 'summary';
/**
 * Прогресс «Тренировки от тренера» в key_value (Э3, спека B.1): день фиксируем
 * todayIndex(), nextIdx — сколько вопросов уже отвечено (для «Продолжить»),
 * done — тренировка дня пройдена целиком.
 */
const PREF_WORKOUT = 'agent_workout';
interface WorkoutPref {
  day: number;
  nextIdx: number;
  done: boolean;
}
/** Режим тренировки, выбранный на интро-экране. */
type Mode = 'flashcards' | 'smart' | 'listen' | 'sentence' | 'dictation' | 'write' | 'speakPhoto';

/** Фиксированный формат вопроса для режима (undefined = адаптивный «Умный тест»). */
function forceKindFor(m: Mode): QuizKind | undefined {
  if (m === 'listen') return 'audioToWord';
  if (m === 'sentence') return 'clozeExample';
  if (m === 'dictation') return 'dictation';
  if (m === 'write') return 'writeSentence';
  return undefined;
}

/**
 * Решение «STT недоступен» запоминается навсегда (Э4): на iOS WebKit API
 * СУЩЕСТВУЕТ, но без Siri&Dictation молча даёт 'service-not-allowed'/ноль
 * результатов — деградируем ПО ОШИБКЕ, не по наличию API. Сбрасывать не нужно.
 */
const PREF_STT_UNAVAILABLE = 'stt_unavailable';
/** Закрытый крестиком дайджест недели: храним weekStart, чтобы не показать снова. */
const PREF_DIGEST_DISMISSED = 'digest_dismissed';
/** Таймаут «мёртвого» распознавания (Э4): 8 с без единого сигнала → текст. */
const STT_DEAD_MS = 8_000;

/**
 * Конструктор Web Speech API. ТОЛЬКО веб (натив/SSR → undefined: там сразу
 * текстовый ввод). Наличие конструктора ≠ работоспособность — см. Э4.
 */
// any: нестандартизованный браузерный API (webkit-префикс), типов в проекте нет.
function getSpeechRecognitionCtor(): (new () => any) | undefined {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  const w = window as any;
  return w.webkitSpeechRecognition || w.SpeechRecognition || undefined;
}

/** Понедельник ПРОШЛОЙ недели (UTC, YYYY-MM-DD) — нижняя граница «свежего» дайджеста. */
function lastWeekMondayIso(): string {
  const now = new Date();
  const sinceMonday = (now.getUTCDay() + 6) % 7; // дней с понедельника этой недели
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - sinceMonday - 7),
  );
  return monday.toISOString().slice(0, 10);
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

/** Склонение слова «режим» по числу (1 режим / 2 режима / 5 режимов). */
function pluralModes(n: number): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'режимов';
  if (b === 1) return 'режим';
  if (b > 1 && b < 5) return 'режима';
  return 'режимов';
}

/** Склонение слова «упражнение» по числу (1 упражнение / 2 упражнения / 5 упражнений). */
function pluralExercises(n: number): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'упражнений';
  if (b === 1) return 'упражнение';
  if (b > 1 && b < 5) return 'упражнения';
  return 'упражнений';
}

/** Склонение слова «день» по числу (1 день / 2 дня / 5 дней). */
function pluralDays(n: number): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'дней';
  if (b === 1) return 'день';
  if (b > 1 && b < 5) return 'дня';
  return 'дней';
}

/** Человеко-понятный интервал «когда увидишь снова» (минуты → «10 мин» / «1 ч» / «4 д»). */
function formatInterval(minutes: number): string {
  const en = getLang() === 'en';
  if (minutes < 60) return `${Math.round(minutes)} ${en ? 'min' : 'мин'}`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} ${en ? 'h' : 'ч'}`;
  return `${Math.round(hours / 24)} ${en ? 'd' : 'д'}`;
}

export function ReviewSessionScreen() {
  const theme = useTheme();
  const t = useT();
  const router = useRouter();
  const { session } = useAuth();
  const {
    loading,
    cards,
    reviewCard,
    stats,
    prefs,
    useTestAttempt,
    testsLeftToday,
    isPremium,
    activityByDay,
    reviewStreak,
    recordTestSession,
    agentExercises,
    coachMessage,
  } = useCollection();

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

  // --- Открытые ответы (движок v2, Э2): «Диктант» и «Напиши сам» ---
  // Диктант: локальный вердикт + фидбек тренера (подтягивается только на ошибке).
  const [dictResult, setDictResult] = useState<DictationResult | null>(null);
  const [dictNote, setDictNote] = useState<{ corrected: string; feedback: string } | null>(null);
  const [dictGradeFailed, setDictGradeFailed] = useState(false);
  // «Напиши сам»: input → grading («Тренер читает…») → done (фидбек или фолбэк).
  const [writePhase, setWritePhase] = useState<'input' | 'grading' | 'done'>('input');
  const [writeVerdict, setWriteVerdict] = useState<GradeVerdict | null>(null);
  const [writeNote, setWriteNote] = useState<{ corrected: string; feedback: string } | null>(null);
  const [writeFallback, setWriteFallback] = useState<'auth' | 'limit' | 'unavailable' | null>(null);
  // Кап проверок тренера исчерпан посреди сессии → ОДИН апселл на итоге (B.2).
  const [limitHit, setLimitHit] = useState(false);
  // Ответы, оставшиеся без оценки (фолбэки) — не считаем в точность итога.
  const [ungraded, setUngraded] = useState(0);
  // corrected/feedback тренера по карточкам — для разбора ошибок на итоге (B.6).
  const [coachNotes, setCoachNotes] = useState<Map<string, { corrected: string; feedback: string }>>(
    () => new Map(),
  );
  // Токен «актуальности» асинхронной оценки: перешли к следующему вопросу или
  // сменили сессию — поздний ответ тренера не должен перерисовать чужой вопрос.
  const gradeTokenRef = useRef(0);
  // Есть ли TTS-голос изучаемого языка (гейт плитки «Диктант», B.3).
  const [voiceOk, setVoiceOk] = useState(true);

  // --- «Расскажи о фото» (движок v2, Э4, спека B.5) ---
  // Карточки с НАСТОЯЩИМ фото — гейт видимости плитки (B.3): 0 → empty-плитка в камеру.
  const photoCards = useMemo(() => cards.filter((c) => !!c.imageUri), [cards]);
  // STT недоступен: решение запомнено после первой ошибки распознавания (Э4).
  const [sttUnavailable, setSttUnavailable] = useState(false);
  useEffect(() => {
    let alive = true;
    getPref(PREF_STT_UNAVAILABLE)
      .then((v) => {
        if (alive && v === '1') setSttUnavailable(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const markSttUnavailable = useCallback(() => {
    setSttUnavailable(true);
    void setPref(PREF_STT_UNAVAILABLE, '1');
  }, []);

  // --- Дайджест недели от тренера (Э6-клиент) ---
  // Карточка «Итоги недели» на интро: пн–вт, если есть сводка за прошлую
  // неделю и её ещё не закрыли крестиком. Любая ошибка → карточки просто нет.
  const [digest, setDigest] = useState<CoachDigest | null>(null);
  useEffect(() => {
    const dow = new Date().getDay(); // 1 — понедельник, 2 — вторник
    if (dow !== 1 && dow !== 2) return;
    const uid = session?.user?.id;
    if (!uid) return;
    let alive = true;
    Promise.all([fetchCoachDigest(uid), getPref(PREF_DIGEST_DISMISSED)])
      .then(([d, dismissed]) => {
        if (!alive || !d) return;
        if (d.weekStart < lastWeekMondayIso()) return; // сводка старее прошлой недели
        if (dismissed === d.weekStart) return; // уже закрывали
        setDigest(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [session?.user?.id]);
  const dismissDigest = useCallback(() => {
    feedbackTap();
    if (digest) void setPref(PREF_DIGEST_DISMISSED, digest.weekStart);
    setDigest(null);
  }, [digest]);

  // --- «Тренировка от тренера» (движок v2, Э3, спека B.1) ---
  // Идёт ли сейчас именно тренировка (а не обычный тест): телеметрия source
  // 'workout', свой заголовок итога и персист прогресса.
  const [isWorkout, setIsWorkout] = useState(false);
  // Сохранённый прогресс тренировки дня; null — ещё читаем из key_value
  // (пока null и тренировка есть — держим общий лоадер, чтобы hero не «скакал»).
  const [workoutPref, setWorkoutPref] = useState<WorkoutPref | null>(null);
  // Смещение «Продолжить»: сколько вопросов срезано с начала при возобновлении.
  const workoutOffsetRef = useRef(0);
  useEffect(() => {
    let alive = true;
    getPref(PREF_WORKOUT)
      .then((raw) => {
        if (!alive) return;
        if (raw) {
          try {
            const p = JSON.parse(raw) as Partial<WorkoutPref> | null;
            if (
              p &&
              typeof p.day === 'number' &&
              typeof p.nextIdx === 'number' &&
              typeof p.done === 'boolean'
            ) {
              setWorkoutPref({ day: p.day, nextIdx: p.nextIdx, done: p.done });
              return;
            }
          } catch {
            /* битый json — начинаем с чистого */
          }
        }
        setWorkoutPref({ day: -1, nextIdx: 0, done: false });
      })
      .catch(() => {
        if (alive) setWorkoutPref({ day: -1, nextIdx: 0, done: false });
      });
    return () => {
      alive = false;
    };
  }, []);
  const saveWorkoutPref = useCallback((p: WorkoutPref) => {
    setWorkoutPref(p);
    void setPref(PREF_WORKOUT, JSON.stringify(p));
  }, []);
  // Сколько вопросов реально соберётся из упражнений агента (невалидные молча
  // отброшены — считаем по фактическим вопросам, buildWorkoutQuiz детерминирован).
  const workoutTotal = useMemo(
    () => (agentExercises.length > 0 ? buildWorkoutQuiz(agentExercises, cards).length : 0),
    [agentExercises, cards],
  );

  // Слова, которые не дались в этой сессии (тест — неверный ответ, карточки —
  // оценка «Забыл»). Используем для блока «Разбор ошибок» и кнопки «Повторить
  // ошибки» на экране итога. Дедуплицируем по id.
  const [missed, setMissed] = useState<WordCard[]>([]);
  const addMissed = useCallback((card: WordCard) => {
    // Синтетические карточки тренировки имеют id='' — дедуплицируем по слову.
    const keyOf = (c: WordCard) => c.id || c.word.toLowerCase();
    setMissed((prev) => (prev.some((c) => keyOf(c) === keyOf(card)) ? prev : [...prev, card]));
  }, []);

  // Салют при верном ответе, шейк промпта при неверном, празднование идеальной сессии.
  const [burst, setBurst] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  // Free исчерпал дневной лимит тестов → мягкий апселл-лист (не резкий редирект).
  const [limitSheet, setLimitSheet] = useState(false);
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
    setIsWorkout(false);
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
    // Немного новых слов + старые, которым пора (по забыванию), вперемешку.
    setQueue(buildSessionQueue(cards, MAX_SESSION));
    setPractice(!hasReviewWork(cards));
  }, [loading, queue, cards, phase]);

  const current = queue && index < queue.length ? queue[index] : undefined;

  // Free — 1 умный тест в день. Исчерпан → показываем апселл, а не режем доступ молча.
  const testsExhausted = !isPremium && testsLeftToday <= 0;

  // Duolingo-style: как только перевернули карточку — автоматически озвучиваем слово.
  useEffect(() => {
    if (phase === 'flashcards' && revealed && current) {
      speakWord(current.word, current.learningLang);
    }
  }, [phase, revealed, current]);

  // Аудио-вопрос в тесте: проигрываем сразу при появлении вопроса. «Диктант»
  // озвучивает ЦЕЛОЕ предложение с ключевым словом (B.4), остальные — слово.
  useEffect(() => {
    if (phase !== 'test' || !quiz) return;
    const q = quiz[qIndex];
    if (!q || q.promptMode !== 'audio') return;
    speakWord(q.kind === 'dictation' ? dictationSentence(q.card) : q.card.word, q.card.learningLang);
  }, [phase, qIndex, quiz]);

  // TTS-детект для «Диктанта» (B.3): один раз на интро; сменили курс — заново.
  useEffect(() => {
    let alive = true;
    hasVoiceForLang(prefs.learningLang).then((ok) => {
      if (alive) setVoiceOk(ok);
    });
    return () => {
      alive = false;
    };
  }, [prefs.learningLang]);

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
  // --- Умные дистракторы (Э5): семантические соседи карточек очереди ---
  // Тянем в фоне при готовности очереди; не успели/ошибка → квиз соберётся на
  // старых правилах (категория/пул) — разницы в UX нет, только в качестве.
  const neighborsRef = useRef<Map<string, string[]> | undefined>(undefined);
  useEffect(() => {
    if (!queue || queue.length === 0) return;
    let alive = true;
    fetchNeighbors(queue).then((map) => {
      if (alive && map.size) neighborsRef.current = map;
    });
    return () => {
      alive = false;
    };
  }, [queue]);

  const buildFreshQueue = useCallback((): WordCard[] => {
    if (cards.length === 0) return [];
    setPractice(!hasReviewWork(cards));
    return buildSessionQueue(cards, MAX_SESSION);
  }, [cards]);

  // --- Телеметрия ответов (движок v2, Э1) ---
  // day_index фиксируется на СТАРТЕ сессии (сессия через UTC-полночь не смешивает
  // дни); response_ms — от показа вопроса до ответа.
  const sessionDayRef = useRef(todayIndex());
  const qShownAtRef = useRef(Date.now());
  const logAnswer = useCallback(
    (
      card: WordCard,
      kind: string,
      data: {
        correct?: boolean | null;
        rating?: string | null;
        answer?: string | null;
        /** Оценка ИИ-тренера 0..1 (открытые ответы, Э2); null — без оценки. */
        score?: number | null;
      },
    ) => {
      logReviewEvent({
        // Синтетическая карточка тренировки (id='') → card_id=null (Э3, B.6).
        cardId: card.id || null,
        word: card.word,
        dayIndex: sessionDayRef.current,
        learningLang: card.learningLang,
        nativeLang: card.nativeLang,
        source: isWorkout ? 'workout' : mode === 'flashcards' ? 'flashcards' : 'quiz',
        kind,
        responseMs: Date.now() - qShownAtRef.current,
        ...data,
      });
      qShownAtRef.current = Date.now();
      // Тренировка: двигаем сохранённый прогресс после каждого ответа — при
      // брошенной сессии «Продолжить» стартует ровно с этого места (Э3, п.4).
      if (isWorkout) {
        const next = workoutOffsetRef.current + qIndex + 1;
        saveWorkoutPref({ day: sessionDayRef.current, nextIdx: next, done: next >= workoutTotal });
      }
    },
    [mode, isWorkout, qIndex, workoutTotal, saveWorkoutPref],
  );

  // Сброс пер-вопросного состояния открытых ответов (диктант / «Напиши сам»).
  const resetOpenAnswer = useCallback(() => {
    setDictResult(null);
    setDictNote(null);
    setDictGradeFailed(false);
    setWritePhase('input');
    setWriteVerdict(null);
    setWriteNote(null);
    setWriteFallback(null);
  }, []);

  // Запустить сессию заданного режима по заданной очереди. Сбрасывает всё
  // прогресс-состояние, поэтому годится и для старта, и для «пройти заново».
  const startWith = useCallback(
    (m: Mode, q: WordCard[]) => {
      if (q.length === 0) return;
      sessionDayRef.current = todayIndex();
      qShownAtRef.current = Date.now();
      // Умный тест (любой режим кроме карточек) — free 1 попытка/день. Исчерпал —
      // мягкий лист с апселлом (без резкого прыжка на пейволл) и путём к карточкам.
      if (m !== 'flashcards' && !useTestAttempt()) {
        feedbackTap();
        setLimitSheet(true);
        return;
      }
      // Тест начат — фиксируем в журнале активности (для хитмапа/стрика).
      if (m !== 'flashcards') recordTestSession();
      setIsWorkout(false);
      setQueue(q);
      setMode(m);
      setMissed([]);
      // Хвосты открытых ответов прошлой сессии (Э2): фидбек, кап, «без оценки».
      gradeTokenRef.current += 1;
      setCoachNotes(new Map());
      setLimitHit(false);
      setUngraded(0);
      setTyped('');
      setTypeChecked(null);
      resetOpenAnswer();
      if (m === 'flashcards') {
        setIndex(0);
        setRevealed(false);
        setReviewedCount(0);
        setPhase('flashcards');
      } else {
        // Умный тест — 10 вопросов из ВСЕЙ коллекции, форматы вперемешку и без
        // «знакомства» (все 10 — настоящие вопросы). «На слух» / «Слово в
        // предложение» идут по очереди с фиксированным форматом. «Расскажи о
        // фото» — своя сборка: до 5 карточек с фото, просроченные сверху (Э4).
        setQuiz(
          m === 'smart'
            ? buildQuiz(cards, 10, cards, undefined, true, neighborsRef.current)
            : m === 'speakPhoto'
              ? buildSpeakPhotoQuiz(q)
              : buildQuiz(q, q.length, cards, forceKindFor(m), false, neighborsRef.current),
        );
        setQIndex(0);
        setSelected(null);
        setAnswered(false);
        setScore(0);
        setPhase('test');
      }
    },
    [cards, useTestAttempt, recordTestSession, resetOpenAnswer],
  );

  // --- Запуск «Тренировки от тренера» (Э3, B.1) ---
  // Тренировка — ежедневный подарок тренера: попытку умного теста НЕ тратит
  // (useTestAttempt не зовём, гейт обычных плиток не трогаем), но в журнал
  // активности идёт как обычный тест (хитмап/стрик). skip>0 — «Продолжить»:
  // срезаем уже отвеченные вопросы (buildWorkoutQuiz детерминирован по
  // exercises, перемешивание вариантов cloze — допустимо).
  const startWorkout = useCallback(
    (skip = 0) => {
      const questions = buildWorkoutQuiz(agentExercises, cards).slice(skip);
      if (questions.length === 0) return;
      feedbackTap();
      sessionDayRef.current = todayIndex();
      qShownAtRef.current = Date.now();
      workoutOffsetRef.current = skip;
      recordTestSession();
      setIsWorkout(true);
      setMode('smart'); // итог/празднование считаются как у теста
      setMissed([]);
      // Хвосты открытых ответов прошлой сессии (Э2): фидбек, кап, «без оценки».
      gradeTokenRef.current += 1;
      setCoachNotes(new Map());
      setLimitHit(false);
      setUngraded(0);
      setTyped('');
      setTypeChecked(null);
      resetOpenAnswer();
      setQuiz(questions);
      setQIndex(0);
      setSelected(null);
      setAnswered(false);
      setScore(0);
      setPhase('test');
    },
    [agentExercises, cards, recordTestSession, resetOpenAnswer],
  );

  // --- Пройти ещё раз тем же режимом (свежая очередь) ---
  const onRestart = useCallback(() => {
    feedbackTap();
    startWith(mode, buildFreshQueue());
  }, [mode, startWith, buildFreshQueue]);

  // --- Вернуться к выбору режима (свежая очередь) ---
  const onChangeMode = useCallback(() => {
    feedbackTap();
    gradeTokenRef.current += 1; // поздние ответы тренера уже не актуальны
    setQueue(buildFreshQueue());
    setMissed([]);
    setPhase('intro');
  }, [buildFreshQueue]);

  // --- Повторить только ошибки тестом ---
  // Синтетические карточки тренировки (id='') в повтор не берём: их нет в
  // коллекции, SRS по ним не двигается, а тест без перевода не собрать.
  const retryableMissed = useMemo(() => missed.filter((c) => c.id), [missed]);
  const onRetryMissed = useCallback(() => {
    if (retryableMissed.length === 0) return;
    feedbackTap();
    startWith('smart', retryableMissed);
  }, [retryableMissed, startWith]);

  // Действия апселл-листа: на пейволл или к бесплатным карточкам (не запираем наглухо).
  const onLimitPremium = useCallback(() => {
    setLimitSheet(false);
    router.push('/paywall');
  }, [router]);
  const onLimitFlashcards = useCallback(() => {
    setLimitSheet(false);
    startWith('flashcards', buildFreshQueue());
  }, [startWith, buildFreshQueue]);

  // --- Оценка карточки (режим флеш-карточек) ---
  const onRate = useCallback(
    async (rating: SrsRating) => {
      if (lock.current || !queue) return;
      const card = queue[index];
      if (!card) return;
      lock.current = true;
      feedbackTap();
      if (rating === 'again') addMissed(card);
      logAnswer(card, 'srs_rating', { rating });
      await reviewCard(card.id, rating);
      setReviewedCount((c) => c + 1);
      setRevealed(false);
      const next = index + 1;
      setIndex(next);
      if (next >= queue.length) setPhase('summary');
      lock.current = false;
    },
    [queue, index, reviewCard, addMissed, logAnswer],
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
      logAnswer(q.card, q.kind, { correct: opt.correct, answer: opt.text });
      // Верно → «вспомнил» (good), неверно → «забыл» (again): двигаем SRS.
      await reviewCard(q.card.id, opt.correct ? 'good' : 'again');
    },
    [answered, quiz, qIndex, reviewCard, addMissed, promptShake, logAnswer],
  );

  // --- Переход к следующему вопросу теста / к итогу ---
  const onNextQuestion = useCallback(() => {
    if (!quiz) return;
    qShownAtRef.current = Date.now();
    gradeTokenRef.current += 1; // фидбек к прошлому вопросу больше не рисуем
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
    resetOpenAnswer();
  }, [quiz, qIndex, resetOpenAnswer]);

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
    logAnswer(q.card, q.kind, { correct, answer: typed });
    await reviewCard(q.card.id, correct ? 'good' : 'again');
  }, [typeChecked, typed, quiz, qIndex, reviewCard, addMissed, promptShake, logAnswer]);

  // --- «Диктант»: локальная проверка слова; фидбек тренера — только на ошибке ---
  const onDictationSubmit = useCallback(async () => {
    if (dictResult !== null || !quiz) return;
    const q = quiz[qIndex];
    if (!q || !typed.trim()) return;
    // Диктант целым предложением (решение основателя 12.07): пунктуация не
    // важна; «слово верно, предложение нет» — янтарное «почти», БЕЗ вызова
    // тренера (LLM зовём только на wrong — экономим на каждом ответе).
    const verdict = checkDictationSentence(typed, dictationSentence(q.card), q.card.word);
    setDictResult(verdict);
    logAnswer(q.card, q.kind, {
      correct: verdict === 'correct',
      answer: typed,
      score:
        verdict === 'correct' ? 1 : verdict === 'partial' ? 0.8 : verdict === 'partial-word' ? 0.6 : 0,
    });
    if (verdict === 'correct') {
      setScore((s) => s + 1);
      feedbackCorrect();
      setBurst((b) => b + 1);
      await reviewCard(q.card.id, 'good');
      return;
    }
    if (verdict === 'partial' || verdict === 'partial-word') {
      // «Почти!»: диакритика или предложение с огрехами при верном слове —
      // интервал двигаем, освоение держим; не missed, идеал не ломает (B.2).
      feedbackTap();
      await reviewCard(q.card.id, 'good', { holdMastery: true });
      return;
    }
    // wrong: диктант — тоже открытый ответ, без красного шейка и feedbackWrong.
    // Фидбек добираем у тренера, НЕ блокируя переход к следующему вопросу.
    feedbackTap();
    addMissed(q.card);
    const token = gradeTokenRef.current;
    // Ключ разбора ошибок: у синтетических карточек тренировки id='' — берём слово.
    const cardId = q.card.id || q.card.word;
    gradeAnswer({
      task: 'dictation',
      word: q.card.word,
      expected: dictationSentence(q.card),
      userAnswer: typed,
      learningLang: q.card.learningLang,
      nativeLang: q.card.nativeLang,
    }).then((res) => {
      if (res.ok) {
        // corrected пригодится и в разборе ошибок на итоге (B.6, п.4).
        setCoachNotes((prev) =>
          new Map(prev).set(cardId, { corrected: res.corrected, feedback: res.feedback }),
        );
        if (gradeTokenRef.current === token) {
          setDictNote({ corrected: res.corrected, feedback: res.feedback });
        }
      } else if (gradeTokenRef.current === token) {
        setDictGradeFailed(true);
      }
    });
    await reviewCard(q.card.id, 'again');
  }, [dictResult, typed, quiz, qIndex, reviewCard, addMissed, logAnswer]);

  // --- «Напиши сам» / «Расскажи о фото»: свободный ответ → оценка ИИ-тренера
  // (Э2/Э4, B.2). Механика одна: вердикты, звуки, SRS-маппинг по score, фолбэки.
  const onWriteSubmit = useCallback(async () => {
    if (writePhase !== 'input' || !quiz) return;
    const q = quiz[qIndex];
    if (!q || !typed.trim()) return;
    const token = gradeTokenRef.current;
    setWritePhase('grading');
    const res = await gradeAnswer({
      task: q.kind === 'describePhoto' ? 'describe_photo' : 'write_sentence',
      word: q.card.word,
      userAnswer: typed,
      learningLang: q.card.learningLang,
      nativeLang: q.card.nativeLang,
    });
    if (gradeTokenRef.current !== token) return; // вопрос/сессию уже сменили
    setWritePhase('done');
    if (res.ok) {
      setWriteVerdict(res.verdict);
      setWriteNote({ corrected: res.corrected, feedback: res.feedback });
      logAnswer(q.card, q.kind, { correct: res.verdict === 'correct', answer: typed, score: res.score });
      if (res.verdict === 'correct') {
        setScore((s) => s + 1);
        feedbackCorrect();
        setBurst((b) => b + 1);
      } else {
        // Оценка собственного творчества ≠ промах в угадайке: без feedbackWrong
        // и красного шейка (эмоциональные правила B.2).
        feedbackTap();
        if (res.corrected || res.feedback) {
          setCoachNotes((prev) =>
            new Map(prev).set(q.card.id || q.card.word, {
              corrected: res.corrected,
              feedback: res.feedback,
            }),
          );
        }
      }
      // score → SRS (спека Э2): 0.95+ легко · 0.8+ вспомнил · 0.5+ вспомнил без
      // роста освоения · ниже — «забыл» + разбор ошибок.
      if (res.score >= 0.95) await reviewCard(q.card.id, 'easy');
      else if (res.score >= 0.8) await reviewCard(q.card.id, 'good');
      else if (res.score >= 0.5) await reviewCard(q.card.id, 'good', { holdMastery: true });
      else {
        addMissed(q.card);
        await reviewCard(q.card.id, 'again');
      }
      return;
    }
    // Фолбэки (B.2): пользователь никогда не застревает и не наказывается.
    feedbackTap();
    setWriteFallback(res.reason);
    setUngraded((u) => u + 1); // без оценки — не считаем в точность итога
    logAnswer(q.card, q.kind, { answer: typed, score: null });
    if (res.reason === 'limit') {
      // Кап проверок посреди сессии: молча принимаем, апселл — раз на итоге.
      setLimitHit(true);
      await reviewCard(q.card.id, 'good', { holdMastery: true });
    }
    // auth/unavailable: оценки не было — SRS не двигаем.
  }, [writePhase, typed, quiz, qIndex, reviewCard, addMissed, logAnswer]);

  // --- «Скажи вслух»: самооценка (нет объективной проверки до ASR) ---
  const onSpeakRate = useCallback(
    async (rating: SrsRating) => {
      if (!quiz) return;
      const q = quiz[qIndex];
      if (q) {
        if (rating === 'again') addMissed(q.card);
        logAnswer(q.card, 'speakWord', { rating });
        await reviewCard(q.card.id, rating);
      }
      onNextQuestion();
    },
    [quiz, qIndex, reviewCard, addMissed, onNextQuestion, logAnswer],
  );

  // Конец сессии — досылаем хвост телеметрии, не дожидаясь таймера.
  // Для тренировки итог = done: hero переходит в «Тренировка выполнена».
  useEffect(() => {
    if (phase !== 'summary') return;
    flushReviewEvents();
    if (isWorkout) {
      saveWorkoutPref({ day: sessionDayRef.current, nextIdx: workoutTotal, done: true });
    }
  }, [phase, isWorkout, workoutTotal, saveWorkoutPref]);

  // --- Состояние: ждём загрузку коллекции ---
  // Прогресс тренировки (key_value) ещё не прочитан → тоже держим лоадер:
  // иначе hero мигнёт «ready» и перескочит в «done»/«Продолжить» (B.1, pending).
  if (loading || queue === null || (agentExercises.length > 0 && workoutPref === null)) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
          <ThemedText type="default" themeColor="textSecondary">
            {t('Готовим повторение…')}
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
          title={t('Пока нечего повторять')}
          message={t('Поймай несколько слов камерой — и они появятся здесь на повторение.')}
          actionLabel={t('Открыть камеру')}
          onAction={() => router.replace('/(tabs)')}
        />
      </Screen>
    );
  }

  // ===================== ИНТРО: выбор режима =====================
  if (phase === 'intro') {
    const n = queue.length;
    // Состояние hero-тренировки (B.1): ready / in-progress / done. Прогресс из
    // key_value валиден только для сегодняшнего дня (todayIndex).
    const todayIdx = todayIndex();
    const wp = workoutPref;
    const workoutState: 'ready' | 'in-progress' | 'done' =
      wp && wp.day === todayIdx && (wp.done || wp.nextIdx >= workoutTotal)
        ? 'done'
        : wp && wp.day === todayIdx && wp.nextIdx > 0
          ? 'in-progress'
          : 'ready';
    return (
      <Screen scroll>
        <View style={styles.intro}>
          {/* Заголовок экрана — слева */}
          <Reveal delay={40}>
            <ThemedText type="title" style={styles.introTitle}>
              {t('Повторение')}
            </ThemedText>
          </Reveal>
          <Reveal delay={70}>
            <ThemedText type="default" themeColor="textSecondary">
              {t('Ежедневная практика помогает лучше запоминать слова')}
            </ThemedText>
          </Reveal>

          {/* Hero-подмена (Э3, B.1.1): тренировка от тренера на сегодня есть →
              hero ПОДМЕНЯЕТСЯ тренировкой. Никакого отдельного баннера-соседа:
              точка входа одна. Пусто → обычный hero, как раньше. */}
          {workoutTotal > 0 ? (
            <Reveal delay={100}>
              <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.heroPills}>
                  {workoutState === 'done' ? (
                    <View style={[styles.pill, { backgroundColor: theme.successSoft }]}>
                      <Icon name="checkmark.circle.fill" size={14} color={theme.success} />
                      <ThemedText type="small" style={[styles.pillText, { color: theme.success }]}>
                        {t('Тренировка от тренера')}
                      </ThemedText>
                    </View>
                  ) : (
                    <View style={[styles.pill, { backgroundColor: theme.primarySoft }]}>
                      <Icon name="sparkles" size={13} color={theme.primary} />
                      <ThemedText type="small" style={[styles.pillText, { color: theme.primary }]}>
                        {t('Тренировка от тренера')}
                      </ThemedText>
                    </View>
                  )}
                  <View style={[styles.pill, { backgroundColor: theme.goldSoft }]}>
                    <Icon name="flame.fill" size={13} color={theme.gold} />
                    <ThemedText type="small" style={[styles.pillText, { color: theme.gold }]}>
                      {getLang() === 'en'
                        ? `${reviewStreak} ${reviewStreak === 1 ? 'day' : 'days'}`
                        : `${reviewStreak} ${pluralDays(reviewStreak)}`}
                    </ThemedText>
                  </View>
                </View>
                {workoutState === 'done' ? (
                  // done: галочка + для Premium повтор; free — плитки ниже, как раньше.
                  <>
                    <ThemedText type="subtitle" style={styles.heroTitle}>
                      {t('Тренировка выполнена')}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('Новая тренировка будет завтра')}
                    </ThemedText>
                    {isPremium ? (
                      <Button
                        title={t('Пройти ещё раз')}
                        icon="arrow.counterclockwise"
                        onPress={() => startWorkout(0)}
                      />
                    ) : null}
                  </>
                ) : (
                  <>
                    {/* «Почему эти слова» от тренера — 2 строки, НЕ режем в одну (B.1). */}
                    <ThemedText type="subtitle" style={styles.heroTitle} numberOfLines={2}>
                      {coachMessage ?? t('Тренер собрал упражнения по твоим ответам')}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {getLang() === 'en'
                        ? `${workoutTotal} ${workoutTotal === 1 ? 'exercise' : 'exercises'}`
                        : `${workoutTotal} ${pluralExercises(workoutTotal)}`}
                    </ThemedText>
                    <Button
                      title={
                        workoutState === 'in-progress'
                          ? `${t('Продолжить')} (${Math.min(wp?.nextIdx ?? 0, workoutTotal)}/${workoutTotal})`
                          : t('Начать тренировку')
                      }
                      icon={workoutState === 'in-progress' ? 'play.fill' : 'bolt.fill'}
                      onPress={() =>
                        startWorkout(workoutState === 'in-progress' ? (wp?.nextIdx ?? 0) : 0)
                      }
                    />
                  </>
                )}
              </View>
            </Reveal>
          ) : (
          <Reveal delay={100}>
            <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.heroPills}>
                {practice ? (
                  <View style={[styles.pill, { backgroundColor: theme.successSoft }]}>
                    <Icon name="checkmark.circle.fill" size={14} color={theme.success} />
                    <ThemedText type="small" style={[styles.pillText, { color: theme.success }]}>
                      {t('Всё выучено')}
                    </ThemedText>
                  </View>
                ) : (
                  <View style={[styles.pill, { backgroundColor: theme.primarySoft }]}>
                    <Icon name="clock.fill" size={13} color={theme.textSecondary} />
                    <ThemedText type="small" style={[styles.pillText, { color: theme.textSecondary }]}>
                      {n} {t('на повторение')}
                    </ThemedText>
                  </View>
                )}
                <View style={[styles.pill, { backgroundColor: theme.goldSoft }]}>
                  <Icon name="flame.fill" size={13} color={theme.gold} />
                  <ThemedText type="small" style={[styles.pillText, { color: theme.gold }]}>
                    {getLang() === 'en'
                      ? `${reviewStreak} ${reviewStreak === 1 ? 'day' : 'days'}`
                      : `${reviewStreak} ${pluralDays(reviewStreak)}`}
                  </ThemedText>
                </View>
              </View>
              <ThemedText type="subtitle" style={styles.heroTitle}>
                {getLang() === 'en'
                  ? practice
                    ? `Practice ${n} ${n === 1 ? 'word' : 'words'}`
                    : `${n} ${n === 1 ? 'word' : 'words'} to review`
                  : practice
                    ? `Закрепим ${n} ${pluralWords(n)}`
                    : `${n} ${pluralWords(n)} на повторение`}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {practice
                  ? t('Быстрая тренировка займёт меньше минуты')
                  : t('Повтори, пока слова свежи в памяти')}
              </ThemedText>
              <Button
                title={t('Начать тренировку')}
                icon="bolt.fill"
                onPress={() => startWith('flashcards', queue)}
              />
            </View>
          </Reveal>
          )}

          {/* Итоги недели от тренера (Э6-клиент): пн–вт, между hero и плитками.
              Закрывается крестиком — weekStart запоминается в pref. */}
          {digest ? (
            <Reveal delay={120}>
              <View style={[styles.digestCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.digestHeader}>
                  <Icon name="sparkles" size={16} color={theme.primary} />
                  <ThemedText type="smallBold" style={styles.digestTitle}>
                    {t('Итоги недели от тренера')}
                  </ThemedText>
                  <Pressable
                    onPress={dismissDigest}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('Закрыть')}>
                    <Icon name="xmark" size={16} color={theme.textSecondary} />
                  </Pressable>
                </View>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={6}>
                  {digest.digest}
                </ThemedText>
              </View>
            </Reveal>
          ) : null}

          {/* Задания тренера — открытые ответы с ИИ-оценкой (Э2, B.1/B.3).
              Free после исчерпания: запертые режимы свёрнуты в один блок ниже. */}
          {!testsExhausted ? (
            <>
              <Reveal delay={140}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
                  {t('ЗАДАНИЯ ТРЕНЕРА')}
                </ThemedText>
              </Reveal>
              <View style={styles.modeList}>
                <Reveal delay={160}>
                  <ModeCard
                    icon="ear"
                    color={MODE_TILE.dictation}
                    title={t('Диктант')}
                    subtitle={voiceOk ? t('Услышь и напиши') : t('Голос для языка не установлен')}
                    disabled={!voiceOk}
                    onPress={() => startWith('dictation', queue)}
                  />
                </Reveal>
                <Reveal delay={190}>
                  <ModeCard
                    icon="pencil.line"
                    color={MODE_TILE.write}
                    title={t('Напиши сам')}
                    subtitle={t('Составь своё предложение')}
                    onPress={() => startWith('write', queue)}
                  />
                </Reveal>
                {/* «Расскажи о фото» (Э4, B.3): есть фото → сессия описаний;
                    0 фото → плитка НЕ исчезает, а ведёт на камеру (empty). */}
                <Reveal delay={220}>
                  {photoCards.length > 0 ? (
                    <ModeCard
                      icon="mic.fill"
                      color={MODE_TILE.speakPhoto}
                      title={t('Расскажи о фото')}
                      subtitle={t('Опиши свой снимок голосом')}
                      onPress={() => startWith('speakPhoto', photoCards)}
                    />
                  ) : (
                    <ModeCard
                      icon="mic.fill"
                      color={MODE_TILE.speakPhoto}
                      title={t('Расскажи о фото')}
                      subtitle={t('Сначала поймай пару предметов')}
                      onPress={() => {
                        feedbackTap();
                        router.replace('/(tabs)');
                      }}
                    />
                  )}
                </Reveal>
              </View>
            </>
          ) : null}

          {/* Быстрые тесты */}
          <Reveal delay={220}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
              {t('БЫСТРЫЕ ТЕСТЫ')}
            </ThemedText>
          </Reveal>
          <View style={styles.modeList}>
            <Reveal delay={240}>
              <ModeCard
                icon="rectangle.on.rectangle.angled"
                color={MODE_TILE.flash}
                title={t('Карточки')}
                subtitle={t('Фото → слово, перевод и звук')}
                onPress={() => startWith('flashcards', queue)}
              />
            </Reveal>
            {!testsExhausted ? (
              <>
                <Reveal delay={270}>
                  <ModeCard
                    icon="speaker.wave.2.fill"
                    color={MODE_TILE.listen}
                    title={t('На слух')}
                    subtitle={t('Слушай слово — выбери ответ')}
                    onPress={() => startWith('listen', queue)}
                  />
                </Reveal>
                <Reveal delay={300}>
                  <ModeCard
                    icon="text.alignleft"
                    color={MODE_TILE.sentence}
                    title={t('Слово в предложение')}
                    subtitle={t('Вставь пропущенное слово')}
                    onPress={() => startWith('sentence', queue)}
                  />
                </Reveal>
                <Reveal delay={330}>
                  <ModeCard
                    icon="sparkles"
                    color={MODE_TILE.smart}
                    title={t('Умный тест')}
                    subtitle={t('10 вопросов, форматы вперемешку')}
                    onPress={() => startWith('smart', queue)}
                  />
                </Reveal>
              </>
            ) : (
              // Один блок вместо шести замков (B.1, п.4): не пугаем пейволлом.
              <Reveal delay={270}>
                <PremiumModesCard
                  count={4 + (voiceOk ? 1 : 0) + (photoCards.length > 0 ? 1 : 0)}
                  onPress={() => {
                    feedbackTap();
                    setLimitSheet(true);
                  }}
                />
              </Reveal>
            )}
          </View>

          {/* Карта активности (гитхаб-карта) — ПОД плитками (B.1, п.3) */}
          <Reveal delay={360}>
            <View style={[styles.activityCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.activityHeader}>
                <ThemedText type="smallBold">{t('Активность')}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {REVIEW_WEEKS} {t('недель')}
                </ThemedText>
              </View>
              <ContributionGrid activityByDay={activityByDay} weeks={REVIEW_WEEKS} />
            </View>
          </Reveal>
        </View>
        <TestLimitSheet
          visible={limitSheet}
          onClose={() => setLimitSheet(false)}
          onPremium={onLimitPremium}
          onFlashcards={onLimitFlashcards}
        />
      </Screen>
    );
  }

  // ===================== ИТОГ =====================
  if (phase === 'summary') {
    // Точность считаем только по «объективным» вопросам: выбор + впиши +
    // «Напиши сам» (verdict тренера объективен; фолбэки без оценки — ungraded —
    // в точность не идут). Знакомство и «скажи вслух» — без «верно/неверно».
    const objTotal = Math.max(
      0,
      (quiz?.filter(
        (q) => q.answerMode === 'choice' || q.answerMode === 'type' || q.answerMode === 'write',
      ).length ?? 0) - ungraded,
    );
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
              {isWorkout
                ? t('Тренировка от тренера выполнена')
                : perfect
                  ? t('Идеально!')
                  : t('Готово!')}
            </ThemedText>
          </Reveal>
          <Reveal delay={140}>
            <ThemedText type="default" themeColor="textSecondary" style={styles.centerText}>
              {perfect
                ? t('Без единой ошибки — так держать!')
                : objTotal > 0
                  ? getLang() === 'en'
                    ? `Correct ${score} of ${objTotal}. Let's review the misses below.`
                    : `Верно ${score} из ${objTotal}. Разберём промахи ниже.`
                  : t('Готово. Разберём промахи ниже.')}
            </ThemedText>
          </Reveal>

          <Reveal delay={200} style={styles.summaryStats}>
            {accuracy !== null ? (
              <StatCard
                icon="target"
                value={`${accuracy}%`}
                label={t('Точность')}
                tone={accuracy >= 80 ? 'success' : 'primary'}
              />
            ) : (
              <StatCard icon="checkmark" value={objTotal} label={t('Проверок')} tone="primary" />
            )}
            {missed.length > 0 ? (
              <StatCard icon="xmark.circle.fill" value={missed.length} label={t('Ошибок')} tone="warning" />
            ) : (
              <StatCard icon="flame.fill" value={stats.streak} label={t('Серия дней')} tone="accent" />
            )}
          </Reveal>

          {/* Разбор ошибок: слова, которые не дались — с переводом */}
          {missed.length > 0 ? (
            <Reveal delay={240} style={styles.mistakesBlock}>
              <View style={styles.mistakesHeader}>
                <Icon name="exclamationmark.triangle.fill" size={16} color={theme.danger} />
                <ThemedText type="smallBold" style={{ color: theme.danger }}>
                  {t('Разбор ошибок')}
                </ThemedText>
              </View>
              <View style={[styles.mistakesCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {missed.map((card, i) => (
                  <View
                    key={card.id || card.word}
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
                      {/* Исправленный вариант тренера (диктант/«Напиши сам») —
                          главная ценность фидбека, не теряем её на итоге (B.6). */}
                      {coachNotes.get(card.id || card.word)?.corrected ? (
                        <ThemedText type="small" style={{ color: theme.primary }} numberOfLines={2}>
                          {t('Тренер:')} {coachNotes.get(card.id || card.word)?.corrected}
                        </ThemedText>
                      ) : null}
                    </View>
                    <SpeakButton text={card.word} language={card.learningLang} size={36} />
                  </View>
                ))}
              </View>
              {retryableMissed.length > 0 ? (
                <Button title={`${t('Повторить ошибки')} · ${retryableMissed.length}`} icon="arrow.counterclockwise" onPress={onRetryMissed} />
              ) : null}
            </Reveal>
          ) : null}

          {/* Кап проверок тренера исчерпан по ходу сессии → один апселл здесь,
              а не посреди ритма (B.2). */}
          {limitHit ? (
            <Reveal delay={270}>
              <Pressable onPress={onLimitPremium} accessibilityRole="button">
                <ThemedText type="small" style={[styles.centerText, { color: theme.gold }]}>
                  {t('Лимит проверок на сегодня — Premium снимает')}
                </ThemedText>
              </Pressable>
            </Reveal>
          ) : null}

          <Reveal delay={300} style={styles.summaryActions}>
            {/* Тренировка — подарок дня: повтор в тот же день только у Premium (B.1 п.5). */}
            {!isWorkout ? (
              <Button title={t('Пройти ещё раз')} icon="play.fill" onPress={onRestart} />
            ) : isPremium ? (
              <Button title={t('Пройти ещё раз')} icon="play.fill" onPress={() => startWorkout(0)} />
            ) : null}
            <Button title={t('К режимам')} icon="chevron.left" variant="ghost" onPress={onChangeMode} />
          </Reveal>
        </View>

        {/* Празднование идеальной сессии. */}
        <CelebrationModal
          visible={showCelebration}
          title={t('Идеальная сессия!')}
          subtitle={
            objTotal > 0
              ? getLang() === 'en'
                ? `All ${objTotal} checks correct — brilliant!`
                : `Все ${objTotal} проверок верны — блестяще!`
              : t('Ни одной ошибки — блестяще!')
          }
          icon="trophy.fill"
          tone="gold"
          onClose={() => setShowCelebration(false)}
        />
        <TestLimitSheet
          visible={limitSheet}
          onClose={() => setLimitSheet(false)}
          onPremium={onLimitPremium}
          onFlashcards={onLimitFlashcards}
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
              {t('Вопрос')} {qIndex + 1} {t('из')} {total}
            </ThemedText>
            <Pill label={`${Math.round((qIndex / total) * 100)}%`} tone="primary" />
          </View>
          <ProgressBar progress={qIndex / total} tone="primary" />
        </View>

        {/* Салют за верный ответ (поверх всего, не ловит нажатия). */}
        <Confetti trigger={burst} originTop="26%" count={16} />

        {/* Знакомство / впиши / диктант / напиши сам / скажи вслух — свои тела. */}
        {q.answerMode === 'intro' ? (
          <IntroBody card={q.card} onNext={onIntroNext} />
        ) : q.answerMode === 'type' && q.kind === 'dictation' ? (
          <DictationBody
            key={q.id}
            card={q.card}
            typed={typed}
            onChange={setTyped}
            result={dictResult}
            note={dictNote}
            gradeFailed={dictGradeFailed}
            onSubmit={onDictationSubmit}
            onNext={onNextQuestion}
            last={qIndex + 1 >= total}
          />
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
        ) : q.answerMode === 'write' && q.kind === 'describePhoto' ? (
          <SpeakPhotoBody
            key={q.id}
            card={q.card}
            typed={typed}
            onChange={setTyped}
            phase={writePhase}
            verdict={writeVerdict}
            note={writeNote}
            fallback={writeFallback}
            sttOff={sttUnavailable}
            onSttFail={markSttUnavailable}
            onSubmit={onWriteSubmit}
            onNext={onNextQuestion}
            last={qIndex + 1 >= total}
          />
        ) : q.answerMode === 'write' ? (
          <WriteBody
            key={q.id}
            card={q.card}
            typed={typed}
            onChange={setTyped}
            phase={writePhase}
            verdict={writeVerdict}
            note={writeNote}
            fallback={writeFallback}
            onSubmit={onWriteSubmit}
            onNext={onNextQuestion}
            last={qIndex + 1 >= total}
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
                title={qIndex + 1 >= total ? t('Завершить') : t('Дальше')}
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
                {t('На сегодня всё выучено — тренируемся')}
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.progressRow}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('Карточка')} {index + 1} {t('из')} {total}
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
              left={{ label: t('Забыл'), color: theme.danger }}
              up={{ label: t('Вспомнил'), color: theme.primary }}
              right={{ label: t('Легко'), color: theme.success }}
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
                    {t('Вспомни слово')}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('Нажми, чтобы показать')}
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
                label={t('Забыл')}
                sub={intervals.again}
                bg={theme.dangerSoft}
                fg={theme.danger}
                onPress={() => onRate('again')}
              />
              <RatingButton
                icon="checkmark"
                label={t('Вспомнил')}
                sub={intervals.good}
                bg={theme.primarySoft}
                fg={theme.primary}
                onPress={() => onRate('good')}
              />
              <RatingButton
                icon="star.fill"
                label={t('Легко')}
                sub={intervals.easy}
                bg={theme.successSoft}
                fg={theme.success}
                onPress={() => onRate('easy')}
              />
            </FadeIn>
          ) : (
            <FadeIn key="show">
              <Button title={t('Показать слово')} icon="sparkles" onPress={() => setRevealed(true)} />
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
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('Назад к режимам')}
      style={styles.backToModes}>
      <Icon name="chevron.left" size={18} color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary">
        {t('К режимам')}
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
  color,
  onPress,
  disabled = false,
}: {
  icon: SFSymbol;
  title: string;
  subtitle: string;
  /** Цвет иконки-плитки слева (как в дизайне). */
  color: string;
  onPress: () => void;
  /** Режим недоступен (например, нет TTS-голоса): приглушён и не нажимается. */
  disabled?: boolean;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => (scale.value = withSpring(Motion.scalePressed, Motion.spring.stiff))}
      onPressOut={() => (scale.value = withSpring(1, Motion.spring.bouncy))}>
      <Animated.View
        style={[
          styles.modeCard,
          { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 },
          disabled ? { opacity: 0.55 } : null,
          animStyle,
        ]}>
        <View style={[styles.modeIcon, { backgroundColor: color }]}>
          <Icon name={icon} size={22} color="#FFFFFF" />
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

/**
 * Один блок «Ещё N режимов — Premium» вместо чипов-замков на каждой плитке
 * (B.1, п.4): free после исчерпания дневного теста видит свёрнутые режимы и
 * мягкий путь к Premium через существующий лист лимита.
 */
function PremiumModesCard({ count, onPress }: { count: number; onPress: () => void }) {
  const theme = useTheme();
  const t = useT();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const title =
    getLang() === 'en'
      ? `${count} more modes — Premium`
      : `Ещё ${count} ${pluralModes(count)} — Premium`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      onPressIn={() => (scale.value = withSpring(Motion.scalePressed, Motion.spring.stiff))}
      onPressOut={() => (scale.value = withSpring(1, Motion.spring.bouncy))}>
      <Animated.View
        style={[
          styles.modeCard,
          { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 },
          animStyle,
        ]}>
        <View style={[styles.modeIcon, { backgroundColor: theme.goldSoft }]}>
          <Icon name="lock.fill" size={22} color={theme.gold} />
        </View>
        <View style={styles.modeText}>
          <ThemedText type="default" style={styles.modeTitle}>
            {title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('Тесты на сегодня пройдены')}
          </ThemedText>
        </View>
        <Icon name="chevron.right" size={20} color={theme.textSecondary} />
      </Animated.View>
    </Pressable>
  );
}

/**
 * Мягкий лист-апселл, когда free исчерпал дневной лимит тестов. Не запирает
 * наглухо: предлагает Premium (безлимит) ИЛИ бесплатные карточки, плюс закрытие.
 */
function TestLimitSheet({
  visible,
  onClose,
  onPremium,
  onFlashcards,
}: {
  visible: boolean;
  onClose: () => void;
  onPremium: () => void;
  onFlashcards: () => void;
}) {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel={t('Закрыть')} />
      <View
        style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: insets.bottom + Spacing.five }]}>
        <Sticker symbol="bolt.fill" tone="primary" size={72} />
        <ThemedText type="subtitle" style={styles.centerText}>
          {t('Тесты на сегодня пройдены')}
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.centerText}>
          {t('На Free — 1 тест в день, лимит обновится завтра. С Premium тесты без ограничений — тренируйся сколько хочешь.')}
        </ThemedText>
        <View style={styles.sheetActions}>
          <Button title={t('Открыть Premium')} icon="sparkles" onPress={onPremium} />
          <Button
            title={t('Позаниматься карточками')}
            icon="rectangle.on.rectangle.angled"
            variant="ghost"
            onPress={onFlashcards}
          />
        </View>
      </View>
    </Modal>
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
  const t = useT();
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
      accessibilityLabel={t('Выбрать картинку')}
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
  const t = useT();
  return (
    <>
      <Reveal key={card.id} distance={16} style={styles.testBody}>
        <View style={[styles.prompt, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.promptTag, { backgroundColor: theme.accentSoft }]}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              {t('Новое слово')}
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
        <Button title={t('Далее')} icon="arrow.right" onPress={onNext} />
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
  const t = useT();
  const answered = checked !== null;
  const correct = checked === true;
  const borderColor = answered ? (correct ? theme.success : theme.danger) : theme.border;
  return (
    <>
      <Reveal distance={16} style={styles.testBody}>
        <Animated.View style={[styles.prompt, { backgroundColor: theme.card, borderColor: theme.border }, shakeStyle]}>
          <View style={[styles.promptTag, { backgroundColor: theme.primarySoft }]}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              {t('Впиши слово')}
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
            placeholder={t('Впиши слово')}
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
                {correct ? t('Верно!') : card.word}
              </ThemedText>
              <SpeakButton text={card.word} language={card.learningLang} size={38} />
            </View>
          ) : null}
        </Animated.View>
      </Reveal>
      <View style={styles.footer}>
        {answered ? (
          <Button title={last ? t('Завершить') : t('Дальше')} icon="arrow.right" onPress={onNext} />
        ) : (
          <Button title={t('Проверить')} icon="checkmark" onPress={onSubmit} disabled={!typed.trim()} />
        )}
      </View>
    </>
  );
}

/** «Скажи вслух»: произнести → показать ответ → самооценка (до ASR — на честность). */
function SpeakBody({ card, onRate }: { card: WordCard; onRate: (r: SrsRating) => void }) {
  const theme = useTheme();
  const t = useT();
  const [shown, setShown] = useState(false);
  return (
    <>
      <Reveal distance={16} style={styles.testBody}>
        <View style={[styles.prompt, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.promptTag, { backgroundColor: theme.primarySoft }]}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              {t('Скажи вслух')}
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
              {t('Произнеси слово вслух, потом проверь себя.')}
            </ThemedText>
          )}
        </View>
      </Reveal>
      <View style={styles.footer}>
        {!shown ? (
          <Button
            title={t('Показать ответ')}
            icon="eye.fill"
            onPress={() => {
              setShown(true);
              speakWord(card.word, card.learningLang);
            }}
          />
        ) : (
          <View style={styles.ratingRow}>
            <RatingButton icon="arrow.counterclockwise" label={t('Забыл')} sub="" bg={theme.dangerSoft} fg={theme.danger} onPress={() => onRate('again')} />
            <RatingButton icon="checkmark" label={t('Норм')} sub="" bg={theme.primarySoft} fg={theme.primary} onPress={() => onRate('good')} />
            <RatingButton icon="star.fill" label={t('Легко')} sub="" bg={theme.successSoft} fg={theme.success} onPress={() => onRate('easy')} />
          </View>
        )}
      </View>
    </>
  );
}

/**
 * «Диктант» (Э2, спека B.4): услышь предложение → впиши ключевое слово.
 * Прослушивание без ограничений (обычная + «черепаха»), ввод — паттерн TypeBody.
 * Открытый ответ: без красного шейка; после ЛЮБОГО исхода показываем полное
 * предложение с выделенным словом — иначе из ошибки нечему учиться.
 */
function DictationBody({
  card,
  typed,
  onChange,
  result,
  note,
  gradeFailed,
  onSubmit,
  onNext,
  last,
}: {
  card: WordCard;
  typed: string;
  onChange: (s: string) => void;
  result: DictationResult | null;
  note: { corrected: string; feedback: string } | null;
  gradeFailed: boolean;
  onSubmit: () => void;
  onNext: () => void;
  last: boolean;
}) {
  const theme = useTheme();
  const t = useT();
  const answered = result !== null;
  const sentence = dictationSentence(card);
  // С примером диктуем и пишем ЦЕЛОЕ предложение; без примера — только слово.
  const sentenceMode = sentence !== card.word;
  const borderColor = !answered
    ? theme.border
    : result === 'correct'
      ? theme.success
      : result === 'partial' || result === 'partial-word'
        ? theme.warning
        : theme.danger;

  return (
    <>
      <Reveal distance={16} style={styles.testBody}>
        <View style={[styles.prompt, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.promptTag, { backgroundColor: theme.primarySoft }]}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              {dictationLabel(card)}
            </ThemedText>
          </View>
          {/* Слушаем ЦЕЛОЕ предложение: обычная скорость + «черепаха» (B.4). */}
          <View style={styles.audioPrompt}>
            <SpeakButton text={sentence} language={card.learningLang} size={96} />
            <SpeakButton text={sentence} language={card.learningLang} size={44} slow />
          </View>
          {/* Без autoFocus: на мобильном вебе он «прыгает» вьюпортом (B.7). */}
          <TextInput
            value={typed}
            onChangeText={onChange}
            editable={!answered}
            multiline={sentenceMode}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={sentenceMode ? t('Напиши всё предложение…') : t('Впиши слово')}
            placeholderTextColor={theme.textSecondary}
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={() => {
              if (!answered && typed.trim()) onSubmit();
            }}
            style={[styles.typeInput, { borderColor, color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          {answered ? (
            <>
              <View style={styles.typeResultRow}>
                {result === 'correct' ? (
                  <>
                    <Icon name="checkmark.circle.fill" size={18} color={theme.success} />
                    <ThemedText type="smallBold" style={{ color: theme.success }}>
                      {t('Верно!')}
                    </ThemedText>
                  </>
                ) : result === 'partial' || result === 'partial-word' ? (
                  // «Почти!» — янтарный штамп, НЕ красный: диакритика или
                  // огрехи предложения при верном ключевом слове.
                  <>
                    <Icon name="exclamationmark.triangle.fill" size={18} color={theme.warning} />
                    <ThemedText type="smallBold" style={{ color: theme.warning }}>
                      {t('Почти!')}
                    </ThemedText>
                  </>
                ) : (
                  <>
                    <Icon name="xmark.circle.fill" size={18} color={theme.danger} />
                    <ThemedText type="smallBold" style={{ color: theme.danger }}>
                      {card.word}
                    </ThemedText>
                  </>
                )}
                <SpeakButton text={card.word} language={card.learningLang} size={38} />
              </View>
              {result === 'partial' ? (
                <ThemedText type="small" style={[styles.centerText, { color: theme.warning }]}>
                  {t('Проверь умляут/акцент')}
                </ThemedText>
              ) : result === 'partial-word' ? (
                <ThemedText type="small" style={[styles.centerText, { color: theme.warning }]}>
                  {t('Слово верно — сверь предложение с оригиналом')}
                </ThemedText>
              ) : null}
              {/* Полное предложение с выделенным словом — обязательно (B.4). */}
              <View style={[styles.example, { backgroundColor: theme.backgroundElement }]}>
                <HighlightedSentence sentence={sentence} word={card.word} />
              </View>
            </>
          ) : null}
        </View>

        {/* Фидбек тренера на ошибке (подтягивается неблокирующе). */}
        {result === 'wrong' && note ? (
          <OpenAnswerFeedback corrected={note.corrected} feedback={note.feedback} lang={card.learningLang} />
        ) : null}
        {result === 'wrong' && gradeFailed ? (
          <FadeIn>
            <View style={[styles.fallbackPlate, { backgroundColor: theme.backgroundElement }]}>
              <Icon name="info.circle.fill" size={16} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.fallbackText}>
                {t('Тренер недоступен — засчитано локально')}
              </ThemedText>
            </View>
          </FadeIn>
        ) : null}
      </Reveal>
      <View style={styles.footer}>
        {answered ? (
          <FadeIn key="next">
            <Button title={last ? t('Завершить') : t('Дальше')} icon="arrow.right" onPress={onNext} />
          </FadeIn>
        ) : (
          <Button title={t('Проверить')} icon="checkmark" onPress={onSubmit} disabled={!typed.trim()} />
        )}
      </View>
    </>
  );
}

/**
 * «Напиши сам» (Э2, спека B.2): своё предложение со словом → оценка ИИ-тренера.
 * Ожидание оценки — «переходное» состояние (ответ ученика крупно + «Тренер
 * читает…» с мягкой пульсацией), не голый спиннер. Красного шейка и
 * feedbackWrong тут не бывает — оценка творчества, не промах в угадайке.
 */
function WriteBody({
  card,
  typed,
  onChange,
  phase,
  verdict,
  note,
  fallback,
  onSubmit,
  onNext,
  last,
}: {
  card: WordCard;
  typed: string;
  onChange: (s: string) => void;
  phase: 'input' | 'grading' | 'done';
  verdict: GradeVerdict | null;
  note: { corrected: string; feedback: string } | null;
  fallback: 'auth' | 'limit' | 'unavailable' | null;
  onSubmit: () => void;
  onNext: () => void;
  last: boolean;
}) {
  const theme = useTheme();
  const t = useT();
  // Пульсация строки «Тренер читает…» (Reveal/withTiming — спека B.2).
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (phase === 'grading') {
      pulse.value = withRepeat(withTiming(0.35, { duration: 650 }), -1, true);
    } else {
      pulse.value = withTiming(1, { duration: 150 });
    }
  }, [phase, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <>
      <Reveal distance={16} style={styles.testBody}>
        <View style={[styles.prompt, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.promptTag, { backgroundColor: theme.primarySoft }]}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              {t('Составь своё предложение')}
            </ThemedText>
          </View>
          <View style={styles.promptWordRow}>
            <ThemedText type="title" numberOfLines={2} adjustsFontSizeToFit style={styles.promptWord}>
              {card.word}
            </ThemedText>
            <SpeakButton text={card.word} language={card.learningLang} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {card.translation}
          </ThemedText>
          {phase === 'input' ? (
            // БЕЗ autoFocus — прыжок вьюпорта на iOS Safari (B.7). На веб-
            // клавиатуре отправка — Cmd/Ctrl+Enter или кнопка «Проверить».
            <TextInput
              value={typed}
              onChangeText={onChange}
              multiline
              autoCapitalize="sentences"
              autoCorrect={false}
              placeholder={t('Напиши предложение с этим словом…')}
              placeholderTextColor={theme.textSecondary}
              onKeyPress={(e) => {
                const ne = e.nativeEvent as { key?: string; metaKey?: boolean; ctrlKey?: boolean };
                if (ne.key === 'Enter' && (ne.metaKey || ne.ctrlKey) && typed.trim()) onSubmit();
              }}
              style={[
                styles.writeInput,
                { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement },
              ]}
            />
          ) : (
            // Переходное состояние и результат: ответ ученика крупно.
            <ThemedText type="subtitle" style={styles.centerText}>
              {typed}
            </ThemedText>
          )}
          {phase === 'grading' ? (
            <Animated.View style={pulseStyle}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Тренер читает…')}
              </ThemedText>
            </Animated.View>
          ) : null}
        </View>

        {/* Карточка фидбека тренера — ПОД полем (B.2). */}
        {phase === 'done' && verdict ? (
          <OpenAnswerFeedback
            verdict={verdict}
            corrected={note?.corrected ?? ''}
            feedback={note?.feedback ?? ''}
            lang={card.learningLang}
          />
        ) : null}
        {phase === 'done' && fallback ? (
          <FadeIn>
            <View style={[styles.fallbackPlate, { backgroundColor: theme.backgroundElement }]}>
              <Icon
                name={fallback === 'limit' ? 'checkmark.circle.fill' : 'info.circle.fill'}
                size={16}
                color={fallback === 'limit' ? theme.success : theme.textSecondary}
              />
              <ThemedText type="small" themeColor="textSecondary" style={styles.fallbackText}>
                {fallback === 'limit'
                  ? t('Принято ✓')
                  : fallback === 'auth'
                    ? t('Войди, чтобы тренер проверял ответы')
                    : t('Тренер недоступен — ответ сохранён без оценки')}
              </ThemedText>
            </View>
          </FadeIn>
        ) : null}
      </Reveal>
      <View style={styles.footer}>
        {phase === 'done' ? (
          <FadeIn key="next">
            <Button title={last ? t('Завершить') : t('Дальше')} icon="arrow.right" onPress={onNext} />
          </FadeIn>
        ) : phase === 'input' ? (
          <Button title={t('Проверить')} icon="checkmark" onPress={onSubmit} disabled={!typed.trim()} />
        ) : null}
      </View>
    </>
  );
}

/**
 * «Расскажи о фото» (Э4, спека B.5): своё фото крупно → запись голосом →
 * редактируемый транскрипт → оценка ИИ-тренера (та же механика write,
 * task 'describe_photo'). Фазы: idle → recording → transcribed → оценка (B.2).
 *
 * Web Speech API — деградация ПО ОШИБКЕ, не по наличию (Э4): на iOS WebKit
 * конструктор СУЩЕСТВУЕТ, но без Siri&Dictation молча отдаёт
 * 'service-not-allowed'/ноль результатов. Первая ошибка / ноль результатов /
 * 8 с без признаков жизни → текстовый ввод (тот же экран) + память в pref.
 * Натив/нет API вообще → текстовый ввод сразу, без кнопки записи.
 */
function SpeakPhotoBody({
  card,
  typed,
  onChange,
  phase,
  verdict,
  note,
  fallback,
  sttOff,
  onSttFail,
  onSubmit,
  onNext,
  last,
}: {
  card: WordCard;
  typed: string;
  onChange: (s: string) => void;
  phase: 'input' | 'grading' | 'done';
  verdict: GradeVerdict | null;
  note: { corrected: string; feedback: string } | null;
  fallback: 'auth' | 'limit' | 'unavailable' | null;
  /** STT недоступен (нет API / уже ловили ошибку) → сразу текстовый ввод. */
  sttOff: boolean;
  /** Ошибка распознавания → запомнить «текст навсегда» (pref 'stt_unavailable'). */
  onSttFail: () => void;
  onSubmit: () => void;
  onNext: () => void;
  last: boolean;
}) {
  const theme = useTheme();
  const t = useT();
  // Фазы записи по B.5 (только пока родительская фаза 'input').
  const [recPhase, setRecPhase] = useState<'idle' | 'recording' | 'transcribed'>('idle');
  const [seconds, setSeconds] = useState(0);
  // Мягкое «Не расслышал…» — и при пустом транскрипте, и при падении в текст.
  const [misheard, setMisheard] = useState(false);
  const recRef = useRef<any>(null); // экземпляр SpeechRecognition (нет типов)
  const gotResultRef = useRef(false);
  const transcriptRef = useRef('');
  const deadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Пульс красной точки записи (B.5: recording — пульсирующий индикатор).
  const recPulse = useSharedValue(1);
  useEffect(() => {
    if (recPhase === 'recording') {
      recPulse.value = withRepeat(withTiming(0.25, { duration: 600 }), -1, true);
    } else {
      recPulse.value = withTiming(1, { duration: 150 });
    }
  }, [recPhase, recPulse]);
  const recPulseStyle = useAnimatedStyle(() => ({ opacity: recPulse.value }));

  // «Тренер читает…» — то же переходное состояние, что у «Напиши сам» (B.2).
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (phase === 'grading') {
      pulse.value = withRepeat(withTiming(0.35, { duration: 650 }), -1, true);
    } else {
      pulse.value = withTiming(1, { duration: 150 });
    }
  }, [phase, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const stopTimers = () => {
    if (deadTimerRef.current) {
      clearTimeout(deadTimerRef.current);
      deadTimerRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  // Размонтирование посреди записи (ушли с вопроса) — глушим всё.
  useEffect(
    () => () => {
      if (deadTimerRef.current) clearTimeout(deadTimerRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      try {
        recRef.current?.abort?.();
      } catch {
        /* уже остановлен */
      }
      recRef.current = null;
    },
    [],
  );

  // Временный текстовый режим ЭТОГО вопроса: сбой записи не хоронит голос —
  // кнопка «Записать голосом» остаётся (фикс 12.07: раньше любой сбой писал
  // pref и запись пропадала навсегда).
  const [localText, setLocalText] = useState(false);

  /**
   * Сбой распознавания → текстовый ввод. permanent=true ТОЛЬКО для реального
   * запрета сервиса ('service-not-allowed'/'not-allowed' — iOS без Siri &
   * Dictation, запрет микрофона): тогда пишем pref. Всё остальное (не
   * расслышал, сеть, таймаут) — временно, с кнопкой повторной записи.
   */
  const failToText = (permanent: boolean) => {
    stopTimers();
    try {
      recRef.current?.abort?.();
    } catch {
      /* уже остановлен */
    }
    recRef.current = null;
    setRecPhase('idle');
    setMisheard(true);
    if (permanent) onSttFail();
    else setLocalText(true);
  };

  const startRecording = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      // API нет вообще (Safari старый/Firefox/натив) → текст сразу.
      onSttFail();
      return;
    }
    feedbackTap();
    setMisheard(false);
    setLocalText(false);
    gotResultRef.current = false;
    transcriptRef.current = '';
    let rec: any; // экземпляр SpeechRecognition (нет типов)
    try {
      rec = new Ctor();
    } catch {
      failToText(false);
      return;
    }
    rec.lang = card.learningLang;
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    // Сервис подал признак жизни (услышал речь) → «мёртвый» таймер не нужен:
    // дальше исходы разберут onresult/onend (в т.ч. пустой результат).
    rec.onspeechstart = () => {
      if (recRef.current !== rec) return;
      if (deadTimerRef.current) {
        clearTimeout(deadTimerRef.current);
        deadTimerRef.current = null;
      }
    };
    rec.onresult = (e: any) => {
      if (recRef.current !== rec) return;
      gotResultRef.current = true;
      transcriptRef.current = String(e?.results?.[0]?.[0]?.transcript ?? '').trim();
    };
    rec.onerror = (e: any) => {
      if (recRef.current !== rec) return;
      // Навсегда — только реальный запрет сервиса/микрофона (iOS без Siri &
      // Dictation, denied permission). 'no-speech'/'network'/прочее — временно.
      const code = String(e?.error ?? '');
      failToText(code === 'service-not-allowed' || code === 'not-allowed');
    };
    rec.onend = () => {
      if (recRef.current !== rec) return;
      stopTimers();
      recRef.current = null;
      if (!gotResultRef.current) {
        // Ноль результатов (в т.ч. «молчаливый» iOS-WebKit) → текст ВРЕМЕННО:
        // кнопка «Записать голосом» остаётся, юзер решает сам.
        setRecPhase('idle');
        setMisheard(true);
        setLocalText(true);
        return;
      }
      const text = transcriptRef.current;
      if (!text) {
        // Транскрипт пришёл, но пустой → мягкий ретрай, STT НЕ хороним.
        setRecPhase('idle');
        setMisheard(true);
        return;
      }
      onChange(text);
      setRecPhase('transcribed');
    };
    recRef.current = rec;
    setSeconds(0);
    tickRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    // 8 с без единого признака жизни распознавания → текст (временно, Э4).
    deadTimerRef.current = setTimeout(() => {
      if (recRef.current === rec) failToText(false);
    }, STT_DEAD_MS);
    try {
      rec.start();
      setRecPhase('recording');
    } catch {
      failToText(false);
    }
  };

  const stopRecording = () => {
    feedbackTap();
    try {
      recRef.current?.stop();
    } catch {
      /* уже остановлен */
    }
  };

  const timer = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  // Текстовый режим: тот же экран, только вместо кнопки записи — поле ввода.
  // Нет API вообще (натив/старый Safari/Firefox) → текст сразу, pref не нужен;
  // sttOff — запомненная ошибка распознавания (Э4).
  const hasApi = useMemo(() => !!getSpeechRecognitionCtor(), []);
  const textMode = sttOff || !hasApi || localText;
  // Вернуться к голосу можно всегда, кроме подтверждённого запрета сервиса.
  const canRetryVoice = hasApi && !sttOff;

  return (
    <>
      <Reveal distance={16} style={styles.testBody}>
        <View style={[styles.prompt, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.promptTag, { backgroundColor: theme.primarySoft }]}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              {t('Расскажи о фото')}
            </ThemedText>
          </View>
          {/* Своё фото — крупно: собственный снимок и есть материал урока (Э4). */}
          <Sticker imageUri={card.imageUri} category={card.category} size={168} />
          <View style={styles.promptWordRow}>
            <ThemedText type="subtitle" numberOfLines={1} adjustsFontSizeToFit style={styles.speakPhotoWord}>
              {card.word}
            </ThemedText>
            <SpeakButton text={card.word} language={card.learningLang} size={38} />
          </View>
          {phase === 'input' ? (
            <>
              {recPhase !== 'transcribed' ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
                  {t('Опиши снимок 1–2 предложениями на изучаемом языке')}
                </ThemedText>
              ) : null}
              {misheard ? (
                <ThemedText type="small" style={[styles.centerText, { color: theme.warning }]}>
                  {t('Не расслышал, попробуй ещё раз или напиши текстом')}
                </ThemedText>
              ) : null}
              {textMode ? (
                // Фолбэк: текстовый ввод (тот же экран, паттерн «Напиши сам»).
                <>
                  <TextInput
                    value={typed}
                    onChangeText={onChange}
                    multiline
                    autoCapitalize="sentences"
                    autoCorrect={false}
                    placeholder={t('Напиши 1–2 предложения об этом снимке…')}
                    placeholderTextColor={theme.textSecondary}
                    onKeyPress={(e) => {
                      const ne = e.nativeEvent as { key?: string; metaKey?: boolean; ctrlKey?: boolean };
                      if (ne.key === 'Enter' && (ne.metaKey || ne.ctrlKey) && typed.trim()) onSubmit();
                    }}
                    style={[
                      styles.writeInput,
                      { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement },
                    ]}
                  />
                  {canRetryVoice ? (
                    // Сбой записи — не приговор: вернуться к голосу можно всегда.
                    <Button
                      title={t('Записать голосом')}
                      icon="mic.fill"
                      variant="ghost"
                      onPress={startRecording}
                    />
                  ) : null}
                </>
              ) : recPhase === 'idle' ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Записать')}
                    onPress={startRecording}
                    style={[styles.recordBtn, { backgroundColor: MODE_TILE.speakPhoto }]}>
                    <Icon name="mic.fill" size={30} color="#FFFFFF" />
                  </Pressable>
                  <Button
                    title={t('Напиши текстом')}
                    icon="pencil.line"
                    variant="ghost"
                    onPress={() => setLocalText(true)}
                  />
                </>
              ) : recPhase === 'recording' ? (
                <>
                  <View style={styles.recordRow}>
                    <Animated.View
                      style={[styles.recDot, { backgroundColor: theme.danger }, recPulseStyle]}
                    />
                    <ThemedText type="smallBold" style={{ color: theme.danger }}>
                      {timer}
                    </ThemedText>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Остановить запись')}
                    onPress={stopRecording}
                    style={[styles.recordBtn, { backgroundColor: theme.danger }]}>
                    <Icon name="stop.fill" size={26} color="#FFFFFF" />
                  </Pressable>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('Идёт запись — говори')}
                  </ThemedText>
                </>
              ) : (
                // transcribed: распознанный текст РЕДАКТИРУЕМ (B.5).
                <>
                  <TextInput
                    value={typed}
                    onChangeText={onChange}
                    multiline
                    autoCapitalize="sentences"
                    autoCorrect={false}
                    placeholder={t('Распознанный текст — поправь, если нужно')}
                    placeholderTextColor={theme.textSecondary}
                    style={[
                      styles.writeInput,
                      { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement },
                    ]}
                  />
                  <Button
                    title={t('Записать заново')}
                    icon="arrow.counterclockwise"
                    variant="ghost"
                    onPress={() => {
                      onChange('');
                      startRecording();
                    }}
                  />
                </>
              )}
            </>
          ) : (
            // Переходное состояние и результат: ответ ученика крупно (B.2).
            <ThemedText type="subtitle" style={styles.centerText}>
              {typed}
            </ThemedText>
          )}
          {phase === 'grading' ? (
            <Animated.View style={pulseStyle}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Тренер читает…')}
              </ThemedText>
            </Animated.View>
          ) : null}
        </View>

        {/* Карточка фидбека тренера — ПОД полем, механика write (B.2). */}
        {phase === 'done' && verdict ? (
          <OpenAnswerFeedback
            verdict={verdict}
            corrected={note?.corrected ?? ''}
            feedback={note?.feedback ?? ''}
            lang={card.learningLang}
          />
        ) : null}
        {phase === 'done' && fallback ? (
          <FadeIn>
            <View style={[styles.fallbackPlate, { backgroundColor: theme.backgroundElement }]}>
              <Icon
                name={fallback === 'limit' ? 'checkmark.circle.fill' : 'info.circle.fill'}
                size={16}
                color={fallback === 'limit' ? theme.success : theme.textSecondary}
              />
              <ThemedText type="small" themeColor="textSecondary" style={styles.fallbackText}>
                {fallback === 'limit'
                  ? t('Принято ✓')
                  : fallback === 'auth'
                    ? t('Войди, чтобы тренер проверял ответы')
                    : t('Тренер недоступен — ответ сохранён без оценки')}
              </ThemedText>
            </View>
          </FadeIn>
        ) : null}
      </Reveal>
      <View style={styles.footer}>
        {phase === 'done' ? (
          <FadeIn key="next">
            <Button title={last ? t('Завершить') : t('Дальше')} icon="arrow.right" onPress={onNext} />
          </FadeIn>
        ) : phase === 'input' && (textMode || recPhase === 'transcribed') ? (
          <Button title={t('Проверить')} icon="checkmark" onPress={onSubmit} disabled={!typed.trim()} />
        ) : null}
      </View>
    </>
  );
}

/**
 * Карточка фидбека тренера (Э2, спека B.2): вердикт-пилюля → исправленный
 * вариант с озвучкой → объяснение. Токены темы (card/border), тон нейтрально-
 * тренерский: слова «неверно» нет — worst case это «Давай разберём» (primary).
 */
function OpenAnswerFeedback({
  verdict,
  corrected,
  feedback,
  lang,
}: {
  /** Без вердикта (диктант) пилюля не рисуется — штамп уже показан выше. */
  verdict?: GradeVerdict;
  corrected: string;
  feedback: string;
  lang: string;
}) {
  const theme = useTheme();
  const t = useT();
  const pill =
    verdict === 'correct'
      ? { text: t('Отлично!'), fg: theme.success, bg: theme.successSoft }
      : verdict === 'partial'
        ? { text: t('Почти!'), fg: theme.warning, bg: theme.warningSoft }
        : verdict === 'wrong'
          ? { text: t('Давай разберём'), fg: theme.primary, bg: theme.primarySoft }
          : null;

  return (
    <FadeIn>
      <View style={[styles.feedbackCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {pill ? (
          <View style={[styles.feedbackPill, { backgroundColor: pill.bg }]}>
            <ThemedText type="smallBold" style={{ color: pill.fg }}>
              {pill.text}
            </ThemedText>
          </View>
        ) : null}
        {corrected ? (
          <View style={styles.feedbackCorrectedRow}>
            <ThemedText type="default" style={styles.feedbackCorrected}>
              {corrected}
            </ThemedText>
            <SpeakButton text={corrected} language={lang} size={38} />
          </View>
        ) : null}
        {feedback ? (
          <ThemedText type="small" themeColor="textSecondary">
            {feedback}
          </ThemedText>
        ) : null}
      </View>
    </FadeIn>
  );
}

/** Предложение диктанта с выделенным (bold) ключевым словом (B.4). */
function HighlightedSentence({ sentence, word }: { sentence: string; word: string }) {
  // Разбиваем по слову: capture-группа кладёт совпадения в нечётные индексы.
  const parts = useMemo(() => {
    const w = word.trim();
    if (!w) return [sentence];
    try {
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return sentence.split(new RegExp(`\\b(${escaped})\\b`, 'gi'));
    } catch {
      return [sentence];
    }
  }, [sentence, word]);

  return (
    <ThemedText type="default" style={styles.centerText}>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <ThemedText key={i} type="default" style={styles.highlightWord}>
            {p}
          </ThemedText>
        ) : (
          p
        ),
      )}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  centerText: { textAlign: 'center' },

  // Интро (выбор режима) — сверху вниз, выравнивание слева
  intro: { gap: Spacing.three, paddingTop: Spacing.one, paddingBottom: Spacing.four },
  introTitle: { fontSize: 34, lineHeight: 40, fontWeight: '800' },
  // Hero-карточка «Начать тренировку»
  heroCard: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  heroPills: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  pillText: { fontWeight: '700' },
  heroTitle: { fontWeight: '800', marginTop: Spacing.one },
  sectionLabel: {
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: Spacing.one,
    marginBottom: -Spacing.one,
  },
  modeList: { alignSelf: 'stretch', gap: Spacing.two },
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
  // «Напиши сам» — многострочный ввод своего предложения
  writeInput: {
    alignSelf: 'stretch',
    minHeight: 96,
    borderRadius: Radius.md,
    borderWidth: 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 17,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  // Карточка фидбека тренера (B.2)
  feedbackCard: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  feedbackPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
  },
  feedbackCorrectedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  feedbackCorrected: { flex: 1, fontWeight: '600' },
  // «Расскажи о фото» (Э4, B.5): слово под фото, круглая кнопка записи, индикатор
  speakPhotoWord: { flexShrink: 1, textAlign: 'center' },
  recordBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  recDot: { width: 12, height: 12, borderRadius: 6 },
  // Итоги недели от тренера (Э6-клиент)
  digestCard: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  digestHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  digestTitle: { flex: 1 },
  // Плашка-фолбэк («Тренер недоступен», «Принято ✓» и т.п.)
  fallbackPlate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    alignSelf: 'stretch',
  },
  fallbackText: { flex: 1 },
  // Выделенное слово в предложении диктанта (B.4)
  // Изучаемое слово в предложении: жирное И подчёркнутое (решение 12.07).
  highlightWord: { fontWeight: '700', textDecorationLine: 'underline' },

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

  // Лимит тестов (баннер / чип «Premium» / апселл-лист)
  limitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignSelf: 'stretch',
  },
  lockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  lockChipText: { fontWeight: '700' },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.five,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
  },
  sheetActions: { alignSelf: 'stretch', gap: Spacing.two },

  // Карта активности (гитхаб-хитмап)
  activityCard: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activityStreak: { flexDirection: 'row', alignItems: 'center', gap: Spacing.half },
});
