/**
 * Генератор тестов (множественный выбор) для режима «Тест» во вкладке Повторение.
 *
 * Форматы вопросов — разные, как в Duolingo:
 *  - wordToTranslation   — слово → выбрать перевод (текст);
 *  - translationToWord   — перевод → выбрать слово (текст);
 *  - imageToWord         — фото/стикер → выбрать слово (текст);
 *  - imageToTranslation  — фото/стикер → выбрать перевод (текст);
 *  - audioToWord         — ЧИСТО АУДИО → выбрать слово (текст);
 *  - audioToTranslation  — аудио → выбрать перевод (текст);
 *  - translationToImage  — перевод → выбрать КАРТИНКУ (варианты-картинки);
 *  - clozeExample        — пример с пропуском «____» → выбрать слово.
 *
 * Чистые функции без React/БД. Math.random разрешён (мок-данные).
 */
import type { WordCard } from '@/types';

/** Виды вопросов. */
export type QuizKind =
  | 'wordToTranslation'
  | 'translationToWord'
  | 'imageToWord'
  | 'imageToTranslation'
  | 'audioToWord'
  | 'audioToTranslation'
  | 'translationToImage'
  | 'clozeExample';

/** Как показываем сам вопрос. */
export type PromptMode = 'text' | 'image' | 'audio' | 'cloze';
/** Как показываем варианты ответа. */
export type OptionMode = 'text' | 'image';

/** Один вариант ответа. */
export interface QuizOption {
  correct: boolean;
  /** Текст варианта (слово/перевод); для картинок — слово (подпись/озвучка). */
  text: string;
  /** Карточка для варианта-картинки (рисуем её стикер/фото). */
  card?: WordCard;
}

/** Один вопрос теста. */
export interface QuizQuestion {
  id: string;
  kind: QuizKind;
  /** Карточка, по которой задан вопрос (для озвучки/деталей). */
  card: WordCard;
  /** Подпись-вопрос («Как переводится?» и т.п.). */
  label: string;
  /** Как показываем вопрос. */
  promptMode: PromptMode;
  /** Текст вопроса (для text/cloze); для image/audio — пустая строка. */
  prompt: string;
  /** Как показываем варианты. */
  optionMode: OptionMode;
  /** Варианты: ровно один correct, уже перемешаны. */
  options: QuizOption[];
}

/** Сколько вопросов по умолчанию и сколько всего вариантов. */
const DEFAULT_COUNT = 10;
const OPTION_COUNT = 4;

/** Виды, где правильный ответ — это ПЕРЕВОД (иначе — слово). */
const TRANSLATION_ANSWER = new Set<QuizKind>([
  'wordToTranslation',
  'imageToTranslation',
  'audioToTranslation',
]);

/** Порядок чередования форматов (берём первый подходящий для карточки). */
const ROTATION: QuizKind[] = [
  'wordToTranslation',
  'audioToWord',
  'imageToTranslation',
  'clozeExample',
  'translationToWord',
  'audioToTranslation',
  'translationToImage',
  'imageToWord',
];

/** Запасные заглушки, если карточек мало (раздельно: слова / переводы). */
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

/** Поле-«ответ» для вида вопроса: перевод или слово. */
function answerOf(card: WordCard, kind: QuizKind): string {
  return TRANSLATION_ANSWER.has(kind) ? card.translation : card.word;
}

/** Подпись-вопрос. */
function labelOf(kind: QuizKind): string {
  switch (kind) {
    case 'wordToTranslation':
    case 'imageToTranslation':
      return 'Как переводится?';
    case 'audioToTranslation':
      return 'Услышал слово — как переводится?';
    case 'translationToWord':
      return 'Какое это слово?';
    case 'imageToWord':
      return 'Что на картинке?';
    case 'audioToWord':
      return 'Что ты услышал?';
    case 'translationToImage':
      return 'Выбери картинку';
    case 'clozeExample':
      return 'Вставь пропущенное слово';
  }
}

/** Как показываем вопрос для данного вида. */
function promptModeOf(kind: QuizKind): PromptMode {
  if (kind === 'imageToWord' || kind === 'imageToTranslation') return 'image';
  if (kind === 'audioToWord' || kind === 'audioToTranslation') return 'audio';
  if (kind === 'clozeExample') return 'cloze';
  return 'text';
}

/** Текст вопроса (для text/cloze). */
function promptTextOf(card: WordCard, kind: QuizKind): string {
  if (kind === 'wordToTranslation') return card.word;
  if (kind === 'translationToWord' || kind === 'translationToImage') return card.translation;
  if (kind === 'clozeExample') return clozeSentence(card) ?? '';
  return '';
}

/** Экранировать спецсимволы для RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Первый пример с заменой слова на «____», или null если подходящего нет. */
function clozeSentence(card: WordCard): string | null {
  const w = card.word.trim();
  if (!w) return null;
  const re = new RegExp(`\\b${escapeRe(w)}\\b`, 'i');
  for (const ex of card.examples ?? []) {
    if (re.test(ex)) return ex.replace(re, '____');
  }
  return null;
}

/** «Визуальный ключ» карточки — чтобы варианты-картинки были различимы. */
function visualKey(c: WordCard): string {
  return c.imageUri ? `img:${c.imageUri}` : `cat:${c.category ?? '—'}`;
}

/** Текстовые варианты: правильный + 3 дистрактора (AI → тема → пул → заглушки). */
function buildTextOptions(card: WordCard, pool: WordCard[], kind: QuizKind): QuizOption[] {
  const correct = answerOf(card, kind);
  const seen = new Set<string>([correct]);
  const distractors: string[] = [];
  const full = () => distractors.length >= OPTION_COUNT - 1;
  const add = (text?: string) => {
    const t = (text ?? '').trim();
    if (!t || seen.has(t) || full()) return;
    seen.add(t);
    distractors.push(t);
  };

  if (TRANSLATION_ANSWER.has(kind) && card.distractors) {
    for (const d of shuffle([...card.distractors])) add(d);
  }
  if (card.category && !full()) {
    const sameCat = shuffle(pool.filter((o) => o.id !== card.id && o.category === card.category));
    for (const other of sameCat) add(answerOf(other, kind));
  }
  if (!full()) {
    for (const other of shuffle([...pool])) {
      if (other.id !== card.id) add(answerOf(other, kind));
    }
  }
  const fillers = TRANSLATION_ANSWER.has(kind) ? TRANSLATION_FILLERS : WORD_FILLERS;
  for (const f of fillers) add(f);

  return shuffle([
    { correct: true, text: correct },
    ...distractors.map((text) => ({ correct: false, text })),
  ]);
}

/**
 * Варианты-картинки (translationToImage): правильная карточка + 3 ВИЗУАЛЬНО
 * различимые. null, если в пуле не набирается 4 различимых картинки.
 */
function buildImageOptions(card: WordCard, pool: WordCard[]): QuizOption[] | null {
  const seen = new Set<string>([visualKey(card)]);
  const picks: WordCard[] = [];
  for (const other of shuffle([...pool])) {
    if (picks.length >= OPTION_COUNT - 1) break;
    if (other.id === card.id) continue;
    const key = visualKey(other);
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push(other);
  }
  if (picks.length < OPTION_COUNT - 1) return null;
  return shuffle([
    { correct: true, text: card.word, card },
    ...picks.map((c) => ({ correct: false, text: c.word, card: c })),
  ]);
}

/** Подходит ли формат данной карточке/пулу. */
function isValid(card: WordCard, pool: WordCard[], kind: QuizKind): boolean {
  if (kind === 'clozeExample') return clozeSentence(card) != null;
  if (kind === 'translationToImage') return buildImageOptions(card, pool) != null;
  return true;
}

/** Собрать один вопрос выбранного вида. */
function makeQuestion(card: WordCard, pool: WordCard[], kind: QuizKind, i: number): QuizQuestion {
  const optionMode: OptionMode = kind === 'translationToImage' ? 'image' : 'text';
  const options =
    optionMode === 'image'
      ? (buildImageOptions(card, pool) ?? buildTextOptions(card, pool, 'translationToWord'))
      : buildTextOptions(card, pool, kind);
  return {
    id: `${card.id}-${kind}-${i}`,
    kind,
    card,
    label: labelOf(kind),
    promptMode: promptModeOf(kind),
    prompt: promptTextOf(card, kind),
    optionMode,
    options,
  };
}

/**
 * Построить тест из карточек коллекции.
 * @param cards карточки под вопросы
 * @param count сколько вопросов (по умолчанию 10; не больше числа карточек)
 * @param pool  пул для дистракторов/картинок (по умолчанию — те же карточки)
 *
 * Формат вопроса выбираем по «вращению» ROTATION, беря первый подходящий для
 * карточки (например, «вставь слово» — только если есть пример с этим словом).
 */
export function buildQuiz(
  cards: WordCard[],
  count: number = DEFAULT_COUNT,
  pool: WordCard[] = cards,
): QuizQuestion[] {
  if (cards.length === 0) return [];
  const chosen = shuffle([...cards]).slice(0, Math.max(1, Math.min(count, cards.length)));

  return chosen.map((card, i) => {
    let kind: QuizKind = 'wordToTranslation';
    for (let k = 0; k < ROTATION.length; k += 1) {
      const cand = ROTATION[(i + k) % ROTATION.length];
      if (isValid(card, pool, cand)) {
        kind = cand;
        break;
      }
    }
    return makeQuestion(card, pool, kind, i);
  });
}
