/**
 * Глобальное состояние коллекции карточек + пользовательские настройки.
 *
 * Оборачивает SQLite (src/lib/db.ts) и держит данные в состоянии React, чтобы
 * любой экран мог просто вызвать `useCollection()` и получить готовый список
 * карточек, статистику, очередь повторов и методы. Подключается один раз в
 * корневом layout (src/app/_layout.tsx).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/lib/auth-context';
import { useSubscription } from '@/lib/subscription';
import { supabase } from '@/lib/supabase';
import * as db from '@/lib/db';
import {
  clearCloudCardsForPair,
  deleteCloudCard,
  pullCards,
  pushCard,
  uploadSticker,
} from '@/lib/cloud-sync';
import { getDailyQuest, matchesQuest, todayIndex, type DailyQuest } from '@/lib/daily-quest';
import { LEARNING_LANG, NATIVE_LANG, getSeedCards } from '@/lib/mock-data';
import { computeNextReview, freshSrs, isDue, isMastered } from '@/lib/srs';
import type { CollectionStats, SrsRating, UserPrefs, WordCard } from '@/types';

const FREE_SCAN_LIMIT = 10;

/** Ключи настроек в таблице key_value. */
const PREF_LEARNING = 'learning_lang';
const PREF_NATIVE = 'native_lang';
const PREF_ONBOARDED = 'onboarded';
const PREF_QUEST_LAST_DAY = 'quest_last_done_day';
const PREF_QUEST_STREAK = 'quest_streak';
const PREF_SEEDED = 'seeded';

/** Дефолтные настройки до загрузки/первого запуска (демо: English ← Русский). */
const DEFAULT_PREFS: UserPrefs = {
  learningLang: LEARNING_LANG,
  nativeLang: NATIVE_LANG,
  onboarded: false,
};

interface CollectionContextValue {
  cards: WordCard[];
  loading: boolean;
  /** true — у пользователя активная подписка (Polar). */
  isPremium: boolean;
  /** Сколько сканов осталось (для free: 0–10; для premium: 9999). */
  scansLeft: number;
  scanLimit: number;
  addCard: (card: WordCard) => Promise<void>;
  removeCard: (id: string) => Promise<void>;
  /** Удалить все карточки из коллекции. */
  clearCollection: () => Promise<void>;
  getById: (id: string) => WordCard | undefined;
  /** Списать один скан. Возвращает false, если лимит исчерпан. */
  tryScan: () => boolean;
  /** Вернуть один скан (если распознавание не удалось — не «сжигаем» на ошибке). */
  refundScan: () => void;
  /** Пометить лимит исчерпанным (сервер вернул 402) — заблокировать до пейволла. */
  markScansExhausted: () => void;

  // --- Настройки пользователя (онбординг/языки) ---
  prefs: UserPrefs;
  /** Сохранить выбранные языки (изучения и родной). */
  setLanguages: (learning: string, native: string) => Promise<void>;
  /** Отметить онбординг пройденным (после выбора языка). */
  completeOnboarding: () => Promise<void>;

  // --- Повторение (SRS, спека §5.6) ---
  /** Сводная статистика для дашборда/вкладок. */
  stats: CollectionStats;
  /** Карточки, которые пора повторить (dueAt<=now), самые «просроченные» сверху. */
  dueCards: WordCard[];
  /** Оценить карточку в сессии повтора — пересчитать SRS и сохранить. */
  reviewCard: (id: string, rating: SrsRating) => Promise<void>;

  // --- Ежедневный квест ---
  /** Сегодняшний квест (что найти и сфотографировать). */
  dailyQuest: DailyQuest;
  /** Выполнен ли квест сегодня. */
  questDoneToday: boolean;
  /** Текущая серия выполненных квестов (дней подряд). */
  questStreak: number;
  /** Засчитать квест, если слово совпало с целью. true — если только что выполнен. */
  completeQuestForWord: (word: string) => Promise<boolean>;
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

/** Простая «серия» дней: сколько дней подряд (включая сегодня) ловили слова. */
function computeStreak(cards: WordCard[]): number {
  if (cards.length === 0) return 0;
  const DAY = 86_400_000;
  // Множество дней (в локальных «индексах дня»), когда добавляли карточки.
  const days = new Set(cards.map((c) => Math.floor(c.createdAt / DAY)));
  const today = Math.floor(Date.now() / DAY);
  let streak = 0;
  // Серия активна, если ловили сегодня или вчера (даём фору в 1 день).
  let cursor = days.has(today) ? today : today - 1;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

/**
 * Локальная картинка, которую нужно залить в Storage: нативный файл (file://, /)
 * или веб data/blob URL (вырез на вебе приходит как data URL).
 */
function needsUpload(uri?: string | null): uri is string {
  return (
    !!uri &&
    (uri.startsWith('file://') ||
      uri.startsWith('/') ||
      uri.startsWith('data:') ||
      uri.startsWith('blob:'))
  );
}

export function CollectionProvider({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState<WordCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [scansLeft, setScansLeft] = useState(FREE_SCAN_LIMIT);
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
  const [questLastDay, setQuestLastDay] = useState(-1);
  const [questStreak, setQuestStreak] = useState(0);

  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const { isPremium } = useSubscription();
  // Текущие карточки в ref — чтобы эффект синхронизации не перезапускался на каждое изменение.
  const cardsRef = useRef<WordCard[]>([]);
  cardsRef.current = cards;

  // Первичная загрузка: настройки + карточки (при пустой БД заливаем стартовые).
  useEffect(() => {
    let alive = true;
    (async () => {
      // 1) Настройки + статус ежедневного квеста.
      const [learning, native, onboarded, questDayStr, questStreakStr] = await Promise.all([
        db.getPref(PREF_LEARNING),
        db.getPref(PREF_NATIVE),
        db.getPref(PREF_ONBOARDED),
        db.getPref(PREF_QUEST_LAST_DAY),
        db.getPref(PREF_QUEST_STREAK),
      ]);
      // 2) Карточки: стартовые сидим только при ПЕРВОМ запуске. После ручной
      //    очистки коллекции (флаг 'seeded') заново не создаём.
      const seeded = await db.getPref(PREF_SEEDED);
      if (seeded !== 'true' && (await db.countCards()) === 0) {
        for (const seed of getSeedCards()) {
          await db.insertCard(seed);
        }
      }
      if (seeded !== 'true') await db.setPref(PREF_SEEDED, 'true');
      const all = await db.getAllCards();
      if (!alive) return;
      setPrefs({
        learningLang: learning ?? DEFAULT_PREFS.learningLang,
        nativeLang: native ?? DEFAULT_PREFS.nativeLang,
        onboarded: onboarded === 'true',
      });
      setQuestLastDay(questDayStr ? parseInt(questDayStr, 10) : -1);
      setQuestStreak(questStreakStr ? parseInt(questStreakStr, 10) : 0);
      setCards(all);
      setLoading(false);
    })().catch((e) => {
      console.warn('Не удалось загрузить коллекцию:', e);
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const addCard = useCallback(
    async (card: WordCard) => {
      // Гарантируем, что у новой карточки есть SRS-поля (если экран их не задал).
      let withSrs: WordCard = card.dueAt == null ? { ...card, ...freshSrs(card.createdAt) } : card;
      // Вошли — грузим стикер в Storage и сохраняем публичный URL (виден на всех устройствах).
      if (userId && needsUpload(withSrs.imageUri)) {
        const url = await uploadSticker(withSrs.imageUri, userId, withSrs.id);
        if (url) withSrs = { ...withSrs, imageUri: url };
      }
      await db.insertCard(withSrs);
      setCards((prev) => [withSrs, ...prev.filter((c) => c.id !== withSrs.id)]);
      if (userId) pushCard(userId, withSrs).catch(() => {});
    },
    [userId],
  );

  const removeCard = useCallback(
    async (id: string) => {
      await db.deleteCard(id);
      setCards((prev) => prev.filter((c) => c.id !== id));
      if (userId) deleteCloudCard(userId, id).catch(() => {});
    },
    [userId],
  );

  const getById = useCallback((id: string) => cards.find((c) => c.id === id), [cards]);

  // При входе: подтянуть облако, слить с локальным; локальные-уникальные — залить.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      try {
        const cloud = await pullCards(userId);
        if (!alive) return;
        const cloudById = new Map(cloud.map((c) => [c.id, c] as const));
        const local = cardsRef.current;
        // Локальные «реальные» карточки (не демо-сиды), которых нет в облаке — заливаем.
        for (const c of local) {
          if (c.id.startsWith('seed-') || cloudById.has(c.id)) continue;
          let card = c;
          if (needsUpload(card.imageUri)) {
            const url = await uploadSticker(card.imageUri, userId, card.id);
            if (url) card = { ...card, imageUri: url };
          }
          await pushCard(userId, card);
          cloudById.set(card.id, card);
        }
        // Облачные карточки сохраняем локально (облако — источник правды).
        for (const c of cloud) await db.insertCard(c);
        if (!alive) return;
        const merged = new Map<string, WordCard>();
        for (const c of local) merged.set(c.id, c);
        for (const [id, c] of cloudById) merged.set(id, c);
        setCards(Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt));
      } catch (e) {
        console.warn('Синхронизация при входе не удалась:', e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const tryScan = useCallback(() => {
    if (isPremium) return true;
    if (scansLeft <= 0) return false;
    setScansLeft((n) => Math.max(0, n - 1));
    return true;
  }, [isPremium, scansLeft]);

  const refundScan = useCallback(() => {
    if (isPremium) return;
    setScansLeft((n) => Math.min(FREE_SCAN_LIMIT, n + 1));
  }, [isPremium]);

  const markScansExhausted = useCallback(() => setScansLeft(0), []);

  // Серверный остаток бесплатных сканов для ВОШЕДШЕГО free-пользователя.
  // (Гость — счётчик локальный; premium — безлимит.) Делает счётчик устойчивым к
  // рефрешу и синхронным между устройствами. Authoritative-проверка всё равно на
  // сервере (edge `recognize` + RPC `consume_scan`) — это лишь точное отображение.
  useEffect(() => {
    if (!userId || isPremium) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('scan_usage')
          .select('used')
          .eq('user_id', userId)
          .maybeSingle();
        if (!alive || !data) return;
        setScansLeft(Math.max(0, FREE_SCAN_LIMIT - (data.used ?? 0)));
      } catch {
        /* сеть недоступна — оставляем текущее значение */
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, isPremium]);

  // Очистить коллекцию ТЕКУЩЕГО курса (активной пары языков). Слова других
  // пар остаются. Стартовые после этого не пересоздаются.
  const clearCollection = useCallback(async () => {
    const { learningLang, nativeLang } = prefs;
    await db.clearCardsForPair(learningLang, nativeLang);
    setCards((prev) =>
      prev.filter((c) => c.learningLang !== learningLang || c.nativeLang !== nativeLang),
    );
    if (userId) clearCloudCardsForPair(userId, learningLang, nativeLang).catch(() => {});
  }, [userId, prefs]);

  const setLanguages = useCallback(async (learning: string, native: string) => {
    await Promise.all([db.setPref(PREF_LEARNING, learning), db.setPref(PREF_NATIVE, native)]);
    setPrefs((p) => ({ ...p, learningLang: learning, nativeLang: native }));
  }, []);

  const completeOnboarding = useCallback(async () => {
    await db.setPref(PREF_ONBOARDED, 'true');
    setPrefs((p) => ({ ...p, onboarded: true }));
  }, []);

  const reviewCard = useCallback(
    async (id: string, rating: SrsRating) => {
      const current = cards.find((c) => c.id === id);
      if (!current) return;
      const srs = computeNextReview(rating, current);
      await db.updateCardSrs(id, srs);
      const updated = { ...current, ...srs };
      setCards((prev) => prev.map((c) => (c.id === id ? updated : c)));
      if (userId) pushCard(userId, updated).catch(() => {});
    },
    [cards, userId],
  );

  // Ежедневный квест: что сегодня найти и сфотографировать (стабилен в течение сессии).
  const dailyQuest = useMemo(() => getDailyQuest(), []);

  const completeQuestForWord = useCallback(
    async (word: string): Promise<boolean> => {
      const today = todayIndex();
      if (questLastDay === today) return false; // уже выполнен сегодня
      if (!matchesQuest(word, dailyQuest)) return false;
      // Серия: если предыдущий квест был вчера — продолжаем, иначе начинаем заново.
      const newStreak = questLastDay === today - 1 ? questStreak + 1 : 1;
      await Promise.all([
        db.setPref(PREF_QUEST_LAST_DAY, String(today)),
        db.setPref(PREF_QUEST_STREAK, String(newStreak)),
      ]);
      setQuestLastDay(today);
      setQuestStreak(newStreak);
      return true;
    },
    [questLastDay, questStreak, dailyQuest],
  );

  // «Курс» = активная пара языков. Внутри `cards` лежат карточки ВСЕХ пар
  // (так проще для облачной синхронизации), но наружу — на экраны, в статистику
  // и в очередь повтора — отдаём только слова текущей пары. Сменил пару в
  // Настройках → мгновенно открылась её коллекция (как переключение курса в Duolingo).
  const scopedCards = useMemo(
    () =>
      cards.filter(
        (c) => c.learningLang === prefs.learningLang && c.nativeLang === prefs.nativeLang,
      ),
    [cards, prefs.learningLang, prefs.nativeLang],
  );

  // Производные данные считаются по активному курсу (scopedCards).
  const dueCards = useMemo(
    () => scopedCards.filter((c) => isDue(c)).sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0)),
    [scopedCards],
  );

  const stats = useMemo<CollectionStats>(
    () => ({
      total: scopedCards.length,
      mastered: scopedCards.filter(isMastered).length,
      dueCount: dueCards.length,
      streak: computeStreak(scopedCards),
    }),
    [scopedCards, dueCards.length],
  );

  const value = useMemo<CollectionContextValue>(() => {
    const today = todayIndex();
    return {
      cards: scopedCards,
      loading,
      isPremium,
      scansLeft: isPremium ? 9999 : scansLeft,
      scanLimit: isPremium ? 9999 : FREE_SCAN_LIMIT,
      addCard,
      removeCard,
      clearCollection,
      getById,
      tryScan,
      refundScan,
      markScansExhausted,
      prefs,
      setLanguages,
      completeOnboarding,
      stats,
      dueCards,
      reviewCard,
      dailyQuest,
      questDoneToday: questLastDay === today,
      // Серия активна, если квест выполняли сегодня или вчера; иначе обнулена.
      questStreak: questLastDay >= today - 1 ? questStreak : 0,
      completeQuestForWord,
    };
  }, [
    scopedCards,
    loading,
    isPremium,
    scansLeft,
    addCard,
    removeCard,
    clearCollection,
    getById,
    tryScan,
    refundScan,
    markScansExhausted,
    prefs,
    setLanguages,
    completeOnboarding,
    stats,
    dueCards,
    reviewCard,
    dailyQuest,
    questLastDay,
    questStreak,
    completeQuestForWord,
  ]);

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

export function useCollection(): CollectionContextValue {
  const ctx = useContext(CollectionContext);
  if (!ctx) {
    throw new Error('useCollection нужно вызывать внутри <CollectionProvider>');
  }
  return ctx;
}
