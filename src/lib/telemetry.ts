/**
 * Телеметрия ответов (движок v2, Э1): каждое взаимодействие в Повторении
 * пишется в review_events через RPC log_review_events (кап — на сервере).
 *
 * Схема работы:
 *
 *   logReviewEvent() ─► очередь (≤100, старые вытесняются)
 *        │                  │ таймер 5 с
 *        │                  ▼
 *        │            flush() ─► supabase.rpc('log_review_events')
 *        └ вкладка ушла в фон ─► flush({ keepalive: true }) — fetch с
 *          keepalive и обычными заголовками (sendBeacon НЕ умеет ставить
 *          Authorization — под RLS он бы молча получал 401 на каждый вызов).
 *
 * Правила:
 *  - fire-and-forget: любая ошибка глотается, UX не ломается никогда;
 *  - гость (нет сессии) — события отбрасываются;
 *  - потеря отдельных событий допустима by design.
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/** Одно событие ответа. day_index фиксируется на СТАРТЕ сессии (не на событии). */
export interface ReviewEventInput {
  cardId: string | null;
  word: string;
  dayIndex: number;
  learningLang: string;
  nativeLang: string;
  source: 'flashcards' | 'quiz' | 'workout';
  kind: string;
  correct?: boolean | null;
  rating?: string | null;
  answer?: string | null;
  score?: number | null;
  responseMs?: number | null;
}

const MAX_QUEUE = 100;
const FLUSH_MS = 5_000;

const queue: ReviewEventInput[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let listenerInstalled = false;
/** Кэш токена для keepalive-пути (в обработчике `hidden` не ждём async). */
let cachedToken: string | null = null;

/** Снейк-кейс payload для RPC. */
function toRow(ev: ReviewEventInput): Record<string, unknown> {
  return {
    card_id: ev.cardId,
    word: ev.word,
    day_index: ev.dayIndex,
    learning_lang: ev.learningLang,
    native_lang: ev.nativeLang,
    source: ev.source,
    kind: ev.kind,
    correct: ev.correct ?? null,
    rating: ev.rating ?? null,
    answer: ev.answer != null ? String(ev.answer).slice(0, 500) : null,
    score: ev.score ?? null,
    response_ms: ev.responseMs != null ? Math.round(ev.responseMs) : null,
  };
}

async function flush(opts: { keepalive?: boolean } = {}): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length).map(toRow);
  try {
    if (opts.keepalive) {
      // Путь «вкладка уходит в фон»: обычный fetch с keepalive переживает
      // закрытие страницы и, в отличие от sendBeacon, несёт заголовки.
      const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anon || !cachedToken) return;
      void fetch(`${url}/rest/v1/rpc/log_review_events`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          apikey: anon,
          Authorization: `Bearer ${cachedToken}`,
        },
        body: JSON.stringify({ p_events: batch }),
      }).catch(() => {});
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    cachedToken = token;
    if (!token) return; // гость — телеметрию не пишем
    await supabase.rpc('log_review_events', { p_events: batch });
  } catch {
    // глотаем: телеметрия никогда не ломает UX
  }
}

function ensurePump(): void {
  if (!timer) {
    timer = setInterval(() => {
      void flush();
    }, FLUSH_MS);
  }
  if (!listenerInstalled && typeof document !== 'undefined' && document.addEventListener) {
    listenerInstalled = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush({ keepalive: true });
    });
  }
}

/** Записать событие ответа. Безопасно звать откуда угодно; ошибок не бывает. */
export function logReviewEvent(ev: ReviewEventInput): void {
  try {
    if (!isSupabaseConfigured()) return;
    if (!ev.word || !ev.kind) return;
    queue.push(ev);
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    ensurePump();
  } catch {
    // никогда не мешаем UI
  }
}

/** Досрочный сброс очереди (конец сессии повторения). */
export function flushReviewEvents(): void {
  void flush();
}
