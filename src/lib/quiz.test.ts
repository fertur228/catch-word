/**
 * Юнит-тесты генератора тестов (quiz.ts): нормализация ввода, проверка
 * диктанта, конвертер тренировки агента и адаптивная сборка квиза.
 *
 * Math.random внутри shuffle не фиксируем: проверяем СВОЙСТВА (ровно один
 * correct, состав вариантов, вид вопроса), а не порядок.
 */
import { describe, expect, test, vi } from 'vitest';

// quiz.ts тянет t() из i18n, а тот — React и локальную БД; в node подменяем.
vi.mock('@/lib/i18n', () => ({ t: (s: string) => s }));

import type { AgentExercise } from '@/lib/daily-quest';
import {
  buildQuiz,
  buildSpeakPhotoQuiz,
  buildWorkoutQuiz,
  checkDictation,
  checkDictationSentence,
  dictationLabel,
  dictationSentence,
  normalizeAnswer,
  stripDiacritics,
  type QuizQuestion,
} from '@/lib/quiz';
import type { WordCard } from '@/types';

const NOW = 1_700_000_000_000;

function card(overrides: Partial<WordCard> = {}): WordCard {
  return {
    id: overrides.id ?? 'id-1',
    emoji: '☕',
    word: 'cup',
    translation: 'кружка',
    ipa: '',
    examples: [],
    category: null,
    learningLang: 'en-US',
    nativeLang: 'ru-RU',
    createdAt: NOW,
    ...overrides,
  };
}

/** Пул из 8 различимых карточек без фото/синонимов (узнавание, mastery 1). */
function bigPool(): WordCard[] {
  const words: Array<[string, string]> = [
    ['cup', 'кружка'],
    ['table', 'стол'],
    ['chair', 'стул'],
    ['lamp', 'лампа'],
    ['book', 'книга'],
    ['door', 'дверь'],
    ['window', 'окно'],
    ['mirror', 'зеркало'],
  ];
  return words.map(([w, tr], i) =>
    card({ id: `p${i}`, word: w, translation: tr, mastery: 1, reps: 1 }),
  );
}

function correctOptions(q: QuizQuestion) {
  return q.options.filter((o) => o.correct);
}

describe('normalizeAnswer', () => {
  test.each([
    { input: '  Hello  World ', expected: 'hello world', label: 'края, регистр и двойные пробелы' },
    { input: 'CUP', expected: 'cup', label: 'верхний регистр' },
    { input: 'a\tb\nc', expected: 'a b c', label: 'табы и переводы строк схлопываются в пробел' },
    { input: '', expected: '', label: 'пустая строка остаётся пустой' },
    { input: '   ', expected: '', label: 'одни пробелы → пусто' },
  ])('$label', ({ input, expected }) => {
    expect(normalizeAnswer(input)).toBe(expected);
  });
});

describe('stripDiacritics', () => {
  test.each([
    { input: 'über', expected: 'uber', label: 'умляут u' },
    { input: 'café', expected: 'cafe', label: 'акцент é' },
    { input: 'niño', expected: 'nino', label: 'испанская тильда' },
    { input: 'ß', expected: 'ss', label: 'эсцет → ss' },
    { input: 'Straße', expected: 'Strasse', label: 'эсцет внутри слова, регистр сохраняется' },
    { input: 'water', expected: 'water', label: 'обычное слово не меняется' },
  ])('$label', ({ input, expected }) => {
    expect(stripDiacritics(input)).toBe(expected);
  });
});

describe('checkDictation', () => {
  test.each([
    { answer: 'cup', expected: 'cup', verdict: 'correct', label: 'точное совпадение' },
    { answer: '  Cup ', expected: 'cup', verdict: 'correct', label: 'регистр и края не важны' },
    { answer: 'uber', expected: 'über', verdict: 'partial', label: 'расходится только умляут' },
    { answer: 'strasse', expected: 'Straße', verdict: 'partial', label: 'ss вместо ß — почти верно' },
    { answer: 'dog', expected: 'cat', verdict: 'wrong', label: 'другое слово' },
    { answer: '', expected: 'cup', verdict: 'wrong', label: 'пустой ответ' },
    { answer: '   ', expected: 'cup', verdict: 'wrong', label: 'ответ из одних пробелов' },
  ])('$label → $verdict', ({ answer, expected, verdict }) => {
    expect(checkDictation(answer, expected)).toBe(verdict);
  });
});

describe('checkDictationSentence', () => {
  const sentence = 'I drink coffee every morning.';
  const word = 'coffee';

  test('предложение совпало с точностью до регистра → correct', () => {
    expect(checkDictationSentence('i drink coffee every morning', sentence, word)).toBe('correct');
  });

  test('пунктуация не решает судьбу: лишние запятые/восклицания → correct', () => {
    expect(checkDictationSentence('I drink coffee, every morning!', sentence, word)).toBe('correct');
  });

  test('разошлась только диакритика → partial', () => {
    expect(checkDictationSentence('ich mag kase', 'Ich mag Käse.', 'Käse')).toBe('partial');
  });

  test('предложение не то, но изучаемое слово написано верно → partial-word', () => {
    expect(checkDictationSentence('coffee is great', sentence, word)).toBe('partial-word');
  });

  test('слово с точностью до диакритики внутри чужого предложения → partial-word', () => {
    expect(checkDictationSentence('der kase bitte', 'Der Käse ist gut.', 'Käse')).toBe('partial-word');
  });

  test('только само слово без предложения → partial-word', () => {
    expect(checkDictationSentence('coffee', sentence, word)).toBe('partial-word');
  });

  test('слово матчится по границам слов: «cup» внутри «cupboard» не считается', () => {
    expect(checkDictationSentence('my cupboard is big', 'I have a cup.', 'cup')).toBe('wrong');
  });

  test('ключевого слова нет → wrong', () => {
    expect(checkDictationSentence('tea is great', sentence, word)).toBe('wrong');
  });

  test('пустой ответ → wrong', () => {
    expect(checkDictationSentence('', sentence, word)).toBe('wrong');
    expect(checkDictationSentence('   ', sentence, word)).toBe('wrong');
  });

  describe('карточка без примера (sentence == слово) — деградация к проверке слова', () => {
    test.each([
      { answer: 'Käse', verdict: 'correct', label: 'точное слово' },
      { answer: 'kase', verdict: 'partial', label: 'слово без умляута' },
      { answer: 'brot', verdict: 'wrong', label: 'другое слово' },
    ])('$label → $verdict', ({ answer, verdict }) => {
      expect(checkDictationSentence(answer, 'Käse', 'Käse')).toBe(verdict);
    });
  });
});

describe('dictationSentence', () => {
  test('берёт ПЕРВЫЙ пример, где слово стоит отдельным словом', () => {
    const c = card({ word: 'cup', examples: ['My cupboard is big.', 'A cup of tea.'] });

    expect(dictationSentence(c)).toBe('A cup of tea.');
  });

  test('слово в примере находится без учёта регистра', () => {
    const c = card({ word: 'apple', examples: ['Apple pie is tasty.'] });

    expect(dictationSentence(c)).toBe('Apple pie is tasty.');
  });

  test('нет подходящего примера → фолбэк на само слово', () => {
    const c = card({ word: 'cup', examples: ['Nothing relevant here.'] });

    expect(dictationSentence(c)).toBe('cup');
  });

  test('нет примеров вовсе → само слово', () => {
    expect(dictationSentence(card({ word: 'cup', examples: [] }))).toBe('cup');
  });

  test('спецсимволы в слове не ломают регэксп (escapeRe)', () => {
    const c = card({ word: 'a+b', examples: ['so a+b works fine'] });

    expect(dictationSentence(c)).toBe('so a+b works fine');
  });

  test('пустое слово → возвращается как есть', () => {
    expect(dictationSentence(card({ word: '', examples: ['Any sentence.'] }))).toBe('');
  });
});

describe('dictationLabel', () => {
  test('есть пример со словом → диктуем предложение', () => {
    const c = card({ word: 'cup', examples: ['A cup of tea.'] });

    expect(dictationLabel(c)).toBe('Напиши предложение, которое услышал');
  });

  test('примера нет → диктуем только слово', () => {
    const c = card({ word: 'cup', examples: [] });

    expect(dictationLabel(c)).toBe('Услышь и напиши слово');
  });
});

describe('buildWorkoutQuiz', () => {
  const pool = bigPool();

  test('пустая тренировка → пустой квиз', () => {
    expect(buildWorkoutQuiz([], pool)).toEqual([]);
  });

  describe('dictation', () => {
    test('предложение агента становится ПЕРВЫМ примером карточки', () => {
      const ex: AgentExercise = { v: 1, word: 'cup', kind: 'dictation', sentence: 'Put the cup here.' };
      const base = card({ id: 'orig', word: 'cup', examples: ['A cup of tea.'] });

      const [q] = buildWorkoutQuiz([ex], [base]);

      expect(q.kind).toBe('dictation');
      expect(q.card.examples[0]).toBe('Put the cup here.');
      expect(dictationSentence(q.card)).toBe('Put the cup here.');
      expect(q.label).toBe('Напиши предложение, которое услышал');
      expect(q.answerMode).toBe('type');
      expect(q.promptMode).toBe('audio');
      expect(q.options).toEqual([]);
      expect(q.id).toBe('workout-0-dictation');
    });

    test('карточка пула находится без учёта регистра слова', () => {
      const ex: AgentExercise = { v: 1, word: 'CUP', kind: 'dictation', sentence: 'The CUP is red.' };

      const [q] = buildWorkoutQuiz([ex], pool);

      expect(q.card.id).toBe('p0'); // реальная карточка, не синтетическая
    });

    test('без предложения агента и без примеров → диктуем слово', () => {
      const ex: AgentExercise = { v: 1, word: 'cup', kind: 'dictation' };

      const [q] = buildWorkoutQuiz([ex], pool);

      expect(q.label).toBe('Услышь и напиши слово');
      expect(q.card.examples).toEqual([]);
    });
  });

  describe('cloze', () => {
    test('пропуск ____ от агента + его дистракторы, ровно один correct', () => {
      const ex: AgentExercise = {
        v: 1,
        word: 'cup',
        kind: 'cloze',
        sentence: 'Put the ____ here.',
        distractors: ['table', 'chair', 'lamp'],
      };

      const [q] = buildWorkoutQuiz([ex], pool);

      expect(q.kind).toBe('clozeExample');
      expect(q.prompt).toBe('Put the ____ here.');
      expect(q.promptMode).toBe('cloze');
      expect(q.answerMode).toBe('choice');
      expect(q.options).toHaveLength(4);
      expect(correctOptions(q)).toHaveLength(1);
      expect(correctOptions(q)[0].text).toBe('cup');
      const texts = q.options.map((o) => o.text).sort();
      expect(texts).toEqual(['chair', 'cup', 'lamp', 'table']);
    });

    test('дистрактор, совпадающий со словом, отбрасывается; добор из пула до 4 вариантов', () => {
      const ex: AgentExercise = {
        v: 1,
        word: 'cup',
        kind: 'cloze',
        sentence: 'The ____ is red.',
        distractors: ['CUP', 'table'],
      };

      const [q] = buildWorkoutQuiz([ex], pool);

      expect(q.options).toHaveLength(4);
      expect(correctOptions(q)).toHaveLength(1);
      // Ровно один вариант «cup» — правильный; дубликат из дистракторов не прошёл.
      expect(q.options.filter((o) => o.text.toLowerCase() === 'cup')).toHaveLength(1);
      expect(q.options.some((o) => o.text === 'table')).toBe(true);
      // Никаких повторов среди вариантов.
      const lower = q.options.map((o) => o.text.toLowerCase());
      expect(new Set(lower).size).toBe(lower.length);
    });

    test('предложение без пропуска ____ → упражнение молча пропускается', () => {
      const ex: AgentExercise = { v: 1, word: 'cup', kind: 'cloze', sentence: 'No gap here.', distractors: ['a', 'b'] };

      expect(buildWorkoutQuiz([ex], pool)).toEqual([]);
    });

    test('cloze без предложения → пропускается', () => {
      const ex: AgentExercise = { v: 1, word: 'cup', kind: 'cloze', distractors: ['a', 'b'] };

      expect(buildWorkoutQuiz([ex], pool)).toEqual([]);
    });
  });

  describe('writeSentence', () => {
    test('задание тренера уходит в label, подсказка — само слово', () => {
      const ex: AgentExercise = { v: 1, word: 'cup', kind: 'writeSentence', prompt: 'Составь фразу про кухню' };

      const [q] = buildWorkoutQuiz([ex], pool);

      expect(q.kind).toBe('writeSentence');
      expect(q.label).toBe('Составь фразу про кухню');
      expect(q.prompt).toBe('cup');
      expect(q.answerMode).toBe('write');
      expect(q.options).toEqual([]);
    });

    test('без prompt — дефолтная подпись', () => {
      const ex: AgentExercise = { v: 1, word: 'cup', kind: 'writeSentence' };

      const [q] = buildWorkoutQuiz([ex], pool);

      expect(q.label).toBe('Составь своё предложение');
    });
  });

  describe('синтетическая карточка для слова вне пула', () => {
    test('id пустой, языки берутся у пула', () => {
      const ex: AgentExercise = { v: 1, word: 'zebra', kind: 'writeSentence' };
      const localized = [card({ id: 'x', learningLang: 'de-DE', nativeLang: 'kk-KZ' })];

      const [q] = buildWorkoutQuiz([ex], localized);

      expect(q.card.id).toBe('');
      expect(q.card.word).toBe('zebra');
      expect(q.card.learningLang).toBe('de-DE');
      expect(q.card.nativeLang).toBe('kk-KZ');
    });

    test('пустой пул → языки по умолчанию en-US/ru-RU', () => {
      const ex: AgentExercise = { v: 1, word: 'zebra', kind: 'dictation', sentence: 'A zebra runs.' };

      const [q] = buildWorkoutQuiz([ex], []);

      expect(q.card.learningLang).toBe('en-US');
      expect(q.card.nativeLang).toBe('ru-RU');
    });
  });

  test('невалидный kind — молча мимо', () => {
    const bogus = { v: 1, word: 'cup', kind: 'bogus' } as unknown as AgentExercise;

    expect(buildWorkoutQuiz([bogus], pool)).toEqual([]);
  });

  test('id вопросов нумеруются по позиции упражнения', () => {
    const exs: AgentExercise[] = [
      { v: 1, word: 'cup', kind: 'dictation', sentence: 'A cup.' },
      { v: 1, word: 'table', kind: 'writeSentence' },
    ];

    const qs = buildWorkoutQuiz(exs, pool);

    expect(qs.map((q) => q.id)).toEqual(['workout-0-dictation', 'workout-1-write']);
  });
});

describe('buildQuiz', () => {
  test('пустая коллекция → пустой квиз', () => {
    expect(buildQuiz([])).toEqual([]);
  });

  describe('count', () => {
    test('не больше числа карточек', () => {
      const cards = bigPool().slice(0, 5);

      expect(buildQuiz(cards, 10, cards, undefined, true)).toHaveLength(5);
    });

    test('режется до запрошенного количества', () => {
      const cards = bigPool();

      expect(buildQuiz(cards, 3, cards, undefined, true)).toHaveLength(3);
    });

    test('count=0 — нижняя граница: хотя бы один вопрос', () => {
      const cards = bigPool();

      expect(buildQuiz(cards, 0, cards, undefined, true)).toHaveLength(1);
    });
  });

  describe('знакомство (intro)', () => {
    test('совсем новое слово (mastery 0, reps 0) → intro без вариантов', () => {
      const fresh = card({ mastery: 0, reps: 0 });

      const [q] = buildQuiz([fresh], 1, bigPool());

      expect(q.kind).toBe('intro');
      expect(q.answerMode).toBe('intro');
      expect(q.options).toEqual([]);
      expect(q.label).toBe('Новое слово');
    });

    test('в режиме noIntro знакомства нет — сразу настоящий вопрос', () => {
      const fresh = card({ mastery: 0, reps: 0 });

      const [q] = buildQuiz([fresh], 1, bigPool(), undefined, true);

      expect(q.kind).not.toBe('intro');
      expect(q.answerMode).not.toBe('intro');
    });

    test('mastery 0, но слово уже повторяли (reps>0) → не intro', () => {
      const c = card({ mastery: 0, reps: 1 });

      const [q] = buildQuiz([c], 1, bigPool());

      expect(q.kind).not.toBe('intro');
    });
  });

  describe('варианты ответов', () => {
    test('в каждом choice-вопросе ровно один correct и нет дублей', () => {
      const cards = bigPool();

      const qs = buildQuiz(cards, 8, cards, undefined, true);

      expect(qs.length).toBe(8);
      for (const q of qs) {
        expect(q.answerMode).toBe('choice');
        expect(q.options).toHaveLength(4);
        expect(correctOptions(q)).toHaveLength(1);
        const texts = q.options.map((o) => o.text);
        expect(new Set(texts).size).toBe(texts.length);
      }
    });

    test('AI-дистракторы карточки используются для переводных вопросов', () => {
      const c = card({
        mastery: 1,
        reps: 1,
        distractors: ['чашка', 'стакан', 'бокал'],
      });

      const [q] = buildQuiz([c], 1, [c], 'wordToTranslation');

      const texts = q.options.map((o) => o.text).sort();
      expect(texts).toEqual(['бокал', 'кружка', 'стакан', 'чашка']);
      expect(correctOptions(q)[0].text).toBe('кружка');
    });

    test('пул из одной карточки → добор заглушками-переводами', () => {
      const c = card({ mastery: 1, reps: 1 });
      const fillers = ['предмет', 'вещь', 'слово', 'объект', 'место'];

      const [q] = buildQuiz([c], 1, [c], 'wordToTranslation');

      expect(q.options).toHaveLength(4);
      const wrong = q.options.filter((o) => !o.correct).map((o) => o.text);
      for (const w of wrong) expect(fillers).toContain(w);
    });
  });

  describe('семантические соседи (neighbors)', () => {
    test('для вопросов, где ответ — СЛОВО, соседи приоритетнее прочих дистракторов', () => {
      const cards = bigPool();
      const target = cards[0]; // cup
      const neighbors = new Map([[target.id, ['mug', 'glass', 'bowl']]]);

      const [q] = buildQuiz([target], 1, cards, 'translationToWord', true, neighbors);

      expect(q.kind).toBe('translationToWord');
      const wrong = q.options.filter((o) => !o.correct).map((o) => o.text).sort();
      expect(wrong).toEqual(['bowl', 'glass', 'mug']);
      expect(correctOptions(q)[0].text).toBe('cup');
    });

    test('для переводных вопросов соседи НЕ используются', () => {
      const target = card({ mastery: 1, reps: 1, distractors: ['чашка', 'стакан', 'бокал'] });
      const neighbors = new Map([[target.id, ['mug', 'glass', 'bowl']]]);

      const [q] = buildQuiz([target], 1, [target], 'wordToTranslation', true, neighbors);

      const texts = q.options.map((o) => o.text);
      expect(texts).not.toContain('mug');
      expect(texts).not.toContain('glass');
      expect(texts).not.toContain('bowl');
    });
  });

  describe('forceKind', () => {
    test('typeWord: все вопросы — «впиши», подсказка — перевод, без вариантов', () => {
      const cards = bigPool();

      const qs = buildQuiz(cards, 4, cards, 'typeWord', true);

      for (const q of qs) {
        expect(q.kind).toBe('typeWord');
        expect(q.answerMode).toBe('type');
        expect(q.options).toEqual([]);
        expect(q.prompt).toBe(q.card.translation);
      }
    });

    test('карточки, к которым формат применим, идут первыми', () => {
      const noExample = card({ id: 'no-ex', word: 'door', translation: 'дверь', mastery: 1, reps: 1 });
      const withExample = card({
        id: 'with-ex',
        word: 'cup',
        examples: ['A cup of tea.'],
        mastery: 1,
        reps: 1,
      });
      const pool = [noExample, withExample];

      const [q] = buildQuiz(pool, 1, pool, 'clozeExample', true);

      expect(q.card.id).toBe('with-ex');
      expect(q.kind).toBe('clozeExample');
    });

    test('формат неприменим к карточке → адаптивный запасной вид (сессия не ломается)', () => {
      const noExample = card({ mastery: 1, reps: 1, examples: [] });

      const [q] = buildQuiz([noExample], 1, bigPool(), 'clozeExample', true);

      expect(q.kind).not.toBe('clozeExample');
    });

    test('clozeExample: в вопросе слово заменено пропуском ____', () => {
      const c = card({ word: 'cup', examples: ['I drink from my cup.'], mastery: 1, reps: 1 });

      const [q] = buildQuiz([c], 1, bigPool(), 'clozeExample', true);

      expect(q.kind).toBe('clozeExample');
      expect(q.prompt).toBe('I drink from my ____.');
      expect(q.promptMode).toBe('cloze');
    });

    test('пример с «cupboard» не годится для пропуска слова «cup» (границы слов)', () => {
      const c = card({ word: 'cup', examples: ['My cupboard is big.'], mastery: 1, reps: 1 });

      const [q] = buildQuiz([c], 1, bigPool(), 'clozeExample', true);

      expect(q.kind).not.toBe('clozeExample');
    });

    test('chooseSynonym: правильный ответ — синоним, само слово в вариантах не встречается', () => {
      const c = card({ synonyms: ['mug'], mastery: 1, reps: 1 });
      const pool = [c, ...bigPool().slice(1)];

      const [q] = buildQuiz([c], 1, pool, 'chooseSynonym', true);

      expect(q.kind).toBe('chooseSynonym');
      expect(correctOptions(q)).toHaveLength(1);
      expect(correctOptions(q)[0].text).toBe('mug');
      expect(q.options.map((o) => o.text)).not.toContain('cup');
    });

    test('translationToImage: варианты-картинки, ровно один correct', () => {
      const withImages = bigPool()
        .slice(0, 4)
        .map((c, i) => ({ ...c, imageUri: `file://img-${i}.jpg` }));
      const target = withImages[0];

      const [q] = buildQuiz([target], 1, withImages, 'translationToImage', true);

      expect(q.kind).toBe('translationToImage');
      expect(q.optionMode).toBe('image');
      expect(q.prompt).toBe(target.translation);
      expect(q.options).toHaveLength(4);
      expect(correctOptions(q)).toHaveLength(1);
      expect(correctOptions(q)[0].text).toBe(target.word);
      for (const o of q.options) expect(o.card).toBeDefined();
    });

    test('audioToWord: вопрос звучит, текста вопроса нет', () => {
      const c = card({ mastery: 1, reps: 1 });

      const [q] = buildQuiz([c], 1, bigPool(), 'audioToWord', true);

      expect(q.kind).toBe('audioToWord');
      expect(q.promptMode).toBe('audio');
      expect(q.prompt).toBe('');
      expect(correctOptions(q)[0].text).toBe('cup');
    });
  });

  describe('ярусы сложности по mastery (kindForCard через buildQuiz)', () => {
    test('mastery ≥4 → продукция: первый формат — typeWord', () => {
      const c = card({ mastery: 4, reps: 4 });

      const [q] = buildQuiz([c], 1, bigPool());

      expect(q.kind).toBe('typeWord');
    });

    test('mastery 2–3 с примером → ранняя продукция: clozeExample', () => {
      const c = card({ mastery: 2, reps: 2, examples: ['A cup of tea.'] });

      const [q] = buildQuiz([c], 1, bigPool());

      expect(q.kind).toBe('clozeExample');
    });

    test('mastery 2–3 без примера → внутри яруса берётся следующий формат (typeWord)', () => {
      const c = card({ mastery: 2, reps: 2, examples: [] });

      const [q] = buildQuiz([c], 1, bigPool());

      expect(q.kind).toBe('typeWord');
    });

    test('mastery ≤1 → узнавание: первый подходящий формат — wordToTranslation', () => {
      const c = card({ mastery: 1, reps: 1 });

      const [q] = buildQuiz([c], 1, bigPool());

      expect(q.kind).toBe('wordToTranslation');
      expect(q.prompt).toBe('cup');
      expect(correctOptions(q)[0].text).toBe('кружка');
    });
  });
});

describe('buildSpeakPhotoQuiz', () => {
  test('берёт только карточки с настоящим фото', () => {
    const noPhoto = card({ id: 'a' });
    const withPhoto = card({ id: 'b', imageUri: 'file://b.jpg', dueAt: Date.now() - 1000 });

    const qs = buildSpeakPhotoQuiz([noPhoto, withPhoto]);

    expect(qs).toHaveLength(1);
    expect(qs[0].card.id).toBe('b');
    expect(qs[0].kind).toBe('describePhoto');
    expect(qs[0].answerMode).toBe('write');
    expect(qs[0].promptMode).toBe('image');
  });

  test('просроченные идут первыми (самые старые сверху), затем ближайшие к повтору', () => {
    const now = Date.now();
    const cards = [
      card({ id: 'future', imageUri: 'f.jpg', dueAt: now + 100_000 }),
      card({ id: 'overdue-new', imageUri: 'o1.jpg', dueAt: now - 1_000 }),
      card({ id: 'overdue-old', imageUri: 'o2.jpg', dueAt: now - 100_000 }),
    ];

    const qs = buildSpeakPhotoQuiz(cards, 3);

    expect(qs.map((q) => q.card.id)).toEqual(['overdue-old', 'overdue-new', 'future']);
  });

  test('режется до count', () => {
    const now = Date.now();
    const cards = Array.from({ length: 7 }, (_, i) =>
      card({ id: `c${i}`, imageUri: `${i}.jpg`, dueAt: now - i }),
    );

    expect(buildSpeakPhotoQuiz(cards, 5)).toHaveLength(5);
  });
});
