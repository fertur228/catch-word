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
  useState,
  type ReactNode,
} from 'react';

import * as db from '@/lib/db';
import { LEARNING_LANG, NATIVE_LANG, getSeedCards } from '@/lib/mock-data';
import { computeNextReview, freshSrs, isDue } from '@/lib/srs';
import type { CollectionStats, SrsRating, UserPrefs, WordCard } from '@/types';

/** Спека §8: на тарифе Free — 15 сканов всего. Здесь это мок-счётчик. */
const FREE_SCAN_LIMIT = 15;

/** Ключи настроек в таблице key_value. */
const PREF_LEARNING = 'learning_lang';
const PREF_NATIVE = 'native_lang';
const PREF_ONBOARDED = 'onboarded';

/** Дефолтные настройки до загрузки/первого запуска (демо: English ← Русский). */
const DEFAULT_PREFS: UserPrefs = {
  learningLang: LEARNING_LANG,
  nativeLang: NATIVE_LANG,
  onboarded: false,
};

interface CollectionContextValue {
  cards: WordCard[];
  loading: boolean;
  /** Сколько бесплатных сканов осталось (мок; реальный учёт — на бэкенде, §7.3). */
  scansLeft: number;
  scanLimit: number;
  addCard: (card: WordCard) => Promise<void>;
  removeCard: (id: string) => Promise<void>;
  getById: (id: string) => WordCard | undefined;
  /** Списать один скан. Возвращает false, если лимит исчерпан. */
  tryScan: () => boolean;

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

export function CollectionProvider({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState<WordCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [scansLeft, setScansLeft] = useState(FREE_SCAN_LIMIT);
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);

  // Первичная загрузка: настройки + карточки (при пустой БД заливаем стартовые).
  useEffect(() => {
    let alive = true;
    (async () => {
      // 1) Настройки.
      const [learning, native, onboarded] = await Promise.all([
        db.getPref(PREF_LEARNING),
        db.getPref(PREF_NATIVE),
        db.getPref(PREF_ONBOARDED),
      ]);
      // 2) Карточки (сидим стартовые при первом запуске).
      if ((await db.countCards()) === 0) {
        for (const seed of getSeedCards()) {
          await db.insertCard(seed);
        }
      }
      const all = await db.getAllCards();
      if (!alive) return;
      setPrefs({
        learningLang: learning ?? DEFAULT_PREFS.learningLang,
        nativeLang: native ?? DEFAULT_PREFS.nativeLang,
        onboarded: onboarded === 'true',
      });
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

  const addCard = useCallback(async (card: WordCard) => {
    // Гарантируем, что у новой карточки есть SRS-поля (если экран их не задал).
    const withSrs: WordCard =
      card.dueAt == null ? { ...card, ...freshSrs(card.createdAt) } : card;
    await db.insertCard(withSrs);
    setCards((prev) => [withSrs, ...prev.filter((c) => c.id !== withSrs.id)]);
  }, []);

  const removeCard = useCallback(async (id: string) => {
    await db.deleteCard(id);
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const getById = useCallback((id: string) => cards.find((c) => c.id === id), [cards]);

  const tryScan = useCallback(() => {
    if (scansLeft <= 0) return false;
    setScansLeft((n) => Math.max(0, n - 1));
    return true;
  }, [scansLeft]);

  const setLanguages = useCallback(async (learning: string, native: string) => {
    await Promise.all([db.setPref(PREF_LEARNING, learning), db.setPref(PREF_NATIVE, native)]);
    setPrefs((p) => ({ ...p, learningLang: learning, nativeLang: native }));
  }, []);

  const completeOnboarding = useCallback(async () => {
    await db.setPref(PREF_ONBOARDED, 'true');
    setPrefs((p) => ({ ...p, onboarded: true }));
  }, []);

  const reviewCard = useCallback(async (id: string, rating: SrsRating) => {
    const current = cards.find((c) => c.id === id);
    if (!current) return;
    const srs = computeNextReview(rating, current);
    await db.updateCardSrs(id, srs);
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...srs } : c)));
  }, [cards]);

  // Производные данные (пересчитываются при изменении карточек).
  const dueCards = useMemo(
    () => cards.filter((c) => isDue(c)).sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0)),
    [cards],
  );

  const stats = useMemo<CollectionStats>(
    () => ({
      total: cards.length,
      mastered: cards.filter((c) => (c.mastery ?? 0) >= 4).length,
      dueCount: dueCards.length,
      streak: computeStreak(cards),
    }),
    [cards, dueCards.length],
  );

  const value = useMemo<CollectionContextValue>(
    () => ({
      cards,
      loading,
      scansLeft,
      scanLimit: FREE_SCAN_LIMIT,
      addCard,
      removeCard,
      getById,
      tryScan,
      prefs,
      setLanguages,
      completeOnboarding,
      stats,
      dueCards,
      reviewCard,
    }),
    [
      cards,
      loading,
      scansLeft,
      addCard,
      removeCard,
      getById,
      tryScan,
      prefs,
      setLanguages,
      completeOnboarding,
      stats,
      dueCards,
      reviewCard,
    ],
  );

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

export function useCollection(): CollectionContextValue {
  const ctx = useContext(CollectionContext);
  if (!ctx) {
    throw new Error('useCollection нужно вызывать внутри <CollectionProvider>');
  }
  return ctx;
}
