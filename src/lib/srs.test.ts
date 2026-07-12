/**
 * Юнит-тесты SRS (интервальное повторение, «SM-2-lite»).
 * Чистые функции: время передаём параметром `now`, Math.random в
 * buildSessionQueue не фиксируем — проверяем СВОЙСТВА результата, не порядок.
 */
import { describe, expect, test } from 'vitest';

import {
  MASTERY_LEARNED,
  buildSessionQueue,
  computeNextReview,
  freshSrs,
  hasReviewWork,
  isDue,
  isMastered,
} from '@/lib/srs';
import type { WordCard } from '@/types';

const MIN = 60_000;
const DAY = 1440;
const NOW = 1_700_000_000_000;

/** Карточка с дефолтами — переопределяем только нужное. */
function card(overrides: Partial<WordCard> = {}): WordCard {
  return {
    id: overrides.id ?? 'c1',
    emoji: '🍎',
    word: 'apple',
    translation: 'яблоко',
    ipa: '',
    examples: [],
    category: null,
    learningLang: 'en-US',
    nativeLang: 'ru-RU',
    createdAt: NOW,
    ...overrides,
  };
}

describe('computeNextReview', () => {
  describe('оценка «again» (забыл)', () => {
    test('сбрасывает reps в 0 и назначает повтор через 10 минут', () => {
      const upd = computeNextReview('again', { ease: 2.5, reps: 3, interval: 7 * DAY, mastery: 3 }, NOW);

      expect(upd.reps).toBe(0);
      expect(upd.interval).toBe(10);
      expect(upd.dueAt).toBe(NOW + 10 * MIN);
    });

    test('снижает ease на 0.2', () => {
      const upd = computeNextReview('again', { ease: 2.5, reps: 1, interval: DAY, mastery: 1 }, NOW);

      expect(upd.ease).toBeCloseTo(2.3, 10);
    });

    test('ease не падает ниже 1.3 (нижний clamp)', () => {
      const upd = computeNextReview('again', { ease: 1.4, reps: 1, interval: DAY, mastery: 1 }, NOW);

      expect(upd.ease).toBe(1.3);
    });

    test('mastery падает на 1, но не ниже 0', () => {
      const fromThree = computeNextReview('again', { ease: 2.5, reps: 2, interval: DAY, mastery: 3 }, NOW);
      const fromZero = computeNextReview('again', { ease: 2.5, reps: 0, interval: 0, mastery: 0 }, NOW);

      expect(fromThree.mastery).toBe(2);
      expect(fromZero.mastery).toBe(0);
    });
  });

  describe('оценка «good» (вспомнил): лестница интервалов', () => {
    test.each([
      { prevReps: 0, expectedDays: 1, label: 'первый успех → завтра' },
      { prevReps: 1, expectedDays: 3, label: 'второй успех → через 3 дня' },
      { prevReps: 2, expectedDays: 7, label: 'третий успех → через неделю' },
    ])('$label', ({ prevReps, expectedDays }) => {
      const upd = computeNextReview('good', { ease: 2.5, reps: prevReps, interval: DAY, mastery: 1 }, NOW);

      expect(upd.reps).toBe(prevReps + 1);
      expect(upd.interval).toBe(expectedDays * DAY);
      expect(upd.dueAt).toBe(NOW + expectedDays * DAY * MIN);
    });

    test('с четвёртого успеха интервал растёт по SM-2: prevInterval × ease', () => {
      const upd = computeNextReview('good', { ease: 2.5, reps: 3, interval: 7 * DAY, mastery: 3 }, NOW);

      expect(upd.reps).toBe(4);
      expect(upd.interval).toBe(Math.round(7 * DAY * 2.5));
    });

    test('ease не меняется, но зажимается в пределы, если пришёл кривой', () => {
      const normal = computeNextReview('good', { ease: 2.5, reps: 0, interval: 0, mastery: 0 }, NOW);
      const tooBig = computeNextReview('good', { ease: 9, reps: 0, interval: 0, mastery: 0 }, NOW);
      const tooSmall = computeNextReview('good', { ease: 0.5, reps: 0, interval: 0, mastery: 0 }, NOW);

      expect(normal.ease).toBe(2.5);
      expect(tooBig.ease).toBe(3.0);
      expect(tooSmall.ease).toBe(1.3);
    });

    test('mastery растёт на 1, но не выше 5', () => {
      const fromTwo = computeNextReview('good', { ease: 2.5, reps: 1, interval: DAY, mastery: 2 }, NOW);
      const fromFive = computeNextReview('good', { ease: 2.5, reps: 4, interval: 30 * DAY, mastery: 5 }, NOW);

      expect(fromTwo.mastery).toBe(3);
      expect(fromFive.mastery).toBe(5);
    });
  });

  describe('оценка «easy» (легко)', () => {
    test('легко с первого раза → сразу через 4 дня', () => {
      const upd = computeNextReview('easy', { ease: 2.5, reps: 0, interval: 0, mastery: 0 }, NOW);

      expect(upd.reps).toBe(1);
      expect(upd.interval).toBe(4 * DAY);
      expect(upd.dueAt).toBe(NOW + 4 * DAY * MIN);
    });

    test('дальше растёт быстрее good: prevInterval × ease × 1.3 (с уже поднятым ease)', () => {
      const upd = computeNextReview('easy', { ease: 2.5, reps: 1, interval: 4 * DAY, mastery: 2 }, NOW);

      // ease сначала поднимается до 2.65, интервал считается уже по нему.
      expect(upd.ease).toBeCloseTo(2.65, 10);
      expect(upd.interval).toBe(Math.round(4 * DAY * 2.65 * 1.3));
    });

    test('ease растёт на 0.15, но не выше 3.0 (верхний clamp)', () => {
      const upd = computeNextReview('easy', { ease: 2.95, reps: 2, interval: 3 * DAY, mastery: 3 }, NOW);

      expect(upd.ease).toBe(3.0);
    });

    test('mastery растёт на 2, но не выше 5', () => {
      const fromOne = computeNextReview('easy', { ease: 2.5, reps: 1, interval: DAY, mastery: 1 }, NOW);
      const fromFour = computeNextReview('easy', { ease: 2.5, reps: 1, interval: DAY, mastery: 4 }, NOW);

      expect(fromOne.mastery).toBe(3);
      expect(fromFour.mastery).toBe(5);
    });
  });

  describe('дефолты для карточки без srs-полей', () => {
    test('отсутствующие поля трактуются как ease=2.5, reps=0, interval=0, mastery=0', () => {
      const upd = computeNextReview('good', {}, NOW);

      expect(upd).toEqual({
        interval: DAY,
        ease: 2.5,
        reps: 1,
        mastery: 1,
        dueAt: NOW + DAY * MIN,
      });
    });

    test('«again» на пустой карточке безопасен: mastery остаётся 0', () => {
      const upd = computeNextReview('again', {}, NOW);

      expect(upd.mastery).toBe(0);
      expect(upd.reps).toBe(0);
      expect(upd.ease).toBeCloseTo(2.3, 10);
    });
  });
});

describe('freshSrs', () => {
  test('новая карточка сразу доступна к повтору (dueAt = now)', () => {
    const s = freshSrs(NOW);

    expect(s).toEqual({ interval: 0, ease: 2.5, reps: 0, mastery: 0, dueAt: NOW });
  });
});

describe('isDue', () => {
  test.each([
    { dueAt: NOW - 1, expected: true, label: 'просроченная — пора' },
    { dueAt: NOW, expected: true, label: 'ровно сейчас — пора (граница включена)' },
    { dueAt: NOW + 1, expected: false, label: 'в будущем — рано' },
    { dueAt: undefined, expected: true, label: 'без dueAt — считается пора (0 <= now)' },
  ])('$label', ({ dueAt, expected }) => {
    expect(isDue({ dueAt }, NOW)).toBe(expected);
  });
});

describe('isMastered', () => {
  test.each([
    { mastery: MASTERY_LEARNED, expected: true, label: 'на пороге (4) — выучено' },
    { mastery: 5, expected: true, label: 'выше порога — выучено' },
    { mastery: 3, expected: false, label: 'ниже порога — ещё нет' },
    { mastery: undefined, expected: false, label: 'без mastery — не выучено' },
  ])('$label', ({ mastery, expected }) => {
    expect(isMastered({ mastery })).toBe(expected);
  });
});

describe('hasReviewWork', () => {
  test('пустая коллекция — работы нет', () => {
    expect(hasReviewWork([], NOW)).toBe(false);
  });

  test('новое слово (reps=0) — есть что учить, даже если dueAt в будущем', () => {
    const cards = [card({ reps: 0, dueAt: NOW + DAY * MIN })];

    expect(hasReviewWork(cards, NOW)).toBe(true);
  });

  test('старое просроченное слово — есть что повторять', () => {
    const cards = [card({ reps: 3, dueAt: NOW - 1 })];

    expect(hasReviewWork(cards, NOW)).toBe(true);
  });

  test('все слова старые и не просроченные — работы нет', () => {
    const cards = [
      card({ id: 'a', reps: 2, dueAt: NOW + 1 }),
      card({ id: 'b', reps: 5, dueAt: NOW + DAY * MIN }),
    ];

    expect(hasReviewWork(cards, NOW)).toBe(false);
  });
});

describe('buildSessionQueue', () => {
  const newCard = (id: string) => card({ id, reps: 0, dueAt: NOW });
  const dueOld = (id: string, dueAt = NOW - 1000) => card({ id, reps: 3, dueAt });
  const futureOld = (id: string, dueAt: number) => card({ id, reps: 3, dueAt });

  test('пустая коллекция → пустая сессия', () => {
    expect(buildSessionQueue([], 20, NOW)).toEqual([]);
  });

  test('нет дублей и все карточки из входа', () => {
    const cards = [
      ...Array.from({ length: 10 }, (_, i) => newCard(`n${i}`)),
      ...Array.from({ length: 10 }, (_, i) => dueOld(`d${i}`)),
    ];
    const queue = buildSessionQueue(cards, 20, NOW);

    const ids = queue.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const inputIds = new Set(cards.map((c) => c.id));
    for (const id of ids) expect(inputIds.has(id)).toBe(true);
  });

  test('размер сессии = min(size, всего карточек)', () => {
    const many = Array.from({ length: 30 }, (_, i) => dueOld(`d${i}`));
    const few = Array.from({ length: 5 }, (_, i) => newCard(`n${i}`));

    expect(buildSessionQueue(many, 20, NOW)).toHaveLength(20);
    expect(buildSessionQueue(few, 20, NOW)).toHaveLength(5);
  });

  test('ядро (новые + просроченные) вытесняет непросроченные старые', () => {
    // Ядро: 10 новых (возьмётся 6) + 4 просроченных = 10 ≥ size 8 → добора нет.
    const cards = [
      ...Array.from({ length: 10 }, (_, i) => newCard(`n${i}`)),
      ...Array.from({ length: 4 }, (_, i) => dueOld(`d${i}`)),
      ...Array.from({ length: 10 }, (_, i) => futureOld(`f${i}`, NOW + (i + 1) * DAY * MIN)),
    ];
    const queue = buildSessionQueue(cards, 8, NOW);

    expect(queue).toHaveLength(8);
    expect(queue.every((c) => !c.id.startsWith('f'))).toBe(true);
  });

  test('новых в ядре не больше 6 (когда добор не нужен)', () => {
    // 20 новых + 14 просроченных: ядро = 6 новых + 14 старых = ровно size 20.
    const cards = [
      ...Array.from({ length: 20 }, (_, i) => newCard(`n${i}`)),
      ...Array.from({ length: 14 }, (_, i) => dueOld(`d${i}`)),
    ];
    const queue = buildSessionQueue(cards, 20, NOW);

    expect(queue).toHaveLength(20);
    expect(queue.filter((c) => c.id.startsWith('n'))).toHaveLength(6);
    expect(queue.filter((c) => c.id.startsWith('d'))).toHaveLength(14);
  });

  test('все просроченные старые попадают в сессию, пока влезают', () => {
    const cards = [
      ...Array.from({ length: 3 }, (_, i) => newCard(`n${i}`)),
      ...Array.from({ length: 5 }, (_, i) => dueOld(`d${i}`)),
    ];
    const queue = buildSessionQueue(cards, 20, NOW);

    const dueIds = queue.filter((c) => c.id.startsWith('d')).map((c) => c.id);
    expect(dueIds.sort()).toEqual(['d0', 'd1', 'd2', 'd3', 'd4']);
  });

  test('добор — карточки, которым раньше всех повторяться (по dueAt)', () => {
    // Ядро: 2 новых + 1 просроченная = 3; добор до 5 — две ближайшие по dueAt.
    const cards = [
      newCard('n0'),
      newCard('n1'),
      dueOld('d0'),
      futureOld('near1', NOW + 1 * MIN),
      futureOld('near2', NOW + 2 * MIN),
      futureOld('far1', NOW + 100 * DAY * MIN),
      futureOld('far2', NOW + 200 * DAY * MIN),
    ];
    const queue = buildSessionQueue(cards, 5, NOW);

    const ids = new Set(queue.map((c) => c.id));
    expect(queue).toHaveLength(5);
    expect(ids.has('near1')).toBe(true);
    expect(ids.has('near2')).toBe(true);
    expect(ids.has('far1')).toBe(false);
    expect(ids.has('far2')).toBe(false);
  });

  test('размер по умолчанию — 20', () => {
    const cards = Array.from({ length: 40 }, (_, i) => dueOld(`d${i}`));

    expect(buildSessionQueue(cards, undefined, NOW)).toHaveLength(20);
  });
});
