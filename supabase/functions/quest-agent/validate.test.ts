/**
 * Юнит-тесты серверного валидатора упражнений (guardrails Э3 — кодом, не
 * промптом): невалидное упражнение отбрасывается молча, квест важнее тренировки.
 */
import { describe, expect, test } from 'vitest';

import { validateExercises } from './validate.ts';

const ALLOWED = new Set(['cup', 'table', 'chair']);

describe('validateExercises', () => {
  test('не-массив на входе → пусто', () => {
    expect(validateExercises(null, ALLOWED)).toEqual([]);
    expect(validateExercises('мусор', ALLOWED)).toEqual([]);
    expect(validateExercises({ word: 'cup' }, ALLOWED)).toEqual([]);
  });

  test('валидный dictation проходит и получает v:1', () => {
    const out = validateExercises(
      [{ word: 'cup', kind: 'dictation', sentence: 'A cup of tea.', why: 'слабое слово' }],
      ALLOWED,
    );

    expect(out).toEqual([
      { v: 1, word: 'cup', kind: 'dictation', sentence: 'A cup of tea.', why: 'слабое слово' },
    ]);
  });

  describe('белый список kind', () => {
    test.each([
      { kind: 'dictation', sentence: 'A cup.', valid: true },
      { kind: 'cloze', sentence: 'A ____.', distractors: ['a', 'b'], valid: true },
      { kind: 'writeSentence', valid: true },
      { kind: 'multipleChoice', valid: false },
      { kind: '', valid: false },
      { kind: undefined, valid: false },
    ])('kind=$kind → валиден: $valid', ({ kind, sentence, distractors, valid }) => {
      const out = validateExercises([{ word: 'cup', kind, sentence, distractors }], ALLOWED);

      expect(out.length).toBe(valid ? 1 : 0);
    });
  });

  describe('слова только из allowedWords', () => {
    test('слово вне коллекции и целей квеста — мимо', () => {
      const out = validateExercises([{ word: 'zebra', kind: 'writeSentence' }], ALLOWED);

      expect(out).toEqual([]);
    });

    test('регистр не важен, края обрезаются', () => {
      const out = validateExercises([{ word: '  CUP ', kind: 'writeSentence' }], ALLOWED);

      expect(out).toHaveLength(1);
      expect(out[0].word).toBe('CUP');
    });

    test('пустое слово — мимо', () => {
      expect(validateExercises([{ word: '   ', kind: 'writeSentence' }], ALLOWED)).toEqual([]);
    });
  });

  describe('cloze', () => {
    test('без пропуска ____ — мимо', () => {
      const out = validateExercises(
        [{ word: 'cup', kind: 'cloze', sentence: 'A cup of tea.', distractors: ['a', 'b'] }],
        ALLOWED,
      );

      expect(out).toEqual([]);
    });

    test('меньше 2 дистракторов — мимо', () => {
      const out = validateExercises(
        [{ word: 'cup', kind: 'cloze', sentence: 'A ____ of tea.', distractors: ['a'] }],
        ALLOWED,
      );

      expect(out).toEqual([]);
    });

    test('без предложения — мимо', () => {
      expect(validateExercises([{ word: 'cup', kind: 'cloze', distractors: ['a', 'b'] }], ALLOWED)).toEqual([]);
    });

    test('дистракторы: максимум 3, пустые и null выбрасываются, значения приводятся к строке', () => {
      const out = validateExercises(
        [
          {
            word: 'cup',
            kind: 'cloze',
            sentence: 'A ____ of tea.',
            distractors: [' bowl ', '', null, 5, 'plate', 'fork'],
          },
        ],
        ALLOWED,
      );

      expect(out).toHaveLength(1);
      expect(out[0].distractors).toEqual(['bowl', '5', 'plate']);
    });

    test('валидный cloze с двумя дистракторами проходит', () => {
      const out = validateExercises(
        [{ word: 'cup', kind: 'cloze', sentence: 'Put the ____ here.', distractors: ['table', 'chair'] }],
        ALLOWED,
      );

      expect(out).toEqual([
        { v: 1, word: 'cup', kind: 'cloze', sentence: 'Put the ____ here.', distractors: ['table', 'chair'] },
      ]);
    });
  });

  describe('dictation', () => {
    test('предложение без целевого слова — мимо', () => {
      const out = validateExercises(
        [{ word: 'cup', kind: 'dictation', sentence: 'The table is big.' }],
        ALLOWED,
      );

      expect(out).toEqual([]);
    });

    test('без предложения — мимо', () => {
      expect(validateExercises([{ word: 'cup', kind: 'dictation' }], ALLOWED)).toEqual([]);
    });

    test('слово в предложении находится без учёта регистра', () => {
      const out = validateExercises(
        [{ word: 'cup', kind: 'dictation', sentence: 'The CUP is red.' }],
        ALLOWED,
      );

      expect(out).toHaveLength(1);
    });
  });

  describe('обрезки полей', () => {
    test('sentence режется до 120 символов', () => {
      const long = `cup ${'x'.repeat(200)}`;
      const out = validateExercises([{ word: 'cup', kind: 'dictation', sentence: long }], ALLOWED);

      expect(out).toHaveLength(1);
      expect(out[0].sentence).toHaveLength(120);
    });

    test('prompt режется до 120, why — до 80', () => {
      const out = validateExercises(
        [{ word: 'cup', kind: 'writeSentence', prompt: 'п'.repeat(200), why: 'ы'.repeat(200) }],
        ALLOWED,
      );

      expect(out[0].prompt).toHaveLength(120);
      expect(out[0].why).toHaveLength(80);
    });

    test('пустые необязательные поля не попадают в результат', () => {
      const out = validateExercises(
        [{ word: 'cup', kind: 'writeSentence', sentence: '  ', prompt: '', why: '  ', distractors: [] }],
        ALLOWED,
      );

      expect(out).toEqual([{ v: 1, word: 'cup', kind: 'writeSentence' }]);
      expect(out[0]).not.toHaveProperty('sentence');
      expect(out[0]).not.toHaveProperty('distractors');
      expect(out[0]).not.toHaveProperty('prompt');
      expect(out[0]).not.toHaveProperty('why');
    });
  });

  describe('количество', () => {
    test('не больше 8 упражнений на выходе', () => {
      const ten = Array.from({ length: 10 }, () => ({ word: 'cup', kind: 'writeSentence' }));

      expect(validateExercises(ten, ALLOWED)).toHaveLength(8);
    });

    test('рассматриваются только первые 10 элементов входа', () => {
      const raw = [
        ...Array.from({ length: 10 }, () => ({ word: 'zebra', kind: 'writeSentence' })), // все мимо
        { word: 'cup', kind: 'writeSentence' }, // валидный, но 11-й
      ];

      expect(validateExercises(raw, ALLOWED)).toEqual([]);
    });
  });

  test('null-элементы и мусор в массиве пропускаются, валидные соседи выживают', () => {
    const out = validateExercises(
      [null, 42, 'строка', { word: 'table', kind: 'writeSentence' }],
      ALLOWED,
    );

    expect(out).toEqual([{ v: 1, word: 'table', kind: 'writeSentence' }]);
  });
});
