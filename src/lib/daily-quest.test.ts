/**
 * Юнит-тесты ежедневного квеста: детерминизм целей по номеру дня, таймер сброса,
 * матчинг пойманного предмета с целью и сетевые фетчи плана/дайджеста агента
 * (Supabase замокан: любая проблема → null, пользователь ошибок не видит).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

// daily-quest тянет клиента Supabase (react-native внутри) — в node подменяем.
vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from },
  isSupabaseConfigured: () => true,
}));

import {
  QUEST_TARGETS,
  fetchAgentQuests,
  fetchCoachDigest,
  getDailyQuests,
  matchesQuest,
  msUntilQuestReset,
  todayIndex,
  type DailyQuest,
} from '@/lib/daily-quest';

const DAY_MS = 86_400_000;

/** Замокать цепочку from().select().eq()...maybeSingle() одним результатом. */
function stubQuery(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => ({
    data: result.data ?? null,
    error: result.error ?? null,
  }));
  mocks.from.mockReturnValue(builder);
  return builder;
}

/** Три валидные цели, как их пишет агент в daily_quests. */
function rawQuests(): unknown[] {
  return [
    { word: 'cup', translation: 'кружка', emoji: '☕', category: 'Кухня', ipa: 'kʌp' },
    { word: 'chair', translation: 'стул', emoji: '🪑' },
    { word: 'lamp', translation: 'лампа', emoji: '💡' },
  ];
}

afterEach(() => {
  vi.useRealTimers();
  mocks.from.mockReset();
});

describe('todayIndex', () => {
  test('номер дня = целые UTC-сутки от эпохи', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100 * DAY_MS + 5_000);

    expect(todayIndex()).toBe(100);
  });

  test('за миллисекунду до полуночи — ещё тот же день', () => {
    vi.useFakeTimers();
    vi.setSystemTime(101 * DAY_MS - 1);

    expect(todayIndex()).toBe(100);
  });
});

describe('msUntilQuestReset', () => {
  test('в начале суток до сброса — ровно сутки', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100 * DAY_MS);

    expect(msUntilQuestReset()).toBe(DAY_MS);
  });

  test('за миллисекунду до смены дня остаётся 1 мс', () => {
    vi.useFakeTimers();
    vi.setSystemTime(101 * DAY_MS - 1);

    expect(msUntilQuestReset()).toBe(1);
  });

  test('посреди дня — остаток до конца суток', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100 * DAY_MS + 5_000);

    expect(msUntilQuestReset()).toBe(DAY_MS - 5_000);
  });
});

describe('getDailyQuests', () => {
  test('ровно три цели, у всех — сегодняшний dayIndex и непустые поля', () => {
    vi.useFakeTimers();
    vi.setSystemTime(12_345 * DAY_MS + 42);

    const quests = getDailyQuests();

    expect(quests).toHaveLength(QUEST_TARGETS);
    for (const q of quests) {
      expect(q.dayIndex).toBe(12_345);
      expect(q.word).toBeTruthy();
      expect(q.translation).toBeTruthy();
      expect(q.emoji).toBeTruthy();
    }
  });

  test('детерминизм: в один день выдаётся один и тот же набор', () => {
    vi.useFakeTimers();
    vi.setSystemTime(777 * DAY_MS + 1_000);
    const first = getDailyQuests();

    vi.setSystemTime(777 * DAY_MS + 23 * 3_600_000);
    const second = getDailyQuests();

    expect(second).toEqual(first);
  });

  test('день 0: скользящее окно начинается с начала пула (apple/banana/orange)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const words = getDailyQuests().map((q) => q.word);

    expect(words).toEqual(['apple', 'banana', 'orange']);
  });

  test('слово из RECOGNIZABLE обогащается транскрипцией и категорией', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const [apple] = getDailyQuests();

    expect(apple.word).toBe('apple');
    expect(apple.ipa).toBe('ˈæp.əl');
    expect(apple.category).toBe('Еда');
  });

  test('на следующий день цели другие (окно сдвигается)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const day0 = getDailyQuests().map((q) => q.word);

    vi.setSystemTime(DAY_MS);
    const day1 = getDailyQuests().map((q) => q.word);

    expect(day1).not.toEqual(day0);
    expect(day1.every((w) => !day0.includes(w))).toBe(true);
  });
});

describe('matchesQuest', () => {
  const quest: DailyQuest = {
    word: 'bottle',
    translation: 'бутылка',
    emoji: '🍾',
    category: null,
    ipa: '',
    dayIndex: 0,
  };

  test.each([
    { candidates: ['bottle'], expected: true, label: 'точное слово' },
    { candidates: ['Bottle'], expected: true, label: 'регистр не важен' },
    { candidates: ['a bottle'], expected: true, label: 'артикль a отбрасывается' },
    { candidates: ['the bottle'], expected: true, label: 'артикль the отбрасывается' },
    { candidates: ['water bottle'], expected: true, label: 'общее целое слово: «water bottle» ~ «bottle»' },
    { candidates: ['бутылка'], expected: true, label: 'совпадение по переводу на родном' },
    { candidates: ['flask', 'бутылка'], expected: true, label: 'один из синонимов совпал по переводу' },
    { candidates: ['cup'], expected: false, label: 'другой предмет' },
    { candidates: [], expected: false, label: 'кандидатов нет' },
    { candidates: ['', '  '], expected: false, label: 'пустые строки не матчатся' },
  ])('$label → $expected', ({ candidates, expected }) => {
    expect(matchesQuest(candidates, quest)).toBe(expected);
  });

  test('изучаемый язык не английский: перевод сводит «batería» и «battery»', () => {
    const q: DailyQuest = { ...quest, word: 'battery', translation: 'батарейка' };

    expect(matchesQuest(['batería', 'батарейка'], q)).toBe(true);
  });

  test('короткие общие токены (≤2 букв) не засчитываются', () => {
    const q: DailyQuest = { ...quest, word: 'go', translation: 'идти' };

    expect(matchesQuest(['go home'], q)).toBe(false);
  });

  test('слово внутри другого слова не матчится («cup» ≠ «cupboard»)', () => {
    const q: DailyQuest = { ...quest, word: 'cup', translation: 'кружка' };

    expect(matchesQuest(['cupboard'], q)).toBe(false);
  });
});

describe('fetchAgentQuests', () => {
  test('happy path: три цели, сообщение тренера и упражнения', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(500 * DAY_MS + 1_000);
    stubQuery({
      data: {
        quests: rawQuests(),
        coach_message: '  Сегодня закрепим кухню!  ',
        exercises: [
          { v: 1, word: 'cup', kind: 'dictation', sentence: 'A cup of tea.', why: 'ошибки на слух' },
        ],
      },
    });

    const plan = await fetchAgentQuests('user-1');

    expect(plan).not.toBeNull();
    expect(plan!.quests).toHaveLength(3);
    expect(plan!.quests[0]).toMatchObject({
      word: 'cup',
      translation: 'кружка',
      emoji: '☕',
      category: 'Кухня',
      ipa: 'kʌp',
      dayIndex: 500,
    });
    expect(plan!.coachMessage).toBe('Сегодня закрепим кухню!');
    expect(plan!.exercises).toEqual([
      { v: 1, word: 'cup', kind: 'dictation', sentence: 'A cup of tea.', distractors: undefined, prompt: undefined, why: 'ошибки на слух' },
    ]);
  });

  test('цель без emoji получает заглушку «❓», края слова обрезаются', async () => {
    const quests = rawQuests();
    (quests[1] as Record<string, unknown>).word = '  chair  ';
    stubQuery({ data: { quests, coach_message: null, exercises: [] } });

    const plan = await fetchAgentQuests('user-1');

    expect(plan!.quests[1].word).toBe('chair');
    expect(plan!.quests[1].emoji).toBe('🪑');
    expect(plan!.quests[2].category).toBeNull();
    expect(plan!.quests[2].ipa).toBe('');
  });

  test.each([
    { data: null, label: 'строки нет' },
    { data: { quests: rawQuests().slice(0, 2), coach_message: '', exercises: [] }, label: 'целей меньше трёх' },
    { data: { quests: [...rawQuests(), { word: 'extra', translation: 'лишняя', emoji: 'x' }], coach_message: '', exercises: [] }, label: 'целей больше трёх' },
    { data: { quests: 'мусор', coach_message: '', exercises: [] }, label: 'quests — не массив' },
  ])('кривые данные ($label) → null', async ({ data }) => {
    stubQuery({ data });

    expect(await fetchAgentQuests('user-1')).toBeNull();
  });

  test('ошибка запроса → null (пользователь остаётся на статическом пуле)', async () => {
    stubQuery({ data: null, error: { message: 'boom' } });

    expect(await fetchAgentQuests('user-1')).toBeNull();
  });

  test('исключение в цепочке → null, наружу не летит', async () => {
    mocks.from.mockImplementation(() => {
      throw new Error('network down');
    });

    await expect(fetchAgentQuests('user-1')).resolves.toBeNull();
  });

  test('цели с нестроковым word отфильтровываются → счёт не сходится → null', async () => {
    const quests = rawQuests();
    (quests[0] as Record<string, unknown>).word = 42;
    stubQuery({ data: { quests, coach_message: '', exercises: [] } });

    expect(await fetchAgentQuests('user-1')).toBeNull();
  });

  test('пустое сообщение тренера (пробелы) → coachMessage null', async () => {
    stubQuery({ data: { quests: rawQuests(), coach_message: '   ', exercises: [] } });

    const plan = await fetchAgentQuests('user-1');

    expect(plan!.coachMessage).toBeNull();
  });

  describe('parseExercises (валидация тренировки на клиенте)', () => {
    async function planWith(exercises: unknown) {
      stubQuery({ data: { quests: rawQuests(), coach_message: 'x', exercises } });
      const plan = await fetchAgentQuests('user-1');
      return plan!.exercises;
    }

    test('exercises — не массив → пустая тренировка', async () => {
      expect(await planWith('мусор')).toEqual([]);
      expect(await planWith(null)).toEqual([]);
    });

    test('незнакомая версия схемы (v≠1) — молча мимо', async () => {
      const out = await planWith([
        { v: 2, word: 'cup', kind: 'dictation', sentence: 'A cup.' },
        { word: 'cup', kind: 'dictation', sentence: 'A cup.' },
      ]);

      expect(out).toEqual([]);
    });

    test('мусорные элементы (null, без слова, чужой kind) — мимо', async () => {
      const out = await planWith([
        null,
        { v: 1, word: '   ', kind: 'dictation' },
        { v: 1, word: 'cup', kind: 'hack' },
        { v: 1, kind: 'dictation' },
      ]);

      expect(out).toEqual([]);
    });

    test('валидное упражнение проходит с обрезкой полей', async () => {
      const out = await planWith([
        {
          v: 1,
          word: '  cup  ',
          kind: 'cloze',
          sentence: '  The ____ is red.  ',
          distractors: [' table ', '', null, 5],
          prompt: '  ',
          why: ' слабое слово ',
        },
      ]);

      expect(out).toEqual([
        {
          v: 1,
          word: 'cup',
          kind: 'cloze',
          sentence: 'The ____ is red.',
          distractors: ['table', '5'],
          prompt: undefined,
          why: 'слабое слово',
        },
      ]);
    });

    test('обрезается до 10 упражнений', async () => {
      const twelve = Array.from({ length: 12 }, (_, i) => ({
        v: 1,
        word: `w${i}`,
        kind: 'writeSentence',
      }));

      const out = await planWith(twelve);

      expect(out).toHaveLength(10);
      expect(out[9].word).toBe('w9');
    });
  });
});

describe('fetchCoachDigest', () => {
  test('happy path: дата недели режется до YYYY-MM-DD, текст обрезается по краям', async () => {
    stubQuery({ data: { week_start: '2026-07-06T00:00:00+00:00', digest: '  Неделя удалась!  ' } });

    const digest = await fetchCoachDigest('user-1');

    expect(digest).toEqual({ weekStart: '2026-07-06', digest: 'Неделя удалась!' });
  });

  test('строки нет → null', async () => {
    stubQuery({ data: null });

    expect(await fetchCoachDigest('user-1')).toBeNull();
  });

  test('ошибка запроса → null', async () => {
    stubQuery({ data: null, error: { message: 'boom' } });

    expect(await fetchCoachDigest('user-1')).toBeNull();
  });

  test.each([
    { data: { week_start: '2026-07-06', digest: '   ' }, label: 'пустой дайджест' },
    { data: { week_start: 42, digest: 'текст' }, label: 'week_start не строка' },
    { data: { week_start: '', digest: 'текст' }, label: 'week_start пустой' },
  ])('кривые данные ($label) → null', async ({ data }) => {
    stubQuery({ data });

    expect(await fetchCoachDigest('user-1')).toBeNull();
  });

  test('исключение в цепочке → null, наружу не летит', async () => {
    mocks.from.mockImplementation(() => {
      throw new Error('network down');
    });

    await expect(fetchCoachDigest('user-1')).resolves.toBeNull();
  });
});
