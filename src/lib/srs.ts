/**
 * SRS — интервальное повторение (спека §5.6, «SM-2-lite»).
 *
 * Чистые функции без побочных эффектов: на вход — оценка пользователя и текущее
 * состояние карточки, на выход — новое состояние (когда повторить снова и т.п.).
 * Сохранение в БД и работа с React — снаружи (collection-context).
 *
 * Интервалы считаем в МИНУТАХ (так удобно для коротких шагов вроде «через 10 мин»),
 * а наружу отдаём ещё и `dueAt` — абсолютное время следующего повтора (Unix ms).
 */
import type { SrsRating, WordCard } from '@/types';

/** Одна минута в миллисекундах. */
const MIN = 60_000;
/** Один день в минутах. */
const DAY = 1440;

/** Дефолтная «лёгкость» новой карточки (как в SM-2). */
const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;

/** Результат пересчёта SRS. */
export interface SrsUpdate {
  /** Новый интервал до следующего повтора, в минутах. */
  interval: number;
  /** Новая «лёгкость» (множитель роста интервала). */
  ease: number;
  /** Сколько успешных повторов подряд. */
  reps: number;
  /** Абсолютное время следующего повтора (Unix ms). */
  dueAt: number;
  /** Уровень освоения 0..5 (для звёзд/прогресса в UI). */
  mastery: number;
}

/** Зажать «лёгкость» в разумные пределы. */
function clampEase(e: number): number {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, e));
}

/** Интервал (в минутах) для оценки «good» — мягкое «выпускание» карточки. */
function goodInterval(reps: number, prevInterval: number, ease: number): number {
  if (reps <= 1) return 1 * DAY; // первый успех → завтра
  if (reps === 2) return 3 * DAY; // затем через 3 дня
  if (reps === 3) return 7 * DAY; // затем через неделю
  return Math.round(prevInterval * ease); // дальше растём по SM-2
}

/** Интервал (в минутах) для оценки «easy» — рост быстрее, чем у «good». */
function easyInterval(reps: number, prevInterval: number, ease: number): number {
  if (reps <= 1) return 4 * DAY; // легко с первого раза → сразу через 4 дня
  return Math.round(prevInterval * ease * 1.3);
}

/**
 * Пересчитать состояние карточки после оценки пользователя.
 * @param rating оценка: 'again' (забыл) | 'good' (вспомнил) | 'easy' (легко)
 * @param card   текущая карточка (берём её srs-поля; отсутствующие → дефолты)
 * @param now    текущее время (по умолчанию Date.now) — параметр ради тестируемости
 */
export function computeNextReview(
  rating: SrsRating,
  card: Pick<WordCard, 'ease' | 'reps' | 'interval' | 'mastery'>,
  now: number = Date.now(),
): SrsUpdate {
  const prevEase = card.ease ?? DEFAULT_EASE;
  const prevReps = card.reps ?? 0;
  const prevInterval = card.interval ?? 0;
  const prevMastery = card.mastery ?? 0;

  let ease: number;
  let reps: number;
  let interval: number;
  let mastery: number;

  if (rating === 'again') {
    // Забыл — откатываемся: повтор через 10 минут, освоение чуть падает.
    reps = 0;
    interval = 10;
    ease = clampEase(prevEase - 0.2);
    mastery = Math.max(0, prevMastery - 1);
  } else if (rating === 'good') {
    reps = prevReps + 1;
    ease = clampEase(prevEase);
    interval = goodInterval(reps, prevInterval, ease);
    mastery = Math.min(5, prevMastery + 1);
  } else {
    // easy — растём быстрее и сильнее поднимаем освоение.
    reps = prevReps + 1;
    ease = clampEase(prevEase + 0.15);
    interval = easyInterval(reps, prevInterval, ease);
    mastery = Math.min(5, prevMastery + 2);
  }

  return { interval, ease, reps, mastery, dueAt: now + interval * MIN };
}

/**
 * Начальное SRS-состояние для только что пойманной карточки.
 * `dueAt = now` — слово сразу доступно к повтору (приятно для демо: вкладка
 * «Повторение» наполняется по мере того, как ловишь слова).
 */
export function freshSrs(now: number = Date.now()): SrsUpdate {
  return { interval: 0, ease: DEFAULT_EASE, reps: 0, mastery: 0, dueAt: now };
}

/** Пора ли повторять карточку прямо сейчас. */
export function isDue(card: Pick<WordCard, 'dueAt'>, now: number = Date.now()): boolean {
  return (card.dueAt ?? 0) <= now;
}

/** Сколько НОВЫХ слов подмешивать в одну сессию. */
const NEW_PER_SESSION = 6;

/** Есть ли что учить/повторять: новые слова или просроченные по забыванию. */
export function hasReviewWork(cards: WordCard[], now: number = Date.now()): boolean {
  return cards.some((c) => (c.reps ?? 0) === 0 || isDue(c, now));
}

/** Перемешать копию массива (Фишер–Йейтс). */
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Простая сборка сессии: к НОВЫМ словам (reps=0) подмешиваем СТАРЫЕ, которым уже
 * пора (прошёл их «период полузабывания» — интервал), и всё перемешиваем. Если
 * набралось мало — добираем слова, которые ближе всего к повтору (по dueAt).
 * Так каждая сессия = немного нового + освежение старого, вперемешку.
 */
export function buildSessionQueue(
  cards: WordCard[],
  size = 20,
  now: number = Date.now(),
): WordCard[] {
  const isNew = (c: WordCard) => (c.reps ?? 0) === 0;
  const news = shuffled(cards.filter(isNew));
  const dueOld = shuffled(cards.filter((c) => !isNew(c) && isDue(c, now)));

  // Ядро: несколько новых + все просроченные старые.
  const picked = [...news.slice(0, NEW_PER_SESSION), ...dueOld];
  const inSession = new Set(picked.map((c) => c.id));

  // Мало? Добираем словами, которые ближе всего к забыванию (раньше всех due).
  if (picked.length < size) {
    const rest = cards
      .filter((c) => !inSession.has(c.id))
      .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
    for (const c of rest) {
      if (picked.length >= size) break;
      picked.push(c);
      inSession.add(c.id);
    }
  }

  // Перемешиваем новые и старые вместе и режем до размера сессии.
  return shuffled(picked).slice(0, size);
}

/** Порог освоения: с этого уровня mastery слово считается «выученным». */
export const MASTERY_LEARNED = 4;

/** Выучено ли слово (mastery достиг порога освоения). */
export function isMastered(card: Pick<WordCard, 'mastery'>): boolean {
  return (card.mastery ?? 0) >= MASTERY_LEARNED;
}
