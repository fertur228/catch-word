/**
 * Юнит-тесты телеметрии ответов (telemetry.ts): очередь с капом, батч одним
 * RPC-вызовом по таймеру 5 с, отбрасывание событий гостя и глотание ошибок.
 *
 * Модуль держит состояние (очередь, таймер) — каждый тест импортирует свежую
 * копию через vi.resetModules(); таймеры фейковые.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { ReviewEventInput } from '@/lib/telemetry';

const mocks = vi.hoisted(() => ({
  configured: true,
  getSession: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => mocks.configured,
  supabase: { auth: { getSession: mocks.getSession }, rpc: mocks.rpc },
}));

const FLUSH_MS = 5_000;

let telemetry: typeof import('@/lib/telemetry');

function ev(overrides: Partial<ReviewEventInput> = {}): ReviewEventInput {
  return {
    cardId: 'c1',
    word: 'cup',
    dayIndex: 100,
    learningLang: 'en-US',
    nativeLang: 'ru-RU',
    source: 'quiz',
    kind: 'typeWord',
    ...overrides,
  };
}

/** Батч, ушедший в i-й RPC-вызов. */
function sentBatch(i = 0): Array<Record<string, unknown>> {
  return mocks.rpc.mock.calls[i][1].p_events;
}

beforeEach(async () => {
  vi.useFakeTimers();
  mocks.configured = true;
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  vi.resetModules();
  telemetry = await import('@/lib/telemetry');
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('logReviewEvent + таймер', () => {
  test('батч из нескольких событий уходит ОДНИМ rpc-вызовом через 5 с', async () => {
    telemetry.logReviewEvent(ev({ word: 'a' }));
    telemetry.logReviewEvent(ev({ word: 'b' }));
    telemetry.logReviewEvent(ev({ word: 'c' }));
    expect(mocks.rpc).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('log_review_events', { p_events: expect.any(Array) });
    expect(sentBatch()).toHaveLength(3);
    expect(sentBatch().map((r) => r.word)).toEqual(['a', 'b', 'c']);
  });

  test('payload — снейк-кейс, ответ режется до 500, response_ms округляется', async () => {
    telemetry.logReviewEvent(
      ev({
        cardId: 'card-9',
        correct: true,
        rating: 'good',
        answer: 'x'.repeat(600),
        score: 0.75,
        responseMs: 123.6,
      }),
    );

    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    const row = sentBatch()[0];
    expect(row).toMatchObject({
      card_id: 'card-9',
      word: 'cup',
      day_index: 100,
      learning_lang: 'en-US',
      native_lang: 'ru-RU',
      source: 'quiz',
      kind: 'typeWord',
      correct: true,
      rating: 'good',
      score: 0.75,
      response_ms: 124,
    });
    expect((row.answer as string).length).toBe(500);
  });

  test('необязательные поля по умолчанию — null', async () => {
    telemetry.logReviewEvent(ev());

    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    expect(sentBatch()[0]).toMatchObject({
      correct: null,
      rating: null,
      answer: null,
      score: null,
      response_ms: null,
    });
  });

  test('события без word или kind не попадают в очередь', async () => {
    telemetry.logReviewEvent(ev({ word: '' }));
    telemetry.logReviewEvent(ev({ kind: '' }));

    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  test('Supabase не настроен → события выбрасываются молча', async () => {
    mocks.configured = false;

    telemetry.logReviewEvent(ev());
    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  test('кап очереди 100: старые события вытесняются новыми', async () => {
    for (let i = 0; i < 105; i += 1) telemetry.logReviewEvent(ev({ word: `w${i}` }));

    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    const batch = sentBatch();
    expect(batch).toHaveLength(100);
    expect(batch[0].word).toBe('w5'); // w0..w4 вытеснены
    expect(batch[99].word).toBe('w104');
  });

  test('пустая очередь не порождает rpc-вызовов (таймер тикает вхолостую)', async () => {
    telemetry.logReviewEvent(ev());
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(FLUSH_MS * 3);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  test('после flush очередь пуста — события не шлются повторно', async () => {
    telemetry.logReviewEvent(ev({ word: 'first' }));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    telemetry.logReviewEvent(ev({ word: 'second' }));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(sentBatch(1).map((r) => r.word)).toEqual(['second']);
  });
});

describe('гость', () => {
  test('нет сессии → батч отброшен, rpc не зовётся', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });

    telemetry.logReviewEvent(ev());
    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  test('события гостя потеряны by design: после входа уходит только новое', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } });
    telemetry.logReviewEvent(ev({ word: 'guest-era' }));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    telemetry.logReviewEvent(ev({ word: 'logged-in' }));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(sentBatch().map((r) => r.word)).toEqual(['logged-in']);
  });
});

describe('ошибки глотаются (телеметрия не ломает UX)', () => {
  test('rpc упал → без исключений, следующий батч уходит нормально', async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('db down'));
    telemetry.logReviewEvent(ev({ word: 'lost' }));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    telemetry.logReviewEvent(ev({ word: 'ok' }));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(sentBatch(1).map((r) => r.word)).toEqual(['ok']);
  });

  test('getSession упал → событие теряется молча', async () => {
    mocks.getSession.mockRejectedValueOnce(new Error('storage down'));

    telemetry.logReviewEvent(ev());
    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('flushReviewEvents', () => {
  test('досрочный сброс шлёт очередь, не дожидаясь таймера', async () => {
    telemetry.logReviewEvent(ev({ word: 'now' }));

    telemetry.flushReviewEvents();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(sentBatch().map((r) => r.word)).toEqual(['now']);
  });

  test('сброс пустой очереди — no-op', async () => {
    telemetry.flushReviewEvents();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
});
