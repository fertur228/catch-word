/**
 * Семантические соседи карточек (движок v2, Э5 → RPC nearest_cards).
 *
 * Умные дистракторы: неверные варианты в тестах — ближайшие по смыслу слова
 * коллекции («стол» → стул/полка/шкаф), а не случайные. RPC отдаёт соседей
 * ТОЛЬКО своей коллекции (auth.uid() внутри, security definer).
 *
 * Fire-and-forget по духу: любая ошибка → пустая карта, квиз соберётся на
 * старых правилах (категория/пул) — пользователь разницы не заметит.
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { WordCard } from '@/types';

/** Максимум карточек, для которых тянем соседей за одну сессию. */
const MAX_CARDS = 12;

export type NeighborMap = Map<string, string[]>;

/** Соседи для карточек сессии: cardId → слова по близости (ближние первыми). */
export async function fetchNeighbors(cards: WordCard[]): Promise<NeighborMap> {
  const map: NeighborMap = new Map();
  try {
    if (!isSupabaseConfigured()) return map;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return map; // гость — эмбеддингов нет
    const targets = cards.filter((c) => c.id).slice(0, MAX_CARDS);
    await Promise.all(
      targets.map(async (c) => {
        try {
          const { data: rows, error } = await supabase.rpc('nearest_cards', {
            p_card: c.id,
            k: 6,
          });
          if (!error && Array.isArray(rows) && rows.length) {
            map.set(
              c.id,
              rows
                .map((r: { word?: unknown }) => String(r.word ?? '').trim())
                .filter(Boolean),
            );
          }
        } catch {
          /* карточка без эмбеддинга/сеть — молча мимо */
        }
      }),
    );
  } catch {
    /* телеметрия дистракторов не стоит ошибки */
  }
  return map;
}
