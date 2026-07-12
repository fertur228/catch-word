/**
 * Юнит-тесты клиента ИИ-оценки (grade.ts): контракт отказоустойчивости B.2 —
 * gradeAnswer никогда не бросает и всегда возвращает структурированный итог.
 * fetch застаблен глобально, Supabase-клиент замокан.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  configured: true,
  getSession: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => mocks.configured,
  supabase: { auth: { getSession: mocks.getSession } },
}));

import { gradeAnswer, type GradeRequest } from '@/lib/grade';

const URL_ENV = 'https://unit.supabase.co';
const ANON = 'anon-key';
const TOKEN = 'token-123';

function req(overrides: Partial<GradeRequest> = {}): GradeRequest {
  return {
    task: 'dictation',
    word: 'cup',
    expected: 'A cup of tea.',
    userAnswer: 'a cup of tea',
    learningLang: 'en-US',
    nativeLang: 'ru-RU',
    ...overrides,
  };
}

/** Лёгкий стаб Response: grade.ts трогает только ok/status/json(). */
function httpResponse(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  mocks.configured = true;
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: TOKEN } } });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', URL_ENV);
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', ANON);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('gradeAnswer — happy path', () => {
  test('валидный ответ сервера транслируется как есть', async () => {
    fetchMock.mockResolvedValue(
      httpResponse(200, { verdict: 'correct', score: 0.9, feedback: 'Отлично', corrected: 'A cup of tea.' }),
    );

    const out = await gradeAnswer(req());

    expect(out).toEqual({
      ok: true,
      verdict: 'correct',
      score: 0.9,
      feedback: 'Отлично',
      corrected: 'A cup of tea.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('запрос уходит на edge-функцию с ключами и токеном сессии', async () => {
    fetchMock.mockResolvedValue(httpResponse(200, { verdict: 'wrong', score: 0 }));

    await gradeAnswer(req());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${URL_ENV}/functions/v1/grade-answer`);
    expect(init.method).toBe('POST');
    expect(init.headers.apikey).toBe(ANON);
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  test.each([
    { score: 5, expected: 1, label: 'score выше 1 зажимается до 1' },
    { score: -3, expected: 0, label: 'отрицательный score зажимается до 0' },
    { score: 'мусор', expected: 0, label: 'нечисловой score → 0' },
    { score: 0.5, expected: 0.5, label: 'обычный score проходит без изменений' },
  ])('$label', async ({ score, expected }) => {
    fetchMock.mockResolvedValue(httpResponse(200, { verdict: 'partial', score }));

    const out = await gradeAnswer(req());

    expect(out).toMatchObject({ ok: true, score: expected });
  });

  test('verdict вне enum → partial (мягкая деградация)', async () => {
    fetchMock.mockResolvedValue(httpResponse(200, { verdict: 'excellent', score: 1 }));

    const out = await gradeAnswer(req());

    expect(out).toMatchObject({ ok: true, verdict: 'partial' });
  });

  test('отсутствующие feedback/corrected → пустые строки', async () => {
    fetchMock.mockResolvedValue(httpResponse(200, { verdict: 'wrong', score: 0 }));

    const out = await gradeAnswer(req());

    expect(out).toMatchObject({ ok: true, feedback: '', corrected: '' });
  });

  test('userAnswer обрезается до 500 символов перед отправкой', async () => {
    fetchMock.mockResolvedValue(httpResponse(200, { verdict: 'wrong', score: 0 }));

    await gradeAnswer(req({ userAnswer: 'a'.repeat(600) }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.userAnswer).toHaveLength(500);
  });
});

describe('gradeAnswer — отказ доступа', () => {
  test('Supabase не настроен → unavailable, ни сессии, ни fetch', async () => {
    mocks.configured = false;

    const out = await gradeAnswer(req());

    expect(out).toEqual({ ok: false, reason: 'unavailable' });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('гость (нет сессии) → auth без похода в сеть', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });

    const out = await gradeAnswer(req());

    expect(out).toEqual({ ok: false, reason: 'auth' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('нет env-переменных → unavailable без fetch', async () => {
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', '');

    const out = await gradeAnswer(req());

    expect(out).toEqual({ ok: false, reason: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('getSession бросил исключение → unavailable, наружу не летит', async () => {
    mocks.getSession.mockRejectedValue(new Error('storage down'));

    await expect(gradeAnswer(req())).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('gradeAnswer — HTTP-статусы', () => {
  test('401 → auth, ретрая нет', async () => {
    fetchMock.mockResolvedValue(httpResponse(401));

    const out = await gradeAnswer(req());

    expect(out).toEqual({ ok: false, reason: 'auth' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('429 (кап 50/день) → limit, ретрая нет', async () => {
    fetchMock.mockResolvedValue(httpResponse(429));

    const out = await gradeAnswer(req());

    expect(out).toEqual({ ok: false, reason: 'limit' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('5xx дважды → один ретрай и unavailable', async () => {
    fetchMock.mockResolvedValue(httpResponse(500));

    const out = await gradeAnswer(req());

    expect(out).toEqual({ ok: false, reason: 'unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('5xx, затем успех → ответ со второй попытки', async () => {
    fetchMock
      .mockResolvedValueOnce(httpResponse(503))
      .mockResolvedValueOnce(httpResponse(200, { verdict: 'correct', score: 1 }));

    const out = await gradeAnswer(req());

    expect(out).toMatchObject({ ok: true, verdict: 'correct' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('тело без verdict → считается неудачей → ретрай → unavailable', async () => {
    fetchMock.mockResolvedValue(httpResponse(200, { score: 1 }));

    const out = await gradeAnswer(req());

    expect(out).toEqual({ ok: false, reason: 'unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('сетевое исключение в обоих заходах → unavailable', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    const out = await gradeAnswer(req());

    expect(out).toEqual({ ok: false, reason: 'unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('gradeAnswer — таймауты (потолок ~6 с: 4 с + ретрай 2 с)', () => {
  test('обе попытки зависли → abort по таймеру и unavailable', async () => {
    vi.useFakeTimers();
    // fetch «висит», пока AbortController его не прервёт.
    fetchMock.mockImplementation(
      (_url: string, init: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const promise = gradeAnswer(req());
    await vi.advanceTimersByTimeAsync(4_000); // первая попытка отваливается
    await vi.advanceTimersByTimeAsync(2_000); // ретрай отваливается

    await expect(promise).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('первая попытка зависла, ретрай успел → успех', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockImplementationOnce(
        (_url: string, init: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      )
      .mockResolvedValueOnce(httpResponse(200, { verdict: 'correct', score: 1 }));

    const promise = gradeAnswer(req());
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(0);

    await expect(promise).resolves.toMatchObject({ ok: true, verdict: 'correct' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
