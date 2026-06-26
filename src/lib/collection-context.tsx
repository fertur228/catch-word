/**
 * Глобальное состояние коллекции карточек.
 *
 * Оборачивает SQLite (src/lib/db.ts) и держит карточки в состоянии React,
 * чтобы любой экран мог просто вызвать `useCollection()` и получить готовый
 * список + методы добавить/удалить. Подключается один раз в корневом
 * layout (src/app/_layout.tsx).
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
import { getSeedCards } from '@/lib/mock-data';
import type { WordCard } from '@/types';

/** Спека §8: на тарифе Free — 15 сканов всего. Здесь это мок-счётчик. */
const FREE_SCAN_LIMIT = 15;

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
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

export function CollectionProvider({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState<WordCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [scansLeft, setScansLeft] = useState(FREE_SCAN_LIMIT);

  // Первичная загрузка: при пустой БД заливаем стартовые карточки, затем читаем все.
  useEffect(() => {
    let alive = true;
    (async () => {
      if ((await db.countCards()) === 0) {
        for (const seed of getSeedCards()) {
          await db.insertCard(seed);
        }
      }
      const all = await db.getAllCards();
      if (alive) {
        setCards(all);
        setLoading(false);
      }
    })().catch((e) => {
      console.warn('Не удалось загрузить коллекцию:', e);
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const addCard = useCallback(async (card: WordCard) => {
    await db.insertCard(card);
    setCards((prev) => [card, ...prev.filter((c) => c.id !== card.id)]);
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
    }),
    [cards, loading, scansLeft, addCard, removeCard, getById, tryScan],
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
