/**
 * Ежедневный квест: «найди и сфотографируй определённую вещь».
 *
 * Цель на день выбирается ДЕТЕРМИНИРОВАННО по номеру дня — у всех одинаковая,
 * не зависит от рандома и переживает перезапуск. Прогресс/серия хранятся в
 * key_value через useCollection() (см. collection-context).
 */
import { RECOGNIZABLE } from '@/lib/mock-data';

const DAY_MS = 86_400_000;

/** Пул «находимых» предметов для квестов (слова из RECOGNIZABLE). */
const QUEST_WORDS = [
  'book', 'coffee', 'chair', 'phone', 'laptop', 'key', 'clock', 'lamp', 'pencil', 'shoe',
  'backpack', 'umbrella', 'mirror', 'cat', 'flower', 'car', 'headphones', 'door', 'window', 'sofa',
];

export interface DailyQuest {
  /** Слово-цель на изучаемом языке. */
  word: string;
  /** Эмодзи предмета. */
  emoji: string;
  /** Перевод на родной язык. */
  translation: string;
  /** Категория предмета. */
  category: string | null;
  /** Транскрипция. */
  ipa: string;
  /** Номер дня (для серии и хранения статуса). */
  dayIndex: number;
}

/** Текущий «номер дня» (UTC-сутки). */
export function todayIndex(): number {
  return Math.floor(Date.now() / DAY_MS);
}

/** Сколько миллисекунд осталось до смены квеста (конца текущих суток). */
export function msUntilQuestReset(): number {
  const nextDayStart = (todayIndex() + 1) * DAY_MS;
  return Math.max(0, nextDayStart - Date.now());
}

/** Сегодняшний квест. */
export function getDailyQuest(): DailyQuest {
  const idx = todayIndex();
  const word = QUEST_WORDS[idx % QUEST_WORDS.length];
  const entry = RECOGNIZABLE.find((r) => r.word === word) ?? RECOGNIZABLE[0];
  return {
    word: entry.word,
    emoji: entry.emoji,
    translation: entry.translation,
    category: entry.category ?? null,
    ipa: entry.ipa,
    dayIndex: idx,
  };
}

/** Совпадает ли распознанное слово с целью квеста (мягкое сравнение). */
export function matchesQuest(word: string, quest: DailyQuest): boolean {
  const a = word.trim().toLowerCase();
  const b = quest.word.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}
