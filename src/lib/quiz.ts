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
import { t } from '@/lib/i18n';

/** Виды вопросов. */
export type QuizKind =
  | 'intro' // Знакомство: показать новое слово целиком (без теста)
  | 'wordToTranslation'
  | 'translationToWord'
  | 'imageToWord'
  | 'imageToTranslation'
  | 'audioToWord'
  | 'audioToTranslation'
  | 'translationToImage'
  | 'clozeExample'
  | 'chooseSynonym' // Выбрать синоним слова (проверяем связи слова, не только перевод)
  | 'typeWord' // Впиши: ввести слово с клавиатуры (регистр не важен)
  | 'speakWord'; // Скажи вслух: произнести слово (на честность)

/** Как показываем сам вопрос. */
export type PromptMode = 'text' | 'image' | 'audio' | 'cloze';
/** Как показываем варианты ответа. */
export type OptionMode = 'text' | 'image';
/**
 * Как пользователь отвечает:
 *  - choice — выбор из вариантов (MC);
 *  - type   — ввод слова с клавиатуры;
 *  - speak  — произнести вслух + самооценка;
 *  - intro  — знакомство, ответа нет (кнопка «Далее»).
 */
export type AnswerMode = 'choice' | 'type' | 'speak' | 'intro';

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
  /** Варианты: ровно один correct, уже перемешаны. Пусто для type/speak/intro. */
  options: QuizOption[];
  /** Как пользователь отвечает (choice/type/speak/intro). */
  answerMode: AnswerMode;
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

/**
 * Ярусы сложности по уровню освоения слова (адаптивная траектория «узнавание →
 * продукция»). Внутри яруса чередуем по индексу и берём первый подходящий формат.
 *  - УЗНАВАНИЕ (mastery ≤1): выбрать перевод/слово/картинку, на слух.
 *  - РАННЯЯ ПРОДУКЦИЯ (2–3): пропуск в предложении, впиши слово.
 *  - ПРОДУКЦИЯ (≥4): впиши / скажи вслух / пропуск.
 * Совсем новое слово (mastery 0, ещё не повторяли) → «Знакомство».
 */
const RECOGNITION: QuizKind[] = [
  'wordToTranslation',
  'audioToWord',
  'imageToTranslation',
  'chooseSynonym',
  'translationToWord',
  'audioToTranslation',
  'translationToImage',
  'imageToWord',
];
const PRODUCTION_EARLY: QuizKind[] = ['clozeExample', 'typeWord'];
const PRODUCTION: QuizKind[] = ['typeWord', 'speakWord', 'clozeExample'];

/** Выбрать вид вопроса под карточку: ярус по mastery + первый подходящий формат. */
function kindForCard(card: WordCard, pool: WordCard[], i: number, noIntro = false): QuizKind {
  const mastery = card.mastery ?? 0;
  const reps = card.reps ?? 0;
  // Новое слово — сначала знакомим, не тестируем. В режиме noIntro (Умный тест)
  // знакомство не показываем: все 10 — настоящие вопросы.
  if (!noIntro && mastery === 0 && reps === 0) return 'intro';

  const tier = mastery >= 4 ? PRODUCTION : mastery >= 2 ? PRODUCTION_EARLY : RECOGNITION;
  for (let k = 0; k < tier.length; k += 1) {
    const cand = tier[(i + k) % tier.length];
    if (isValid(card, pool, cand)) return cand;
  }
  // Запас: любой подходящий формат узнавания.
  for (let k = 0; k < RECOGNITION.length; k += 1) {
    const cand = RECOGNITION[(i + k) % RECOGNITION.length];
    if (isValid(card, pool, cand)) return cand;
  }
  return 'wordToTranslation';
}

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
    case 'intro':
      return t('Новое слово');
    case 'wordToTranslation':
    case 'imageToTranslation':
      return t('Как переводится?');
    case 'audioToTranslation':
      return t('Услышал слово — как переводится?');
    case 'translationToWord':
      return t('Какое это слово?');
    case 'imageToWord':
      return t('Что на картинке?');
    case 'audioToWord':
      return t('Что ты услышал?');
    case 'translationToImage':
      return t('Выбери картинку');
    case 'clozeExample':
      return t('Вставь пропущенное слово');
    case 'chooseSynonym':
      return t('Выбери синоним');
    case 'typeWord':
      return t('Впиши слово');
    case 'speakWord':
      return t('Скажи вслух');
  }
}

/** Как пользователь отвечает на вопрос данного вида. */
function answerModeOf(kind: QuizKind): AnswerMode {
  if (kind === 'intro') return 'intro';
  if (kind === 'typeWord') return 'type';
  if (kind === 'speakWord') return 'speak';
  return 'choice';
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
  // Синоним ищем к самому слову — показываем слово.
  if (kind === 'chooseSynonym') return card.word;
  // Впиши/Скажи — подсказка это перевод (произвести нужно само слово).
  if (kind === 'typeWord' || kind === 'speakWord') return card.translation;
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

/**
 * Варианты «выбери синоним»: правильный — синоним слова, дистракторы — другие
 * слова коллекции (не синонимы). null, если синонимов нет или мало дистракторов.
 */
function buildSynonymOptions(card: WordCard, pool: WordCard[]): QuizOption[] | null {
  const syns = (card.synonyms ?? []).map((s) => s.trim()).filter(Boolean);
  if (syns.length === 0) return null;
  const correct = syns[Math.floor(Math.random() * syns.length)];
  // В дистракторы не берём само слово, его синонимы и повторы.
  const seen = new Set<string>([card.word.toLowerCase(), ...syns.map((s) => s.toLowerCase())]);
  const distractors: string[] = [];
  for (const other of shuffle([...pool])) {
    if (distractors.length >= OPTION_COUNT - 1) break;
    const w = other.word?.trim();
    if (!w || seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase());
    distractors.push(w);
  }
  for (const f of WORD_FILLERS) {
    if (distractors.length >= OPTION_COUNT - 1) break;
    if (!seen.has(f.toLowerCase())) {
      seen.add(f.toLowerCase());
      distractors.push(f);
    }
  }
  if (distractors.length < OPTION_COUNT - 1) return null;
  return shuffle([
    { correct: true, text: correct },
    ...distractors.map((text) => ({ correct: false, text })),
  ]);
}

/** Подходит ли формат данной карточке/пулу. */
function isValid(card: WordCard, pool: WordCard[], kind: QuizKind): boolean {
  if (kind === 'clozeExample') return clozeSentence(card) != null;
  if (kind === 'chooseSynonym') return buildSynonymOptions(card, pool) != null;
  // Вопросы «с картинкой» — только для карточек с НАСТОЯЩИМ фото (не иконкой),
  // иначе получится «фото-вопрос», где на месте фото просто иконка категории.
  if (kind === 'imageToWord' || kind === 'imageToTranslation') return !!card.imageUri;
  if (kind === 'translationToImage') return !!card.imageUri && buildImageOptions(card, pool) != null;
  return true;
}

/** Собрать один вопрос выбранного вида. */
function makeQuestion(card: WordCard, pool: WordCard[], kind: QuizKind, i: number): QuizQuestion {
  const answerMode = answerModeOf(kind);
  const optionMode: OptionMode = kind === 'translationToImage' ? 'image' : 'text';
  // Варианты нужны только для выбора (choice); type/speak/intro — без вариантов.
  const options: QuizOption[] =
    answerMode !== 'choice'
      ? []
      : kind === 'chooseSynonym'
        ? (buildSynonymOptions(card, pool) ?? buildTextOptions(card, pool, 'wordToTranslation'))
        : optionMode === 'image'
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
    answerMode,
  };
}

/**
 * Построить тест из карточек коллекции.
 * @param cards карточки под вопросы
 * @param count сколько вопросов (по умолчанию 10; не больше числа карточек)
 * @param pool  пул для дистракторов/картинок (по умолчанию — те же карточки)
 *
 * Формат вопроса выбираем адаптивно по уровню освоения карточки (kindForCard):
 * новое слово → знакомство, дальше узнавание → продукция.
 */
export function buildQuiz(
  cards: WordCard[],
  count: number = DEFAULT_COUNT,
  pool: WordCard[] = cards,
  forceKind?: QuizKind,
  noIntro = false,
): QuizQuestion[] {
  if (cards.length === 0) return [];
  let ordered = shuffle([...cards]);
  // Режим с фиксированным форматом («на слух», «слово в предложение»): карточки,
  // к которым формат применим, идут первыми — чтобы сессия была «чистой».
  if (forceKind) {
    ordered = ordered.sort(
      (a, b) => Number(isValid(b, pool, forceKind)) - Number(isValid(a, pool, forceKind)),
    );
  }
  const chosen = ordered.slice(0, Math.max(1, Math.min(count, cards.length)));
  return chosen.map((card, i) => {
    // В фиксированном режиме используем формат, если он применим к карточке;
    // иначе — адаптивный выбор (не ломаем сессию для карточек без примера и т.п.).
    const kind =
      forceKind && isValid(card, pool, forceKind) ? forceKind : kindForCard(card, pool, i, noIntro);
    return makeQuestion(card, pool, kind, i);
  });
}
