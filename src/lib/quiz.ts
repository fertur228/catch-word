/**
 * Генератор тестов (множественный выбор) для режима «Тест» во вкладке Повторение.
 *
 * Чистые функции без React/БД: на вход — карточки коллекции, на выход — список
 * вопросов с 4 вариантами (ровно один правильный, варианты перемешаны).
 * Дистракторы (неправильные варианты) берём из других карточек, чтобы тест
 * выглядел «настоящим». Если карточек мало — добиваем варианты запасными
 * заглушками, чтобы их всегда было 4.
 *
 * Math.random разрешён (это мок-данные, детерминированность не требуется).
 */
import type { WordCard } from '@/types';

/** Виды вопросов: слово→перевод, перевод→слово, стикер(эмодзи)→слово. */
export type QuizKind = 'wordToTranslation' | 'translationToWord' | 'stickerToWord';

/** Один вопрос теста. */
export interface QuizQuestion {
  /** Уникальный id вопроса (для key в списках). */
  id: string;
  /** Какого вида вопрос. */
  kind: QuizKind;
  /** Карточка, по которой задан вопрос (для озвучки/деталей в UI). */
  card: WordCard;
  /** Что показываем как вопрос: слово / перевод / эмодзи-стикер. */
  prompt: string;
  /** 4 варианта, ровно один correct:true, уже перемешаны. */
  options: { text: string; correct: boolean }[];
}

/** Все виды вопросов — для равномерного чередования по индексу. */
const KINDS: QuizKind[] = ['wordToTranslation', 'translationToWord', 'stickerToWord'];

/** Сколько вопросов в тесте по умолчанию. */
const DEFAULT_COUNT = 10;
/** Сколько всего вариантов в каждом вопросе. */
const OPTION_COUNT = 4;

/**
 * Запасные заглушки, если карточек слишком мало для 3 уникальных дистракторов.
 * Раздельно для вариантов-слов (изучаемый язык) и вариантов-переводов (родной).
 */
const WORD_FILLERS = ['thing', 'object', 'item', 'word', 'place'];
const TRANSLATION_FILLERS = ['предмет', 'вещь', 'слово', 'объект', 'место'];

/** Перемешать массив на месте (Фишер–Йейтс) и вернуть его же. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Какое поле карточки служит «текстом варианта» для данного вида вопроса. */
function answerOf(card: WordCard, kind: QuizKind): string {
  // Для wordToTranslation отвечаем переводом, иначе — словом.
  return kind === 'wordToTranslation' ? card.translation : card.word;
}

/** Что показываем как сам вопрос (подсказку). */
function promptOf(card: WordCard, kind: QuizKind): string {
  if (kind === 'wordToTranslation') return card.word;
  if (kind === 'translationToWord') return card.translation;
  return card.emoji; // stickerToWord — показываем эмодзи-стикер
}

/**
 * Собрать варианты ответа: правильный + 3 уникальных дистрактора, перемешанные.
 * Дистракторы берём из тех же полей других карточек; при нехватке — из заглушек.
 */
function buildOptions(
  card: WordCard,
  pool: WordCard[],
  kind: QuizKind,
): { text: string; correct: boolean }[] {
  const correct = answerOf(card, kind);

  // Кандидаты-дистракторы из других карточек (уникальные, не равные правильному).
  const seen = new Set<string>([correct]);
  const distractors: string[] = [];
  for (const other of shuffle([...pool])) {
    if (other.id === card.id) continue;
    const text = answerOf(other, kind);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    distractors.push(text);
    if (distractors.length >= OPTION_COUNT - 1) break;
  }

  // Если карточек мало — добиваем запасными заглушками подходящего «языка».
  const fillers = kind === 'wordToTranslation' ? TRANSLATION_FILLERS : WORD_FILLERS;
  for (const f of fillers) {
    if (distractors.length >= OPTION_COUNT - 1) break;
    if (seen.has(f)) continue;
    seen.add(f);
    distractors.push(f);
  }

  const options = [
    { text: correct, correct: true },
    ...distractors.map((text) => ({ text, correct: false })),
  ];
  return shuffle(options);
}

/**
 * Построить тест из карточек коллекции.
 * @param cards карточки пользователя (источник вопросов и дистракторов)
 * @param count сколько вопросов нужно (по умолчанию 10; ограничено числом карточек)
 *
 * Виды вопросов чередуем по индексу — получается ровный микс трёх типов.
 * При крошечном пуле дистракторы добиваются заглушками, так что вариантов
 * всегда 4.
 */
export function buildQuiz(cards: WordCard[], count: number = DEFAULT_COUNT): QuizQuestion[] {
  if (cards.length === 0) return [];

  // Берём случайные карточки под вопросы (не больше, чем есть и чем просили).
  const chosen = shuffle([...cards]).slice(0, Math.max(1, Math.min(count, cards.length)));

  return chosen.map((card, i) => {
    const kind = KINDS[i % KINDS.length];
    return {
      id: `${card.id}-${kind}-${i}`,
      kind,
      card,
      prompt: promptOf(card, kind),
      options: buildOptions(card, cards, kind),
    };
  });
}
