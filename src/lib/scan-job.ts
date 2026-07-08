/**
 * Транзиентное состояние ОДНОГО скана: снятый кадр + (позже) результат
 * распознавания и вырезанный стикер. Живёт в памяти между экранами
 * Камера → Распознаю → Результат.
 *
 * Зачем: параметры роутов (URL) не умеют носить картинки/несколько объектов,
 * поэтому через роут передаём только `jobId`, а данные держим здесь.
 *
 * Поток данных:
 *  - Камера снимает фото → createScanJob(photoUri) → jobId.
 *  - Экран «Распознаю…» (Фаза 1) зовёт распознавание + вырезку, кладёт
 *    result/cutoutUri через updateScanJob, и уходит на Результат.
 *  - Результат читает job синхронно (всё уже готово к моменту перехода).
 *  - Нет result → Результат честно берёт мок (приложение работает на любой стадии).
 */

/** Результат распознавания одного предмета (что вернёт бэкенд /recognize). */
export interface ScanResult {
  /** Слово на изучаемом языке. */
  word: string;
  /** Перевод на родной язык. */
  translation: string;
  /** Транскрипция (IPA). */
  ipa: string;
  /** Категория предмета. */
  category?: string | null;
  /** Эмодзи-заглушка (на случай отсутствия картинки). */
  emoji: string;
  /** Примеры употребления (могут быть пустыми). */
  examples: string[];
  /** Короткая заметка-мнемоника (AI, на родном языке). */
  note?: string;
  /** Правдоподобные неправильные переводы — для умного теста. */
  distractors?: string[];
  /** До 3 синонимов на изучаемом языке (показываем при скане). */
  synonyms?: string[];
  /** Слово-цель квеста, которому предмет соответствует семантически (от модели). */
  questMatch?: string;
  /** Перевод/IPA получены автоматически (распознавание/словарь). */
  auto: boolean;
}

/** Режим съёмки: один предмет (по рамке) или вся сцена (несколько предметов). */
export type ScanMode = 'single' | 'scene';

/** Один предмет «пойманной сцены»: его данные + вырезанный стикер. */
export interface SceneItem {
  result: ScanResult;
  cutoutUri?: string | null;
}

/** Один скан «в полёте». */
export interface ScanJob {
  id: string;
  /** Режим: один предмет (по рамке) или вся сцена. По умолчанию single. */
  mode?: ScanMode;
  /** Реальный снятый кадр (file://...). Может отсутствовать (симулятор/ошибка съёмки). */
  photoUri?: string;
  /** Вырезанный стикер: PNG без фона (Фаза 2) либо кроп по рамке (Фаза 1). */
  cutoutUri?: string | null;
  /** Результат распознавания (Фаза 1, режим single). Пусто → Результат берёт мок. */
  result?: ScanResult;
  /** Несколько пойманных предметов (режим scene). */
  items?: SceneItem[];
}

/**
 * Сторона «визира» (рамки наведения) на экране камеры, в points. Единый источник
 * правды: камера рисует ровно такой квадрат, а распознавание/вырезка кропают
 * именно эту область (см. cropToFrame). Меняешь тут — меняется и рамка, и кроп.
 */
export const SCAN_FRAME = 264;

const jobs = new Map<string, ScanJob>();
let counter = 0;

/** Создать скан с (опциональным) снятым кадром. Возвращает jobId для роута. */
export function createScanJob(photoUri?: string, mode: ScanMode = 'single'): string {
  const id = `scan-${Date.now()}-${++counter}`;
  jobs.set(id, { id, photoUri, mode });
  // Не копим память: держим только несколько последних сканов.
  while (jobs.size > 8) {
    const oldest = jobs.keys().next().value;
    if (oldest === undefined) break;
    jobs.delete(oldest);
  }
  return id;
}

/** Прочитать скан по id (или undefined). */
export function getScanJob(id?: string | null): ScanJob | undefined {
  return id ? jobs.get(id) : undefined;
}

/** Дополнить скан (результатом распознавания / вырезкой). */
export function updateScanJob(
  id: string,
  patch: Partial<Omit<ScanJob, 'id'>>,
): ScanJob | undefined {
  const cur = jobs.get(id);
  if (!cur) return undefined;
  const next = { ...cur, ...patch };
  jobs.set(id, next);
  return next;
}
