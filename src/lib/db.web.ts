/**
 * Веб-вариант локальной БД (замена expo-sqlite). ТОТ ЖЕ публичный API, что и
 * db.ts, но поверх `localStorage`. Карточки — JSON-массив под одним ключом,
 * настройки (key_value, включая сессию Supabase) — по ключам с префиксом.
 *
 * Метро на вебе сам берёт этот файл вместо db.ts (расширение `.web.ts`), поэтому
 * экраны/контексты/supabase.ts ничего не меняют — у них тот же `import * as db`.
 *
 * Облако (Supabase `word_cards`) — источник правды при входе, локаль = кэш/оффлайн.
 * На этапе статического рендера (`expo export`) `localStorage` недоступен —
 * используем in-memory заглушку, чтобы пререндер не падал.
 */
import type { WordCard } from '@/types';

const CARDS_KEY = 'cw.cards';
const KV_PREFIX = 'cw.kv.';

// Безопасный доступ к localStorage (на сервере/пререндере его нет → in-memory).
const mem = new Map<string, string>();
const store = {
  get(k: string): string | null {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.getItem(k);
    } catch {
      /* приватный режим / квота — падать нельзя */
    }
    return mem.has(k) ? (mem.get(k) as string) : null;
  },
  set(k: string, v: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(k, v);
        return;
      }
    } catch {
      /* fallthrough на память */
    }
    mem.set(k, v);
  },
  remove(k: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(k);
        return;
      }
    } catch {
      /* fallthrough */
    }
    mem.delete(k);
  },
};

function readCards(): WordCard[] {
  const raw = store.get(CARDS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as WordCard[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeCards(cards: WordCard[]): void {
  store.set(CARDS_KEY, JSON.stringify(cards));
}

export async function getAllCards(): Promise<WordCard[]> {
  return readCards().sort((a, b) => b.createdAt - a.createdAt);
}

export async function getCardById(id: string): Promise<WordCard | null> {
  return readCards().find((c) => c.id === id) ?? null;
}

export async function insertCard(c: WordCard): Promise<void> {
  const cards = readCards().filter((x) => x.id !== c.id);
  cards.unshift(c);
  writeCards(cards);
}

/** Обновить только SRS-поля карточки (после повтора). */
export async function updateCardSrs(
  id: string,
  srs: { dueAt: number; interval: number; ease: number; reps: number; mastery: number },
): Promise<void> {
  writeCards(readCards().map((c) => (c.id === id ? { ...c, ...srs } : c)));
}

export async function deleteCard(id: string): Promise<void> {
  writeCards(readCards().filter((c) => c.id !== id));
}

export async function clearCards(): Promise<void> {
  writeCards([]);
}

export async function clearCardsForPair(learning: string, native: string): Promise<void> {
  writeCards(
    readCards().filter((c) => c.learningLang !== learning || c.nativeLang !== native),
  );
}

export async function countCards(): Promise<number> {
  return readCards().length;
}

// --- Настройки (key_value): язык изучения/родной, онбординг, сессия Supabase ---

export async function getPref(key: string): Promise<string | null> {
  return store.get(KV_PREFIX + key);
}

export async function setPref(key: string, value: string): Promise<void> {
  store.set(KV_PREFIX + key, value);
}

export async function deletePref(key: string): Promise<void> {
  store.remove(KV_PREFIX + key);
}
