/**
 * Юнит-тесты семантических соседей (semantic.ts → RPC nearest_cards):
 * маппинг ответа, лимит 12 карточек за сессию, гость и ошибки → пустая карта.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  configured: true,
  getSession: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => mocks.configured,
  supabase: { auth: { getSession: mocks.getSession }, rpc: mocks.rpc },
}));

import { fetchNeighbors } from '@/lib/semantic';
import type { WordCard } from '@/types';

function card(id: string): WordCard {
  return {
    id,
    emoji: '☕',
    word: `word-${id}`,
    translation: `перевод-${id}`,
    ipa: '',
    examples: [],
    category: null,
    learningLang: 'en-US',
    nativeLang: 'ru-RU',
    createdAt: 0,
  };
}

beforeEach(() => {
  mocks.configured = true;
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  mocks.rpc.mockReset().mockResolvedValue({ data: [], error: null });
});

describe('fetchNeighbors', () => {
  test('маппинг ответа RPC: слова обрезаются, пустые выбрасываются, порядок сохраняется', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ word: ' стул ' }, { word: 'полка' }, { word: '   ' }, { notWord: 1 }],
      error: null,
    });

    const map = await fetchNeighbors([card('a')]);

    expect(map.get('a')).toEqual(['стул', 'полка']);
  });

  test('RPC зовётся с id карточки и k=6', async () => {
    await fetchNeighbors([card('a')]);

    expect(mocks.rpc).toHaveBeenCalledWith('nearest_cards', { p_card: 'a', k: 6 });
  });

  test('Supabase не настроен → пустая карта, ни сессии, ни RPC', async () => {
    mocks.configured = false;

    const map = await fetchNeighbors([card('a')]);

    expect(map.size).toBe(0);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  test('гость (нет сессии) → пустая карта без RPC', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });

    const map = await fetchNeighbors([card('a')]);

    expect(map.size).toBe(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  test('лимит 12: соседей тянем максимум для 12 карточек за сессию', async () => {
    const cards = Array.from({ length: 15 }, (_, i) => card(`c${i}`));

    await fetchNeighbors(cards);

    expect(mocks.rpc).toHaveBeenCalledTimes(12);
  });

  test('карточки без id (синтетические) пропускаются', async () => {
    await fetchNeighbors([card(''), card('real')]);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('nearest_cards', { p_card: 'real', k: 6 });
  });

  test('ошибка RPC по карточке → карточка без соседей, остальные не страдают', async () => {
    mocks.rpc.mockImplementation(async (_fn: string, args: { p_card: string }) =>
      args.p_card === 'bad'
        ? { data: null, error: { message: 'no embedding' } }
        : { data: [{ word: 'сосед' }], error: null },
    );

    const map = await fetchNeighbors([card('bad'), card('good')]);

    expect(map.has('bad')).toBe(false);
    expect(map.get('good')).toEqual(['сосед']);
  });

  test('исключение в RPC по карточке глотается, остальные обрабатываются', async () => {
    mocks.rpc.mockImplementation(async (_fn: string, args: { p_card: string }) => {
      if (args.p_card === 'boom') throw new Error('network');
      return { data: [{ word: 'сосед' }], error: null };
    });

    const map = await fetchNeighbors([card('boom'), card('good')]);

    expect(map.has('boom')).toBe(false);
    expect(map.get('good')).toEqual(['сосед']);
  });

  test('пустой список соседей → записи в карте нет', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    const map = await fetchNeighbors([card('a')]);

    expect(map.has('a')).toBe(false);
  });

  test('не-массив в data → записи нет', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    const map = await fetchNeighbors([card('a')]);

    expect(map.size).toBe(0);
  });

  test('getSession бросил → пустая карта, наружу не летит', async () => {
    mocks.getSession.mockRejectedValue(new Error('storage down'));

    await expect(fetchNeighbors([card('a')])).resolves.toEqual(new Map());
  });
});
