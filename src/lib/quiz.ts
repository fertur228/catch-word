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
  | 'speakWord' // Скажи вслух: произнести слово (на честность)
  | 'dictation' // Диктант: услышать предложение → впечатать ключевое слово (движок v2, Э2)
  | 'writeSentence' // Составить СВОЁ предложение со словом → оценивает ИИ-тренер (Э2)
  | 'describePhoto'; // Расскажи о фото: описать СВОЙ снимок голосом/текстом → ИИ-тренер (Э4)

/** Как показываем сам вопрос. */
export type PromptMode = 'text' | 'image' | 'audio' | 'cloze';
/** Как показываем варианты ответа. */
export type OptionMode = 'text' | 'image';
/**
 * Как пользователь отвечает:
 *  - choice — выбор из вариантов (MC);
 *  - type   — ввод слова с клавиатуры;
 *  - write  — свободный текст (своё предложение) → оценка ИИ-тренером;
 *  - speak  — произнести вслух + самооценка;
 *  - intro  — знакомство, ответа нет (кнопка «Далее»).
 */
export type AnswerMode = 'choice' | 'type' | 'write' | 'speak' | 'intro';

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
    case 'dictation':
      return t('Услышь и напиши слово');
    case 'writeSentence':
      return t('Составь своё предложение');
    case 'describePhoto':
      return t('Расскажи о фото');
  }
}

/** Как пользователь отвечает на вопрос данного вида. */
function answerModeOf(kind: QuizKind): AnswerMode {
  if (kind === 'intro') return 'intro';
  if (kind === 'typeWord' || kind === 'dictation') return 'type';
  // «Расскажи о фото» — та же механика write: свободный текст → оценка тренера.
  if (kind === 'writeSentence' || kind === 'describePhoto') return 'write';
  if (kind === 'speakWord') return 'speak';
  return 'choice';
}

/** Как показываем вопрос для данного вида. */
function promptModeOf(kind: QuizKind): PromptMode {
  if (kind === 'imageToWord' || kind === 'imageToTranslation' || kind === 'describePhoto') return 'image';
  if (kind === 'audioToWord' || kind === 'audioToTranslation' || kind === 'dictation') return 'audio';
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
  // «Напиши сам» — показываем слово и перевод, предложение сочиняет ученик.
  if (kind === 'writeSentence') return card.word;
  return '';
}

/** Предложение для диктанта: первый пример со словом, иначе само слово. */
export function dictationSentence(card: WordCard): string {
  const w = card.word.trim();
  if (w) {
    const re = new RegExp(`\\b${escapeRe(w)}\\b`, 'i');
    for (const ex of card.examples ?? []) {
      if (re.test(ex)) return ex;
    }
  }
  return card.word;
}

/** Нормализация свободного ввода: регистр/края/повторные пробелы не важны. */
export function normalizeAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Убрать диакритику (umlaut/акценты) — для «почти верно» в диктанте. */
export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
}

/**
 * Локальная проверка диктанта (без LLM — спека Э2):
 *  correct — точное совпадение после нормализации;
 *  partial — расходится ТОЛЬКО диакритика (de/es: «проверь умляут/акцент»);
 *  wrong   — всё остальное (фидбек добирается у ИИ-тренера).
 */
export function checkDictation(answer: string, expectedWord: string): 'correct' | 'partial' | 'wrong' {
  const a = normalizeAnswer(answer);
  const e = normalizeAnswer(expectedWord);
  if (!a) return 'wrong';
  if (a === e) return 'correct';
  if (stripDiacritics(a) === stripDiacritics(e)) return 'partial';
  return 'wrong';
}

export type DictationResult = 'correct' | 'partial' | 'partial-word' | 'wrong';

/** Пунктуация не решает судьбу диктанта: точки/запятые/кавычки — мимо. */
function stripPunctuation(s: string): string {
  return s.replace(/[.,!?;:'"«»„“”‘’…()\-—]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Проверка диктанта ЦЕЛЫМ ПРЕДЛОЖЕНИЕМ (решение основателя 12.07):
 *  correct      — предложение совпало (регистр/пробелы/пунктуация не важны);
 *  partial      — разошлась только диакритика («проверь умляут/акцент»);
 *  partial-word — предложение не совпало, но ИЗУЧАЕМОЕ слово написано верно;
 *  wrong        — ключевое слово не написано (фидбек добирается у тренера).
 * Карточка без примера (sentence == слово) → старая проверка по слову.
 */
export function checkDictationSentence(
  answer: string,
  sentence: string,
  word: string,
): DictationResult {
  if (normalizeAnswer(sentence) === normalizeAnswer(word)) return checkDictation(answer, word);
  const a = stripPunctuation(normalizeAnswer(answer));
  const e = stripPunctuation(normalizeAnswer(sentence));
  if (!a) return 'wrong';
  if (a === e) return 'correct';
  if (stripDiacritics(a) === stripDiacritics(e)) return 'partial';
  // Слово на месте (с точностью до диакритики, по границам слов)?
  const w = escapeRe(stripDiacritics(stripPunctuation(normalizeAnswer(word))));
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${w}($|[^\\p{L}\\p{N}])`, 'u');
  if (re.test(stripDiacritics(a))) return 'partial-word';
  return 'wrong';
}

/** Подпись диктанта: с примером диктуем предложение, без — только слово. */
export function dictationLabel(card: WordCard): string {
  return dictationSentence(card) !== card.word
    ? t('Напиши предложение, которое услышал')
    : t('Услышь и напиши слово');
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

/**
 * Текстовые варианты: правильный + 3 дистрактора.
 * Приоритет: семантические соседи (pgvector, Э5) → AI-дистракторы карточки →
 * та же тема → пул → заглушки. Соседи делают тест сложнее и честнее:
 * «стол» → стул/полка/шкаф, а не гвоздь/солнце.
 */
function buildTextOptions(
  card: WordCard,
  pool: WordCard[],
  kind: QuizKind,
  neighbors?: Map<string, string[]>,
): QuizOption[] {
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

  // Семантические соседи применимы там, где ответ — СЛОВО (не перевод).
  if (!TRANSLATION_ANSWER.has(kind)) {
    for (const w of neighbors?.get(card.id) ?? []) add(w);
  }
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
  // Диктант и «Напиши сам» применимы к любой карточке (голос TTS проверяет экран).
  if (kind === 'dictation' || kind === 'writeSentence') return true;
  if (kind === 'chooseSynonym') return buildSynonymOptions(card, pool) != null;
  // Вопросы «с картинкой» — только для карточек с НАСТОЯЩИМ фото (не иконкой),
  // иначе получится «фото-вопрос», где на месте фото просто иконка категории.
  if (kind === 'imageToWord' || kind === 'imageToTranslation' || kind === 'describePhoto')
    return !!card.imageUri;
  if (kind === 'translationToImage') return !!card.imageUri && buildImageOptions(card, pool) != null;
  return true;
}

/** Собрать один вопрос выбранного вида. */
function makeQuestion(
  card: WordCard,
  pool: WordCard[],
  kind: QuizKind,
  i: number,
  neighbors?: Map<string, string[]>,
): QuizQuestion {
  const answerMode = answerModeOf(kind);
  const optionMode: OptionMode = kind === 'translationToImage' ? 'image' : 'text';
  // Варианты нужны только для выбора (choice); type/speak/intro — без вариантов.
  const options: QuizOption[] =
    answerMode !== 'choice'
      ? []
      : kind === 'chooseSynonym'
        ? (buildSynonymOptions(card, pool) ?? buildTextOptions(card, pool, 'wordToTranslation', neighbors))
        : optionMode === 'image'
          ? (buildImageOptions(card, pool) ?? buildTextOptions(card, pool, 'translationToWord', neighbors))
          : buildTextOptions(card, pool, kind, neighbors);
  return {
    id: `${card.id}-${kind}-${i}`,
    kind,
    card,
    label: kind === 'dictation' ? dictationLabel(card) : labelOf(kind),
    promptMode: promptModeOf(kind),
    prompt: promptTextOf(card, kind),
    optionMode,
    options,
    answerMode,
  };
}

// ── Тренировка от тренера (движок v2, Э3): exercises → вопросы ──────────
import type { AgentExercise } from '@/lib/daily-quest';

/**
 * Синтетическая карточка для цели вне коллекции: озвучка/итоги работают,
 * SRS не двигается (id пустой — reviewCard такую не найдёт и тихо выйдет),
 * телеметрия пишет card_id=null.
 */
function syntheticCard(word: string, pool: WordCard[]): WordCard {
  return {
    id: '',
    emoji: '✨',
    word,
    translation: '',
    ipa: '',
    examples: [],
    category: null,
    learningLang: pool[0]?.learningLang ?? 'en-US',
    nativeLang: pool[0]?.nativeLang ?? 'ru-RU',
    createdAt: Date.now(),
  };
}

/**
 * Конвертер тренировки от агента в вопросы квиза (7 точек чек-листа B.6
 * закрывает экран; здесь — только корректные QuizQuestion).
 *  - dictation: предложение агента подкладывается ПЕРВЫМ примером карточки —
 *    dictationSentence() возьмёт именно его;
 *  - cloze: предложение с ____ от агента + его дистракторы (добор из пула);
 *  - writeSentence: задание тренера (prompt) уходит в label.
 */
export function buildWorkoutQuiz(exercises: AgentExercise[], pool: WordCard[]): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  exercises.forEach((ex, i) => {
    const base =
      pool.find((c) => c.word.trim().toLowerCase() === ex.word.toLowerCase()) ??
      syntheticCard(ex.word, pool);
    if (ex.kind === 'dictation') {
      const card = ex.sentence ? { ...base, examples: [ex.sentence, ...base.examples] } : base;
      out.push({
        id: `workout-${i}-dictation`,
        kind: 'dictation',
        card,
        label: dictationLabel(card),
        promptMode: 'audio',
        prompt: '',
        optionMode: 'text',
        options: [],
        answerMode: 'type',
      });
      return;
    }
    if (ex.kind === 'cloze' && ex.sentence?.includes('____')) {
      // Варианты: слово + дистракторы агента, добор из пула до 4.
      const seen = new Set<string>([base.word.toLowerCase()]);
      const distractors: string[] = [];
      for (const d of ex.distractors ?? []) {
        const w = d.trim();
        if (w && !seen.has(w.toLowerCase()) && distractors.length < OPTION_COUNT - 1) {
          seen.add(w.toLowerCase());
          distractors.push(w);
        }
      }
      for (const other of shuffle([...pool])) {
        if (distractors.length >= OPTION_COUNT - 1) break;
        const w = other.word.trim();
        if (w && !seen.has(w.toLowerCase())) {
          seen.add(w.toLowerCase());
          distractors.push(w);
        }
      }
      out.push({
        id: `workout-${i}-cloze`,
        kind: 'clozeExample',
        card: base,
        label: t('Вставь пропущенное слово'),
        promptMode: 'cloze',
        prompt: ex.sentence,
        optionMode: 'text',
        options: shuffle([
          { correct: true, text: base.word },
          ...distractors.map((text) => ({ correct: false, text })),
        ]),
        answerMode: 'choice',
      });
      return;
    }
    if (ex.kind === 'writeSentence') {
      out.push({
        id: `workout-${i}-write`,
        kind: 'writeSentence',
        card: base,
        label: ex.prompt || t('Составь своё предложение'),
        promptMode: 'text',
        prompt: base.word,
        optionMode: 'text',
        options: [],
        answerMode: 'write',
      });
    }
  });
  return out;
}

/**
 * «Расскажи о фото» (движок v2, Э4, спека B.5): сессия до `count` карточек с
 * НАСТОЯЩИМ фото (imageUri). Приоритет — просроченные по dueAt (самые «старые»
 * сверху), затем те, чей повтор ближе. Механика ответа — write (оценка тренера).
 */
export function buildSpeakPhotoQuiz(cards: WordCard[], count = 5): QuizQuestion[] {
  const now = Date.now();
  const withPhoto = cards.filter((c) => !!c.imageUri);
  const due = withPhoto
    .filter((c) => (c.dueAt ?? 0) <= now)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  const rest = withPhoto
    .filter((c) => (c.dueAt ?? 0) > now)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  return [...due, ...rest].slice(0, count).map((card, i) => ({
    id: `speakphoto-${card.id}-${i}`,
    kind: 'describePhoto' as const,
    card,
    label: t('Расскажи о фото'),
    promptMode: 'image' as const,
    prompt: '',
    optionMode: 'text' as const,
    options: [],
    answerMode: 'write' as const,
  }));
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
  neighbors?: Map<string, string[]>,
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
    return makeQuestion(card, pool, kind, i, neighbors);
  });
}
