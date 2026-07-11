// Эмбеддинги карточек (движок v2, Э5) — постоянный фоновой джоб.
//
//   pg_cron (*/10 мин) ──секрет──► embed-cards ──► pending_embeddings (RPC)
//                                        │ gte-small (встроен в Edge Runtime)
//                                        └──► upsert card_embeddings
//
// Почему так (см. план, Э5): recognize карточек НЕ создаёт (их создаёт клиент
// позже через pushCard), поэтому единственная честная точка — добирать строки
// без эмбеддинга. Джоб идемпотентен и служит и бэкфиллом, и потоком.
//
// Провайдер v1 — gte-small (384, без внешних ключей; для de/es/zh слабее).
// Появится GOOGLE_API_KEY → провайдер меняется здесь, таблица пересчитывается
// этим же джобом после truncate.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AGENT_SECRET = Deno.env.get('QUEST_AGENT_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// deno-lint-ignore no-explicit-any
const ai = (globalThis as any).Supabase?.ai;
const session = ai ? new ai.Session('gte-small') : null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!AGENT_SECRET || !SUPABASE_URL || !SERVICE_ROLE) return json({ error: 'server_misconfigured' }, 500);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (token !== AGENT_SECRET) return json({ error: 'unauthorized' }, 401);
  if (!session) return json({ error: 'ai_session_unavailable' }, 500);

  let body: { batch?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  // Потолок 16: воркер тянет ~20 gte-small-прогонов за вызов, дальше
  // WORKER_RESOURCE_LIMIT (замерено 11.07: и 200, и 32 умирали на ~21-м).
  const batch = Math.max(1, Math.min(16, Math.round(Number(body.batch) || 16)));

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: pending, error } = await admin.rpc('pending_embeddings', { p_limit: batch });
  if (error) return json({ error: error.message }, 500);
  const rows = (pending ?? []) as Array<{ user_id: string; card_id: string; word: string }>;
  if (rows.length === 0) return json({ embedded: 0, note: 'всё уже посчитано' });

  let embedded = 0;
  const failures: string[] = [];
  for (const r of rows) {
    try {
      const vec = (await session.run(r.word, { mean_pool: true, normalize: true })) as number[];
      const { error: upErr } = await admin.from('card_embeddings').upsert({
        user_id: r.user_id,
        card_id: r.card_id,
        word: r.word,
        provider: 'gte-small',
        embedding: JSON.stringify(vec),
      });
      if (upErr) failures.push(`${r.card_id}: ${upErr.message}`);
      else embedded += 1;
    } catch (e) {
      failures.push(`${r.card_id}: ${String(e)}`);
    }
  }
  if (failures.length) console.error('[embed-cards] failures:', failures.slice(0, 5));
  return json({ embedded, failed: failures.length, remaining_hint: rows.length === batch });
});
