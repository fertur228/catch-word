// Supabase Edge Function: /delete-account
// ─────────────────────────────────────────────────────────────────────────
// Полное удаление аккаунта пользователя (Apple Guideline 5.1.1(v): если есть
// регистрация — должно быть и удаление прямо в приложении).
//
// Из клиента напрямую удалить auth-пользователя НЕЛЬЗЯ (нужен service_role),
// поэтому удаление идёт здесь. Что удаляем:
//   1. Файлы стикеров в Storage-бакете `stickers/{userId}/…` (каскада для
//      Storage нет — чистим явно).
//   2. Карточки в public.word_cards (на случай, если у таблицы нет каскада).
//   3. Самого пользователя в auth.users → это КАСКАДОМ (ON DELETE CASCADE)
//      удаляет public.subscriptions и public.scan_usage.
//
// Деплой: `supabase functions deploy delete-account` (verify_jwt=true по
// умолчанию — шлюз проверяет подпись токена; ниже дополнительно валидируем
// пользователя через admin.auth.getUser, чтобы удаление было авторитетным).
//
// Запрос : POST (без тела), Authorization: Bearer <access_token пользователя>.
// Ответ  : { ok: true } | { error }.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const STICKER_BUCKET = 'stickers';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** Удалить все объекты пользователя в бакете `stickers` (путь `{userId}/…`). */
async function deleteStickerFiles(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  const { data, error } = await admin.storage.from(STICKER_BUCKET).list(userId, { limit: 1000 });
  if (error) {
    console.warn('[delete-account] list stickers:', error.message);
    return;
  }
  if (!data || data.length === 0) return;
  const paths = data.map((f) => `${userId}/${f.name}`);
  const { error: rmError } = await admin.storage.from(STICKER_BUCKET).remove(paths);
  if (rmError) console.warn('[delete-account] remove stickers:', rmError.message);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: 'server_misconfigured', message: 'service role is not set' }, 500);
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'unauthorized', message: 'missing bearer token' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Авторитетно: кто вызвал. getUser проверяет токен на auth-сервере (не просто
  // декодирует) — на удаление это важнее, чем на распознавании.
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userErr || !userId) {
    return json({ error: 'unauthorized', message: 'invalid session' }, 401);
  }

  // 1) Файлы стикеров (Storage не каскадит) — best-effort.
  await deleteStickerFiles(admin, userId);

  // 2) Карточки пользователя (на случай отсутствия каскада у word_cards).
  const { error: cardsErr } = await admin.from('word_cards').delete().eq('user_id', userId);
  if (cardsErr) console.warn('[delete-account] delete word_cards:', cardsErr.message);

  // 3) Сам пользователь → каскадом уходят subscriptions и scan_usage.
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    console.error('[delete-account] deleteUser:', delErr.message);
    return json({ error: 'delete_failed', message: delErr.message }, 500);
  }

  return json({ ok: true });
});
