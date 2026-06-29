/**
 * Группировка карточек по дням для «ленты» во вкладке Коллекция.
 *
 * Чистые функции без React/БД: на вход — карточки, на выход — секции по дням
 * (как для SectionList), новые дни сверху, внутри дня — новые карточки сверху.
 * Заголовки на русском — конкретная дата «число месяц»: «26 июня» (год — только
 * если день не из текущего года: «26 июня 2025»).
 */
import type { WordCard } from '@/types';

/** Секция списка: один календарный день. */
export interface DaySection {
  /** Стабильный ключ дня (год-месяц-день) — для key в списках. */
  key: string;
  /** Заголовок секции на русском. */
  title: string;
  /** Карточки этого дня, новые сверху. */
  data: WordCard[];
}

/** Русские названия месяцев в родительном падеже («26 июня»). */
const MONTHS_RU = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** Ключ локального календарного дня для метки времени (Unix ms). */
function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Заголовок дня — всегда конкретная дата «число месяц» («26 июня»).
 * Год добавляем, только если день не из текущего года («26 июня 2025»),
 * чтобы заголовки за этот год оставались короткими.
 */
function titleForDay(ms: number, now: number): string {
  const d = new Date(ms);
  const base = `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/**
 * Сгруппировать карточки по календарному дню `createdAt`.
 * Секции отсортированы по убыванию даты (новые дни сверху), карточки внутри
 * дня — тоже новые сверху.
 * @param now текущее время (по умолчанию Date.now) — параметр ради тестируемости
 */
export function groupCardsByDay(cards: WordCard[], now: number = Date.now()): DaySection[] {
  // Раскладываем карточки по дням (ключ — локальный календарный день).
  const groups = new Map<string, WordCard[]>();
  for (const card of cards) {
    const key = dayKey(card.createdAt);
    const bucket = groups.get(key);
    if (bucket) bucket.push(card);
    else groups.set(key, [card]);
  }

  const sections: DaySection[] = [];
  for (const [key, data] of groups) {
    // Внутри дня — новые карточки сверху.
    data.sort((a, b) => b.createdAt - a.createdAt);
    sections.push({ key, title: titleForDay(data[0].createdAt, now), data });
  }

  // Новые дни сверху: data[0] — самая свежая карточка дня, дни не пересекаются.
  sections.sort((a, b) => b.data[0].createdAt - a.data[0].createdAt);
  return sections;
}
