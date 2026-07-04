// Supabase Edge Function: /recognize
// ─────────────────────────────────────────────────────────────────────────
// Распознаёт предмет(ы) на фото через мультимодальную модель Gemini, вызывая
// её по OpenAI-СОВМЕСТИМОМУ эндпоинту. Ключ Gemini лежит в секрете функции
// (GEMINI_API_KEY) и НИКОГДА не попадает в приложение (спека §11, слой 3).
//
// Смена провайдера/модели = смена env (одна-две строки), без релиза приложения:
//   RECOGNIZE_BASE_URL — base URL OpenAI-совместимого эндпоинта (дефолт — OpenRouter)
//   RECOGNIZE_MODEL    — модель (дефолт google/gemini-2.5-flash-lite)
//   RECOGNIZE_API_KEY  — ключ провайдера (секрет функции)
//
// Запрос  (POST JSON): { image, learningLang, nativeLang, maxObjects? }
// Ответ           : { objects: [ { word, translation, ipa, category, emoji, bbox,
//                     confidence, examples[], note, distractors[] } ] }
//
// examples/note/distractors — «живой» учебный контент в том же вызове (почти
// бесплатно): 2 примера с этим словом, короткая заметка-мнемоника и правдоподобные
// неправильные варианты перевода (для умного теста). maxObjects управляет режимом
// «поймай всю сцену» (до 8 предметов вместо 3).
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Провайдеро-нейтрально (OpenAI-совместимо). По умолчанию — OpenRouter: работает
// из Казахстана и сам ходит к Google; модель Gemini Flash-Lite доступна там как
// google/gemini-2.5-flash-lite. Можно навести на OpenAI (api.openai.com/v1) и т.п.
const BASE_URL = Deno.env.get('RECOGNIZE_BASE_URL') ?? 'https://openrouter.ai/api/v1';
const MODEL = Deno.env.get('RECOGNIZE_MODEL') ?? 'google/gemini-2.5-flash-lite';

// Для серверного лимита бесплатных сканов (см. миграцию scan_usage + RPC).
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/**
 * ID вошедшего пользователя из JWT. Функция задеплоена с verify_jwt=true, поэтому
 * подпись токена уже проверена шлюзом — здесь достаточно декодировать payload.
 * Гость шлёт anon-ключ (role !== 'authenticated') → null (серверный лимит не про
 * него, ему остаётся клиентский). Реальный пользователь → его UUID (role/sub).
 */
function userIdFromJwt(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(b64));
    if (payload.role !== 'authenticated') return null;
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

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

// JSON-схема ответа модели: до 3 предметов, главный — первым.
// (длину bbox и диапазоны json-schema не выражает — добиваем валидацией в коде ниже)
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['objects'],
  properties: {
    objects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'word', 'translation', 'ipa', 'category', 'emoji', 'bbox', 'confidence',
          'examples', 'note', 'distractors', 'synonyms',
        ],
        properties: {
          word: { type: 'string' },
          translation: { type: 'string' },
          ipa: { type: 'string' },
          category: { type: 'string' },
          emoji: { type: 'string' },
          bbox: { type: 'array', items: { type: 'number' } },
          confidence: { type: 'number' },
          examples: { type: 'array', items: { type: 'string' } },
          note: { type: 'string' },
          distractors: { type: 'array', items: { type: 'string' } },
          synonyms: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

function buildPrompt(learningLang: string, nativeLang: string, maxObjects: number): string {
  const more = Math.max(0, maxObjects - 1);
  return [
    'You identify physical objects in a photo to help someone learn a language.',
    `Identify the MOST PROMINENT foreground object, then up to ${more} more notable objects.`,
    'For each object return:',
    `- word: the object's common name in ${learningLang} (a single, lowercase noun).`,
    `- translation: that word translated into ${nativeLang}.`,
    `- ipa: IPA transcription of the ${learningLang} word (symbols only, no slashes).`,
    `- category: a one-word category in ${nativeLang}.`,
    '- emoji: one emoji that best represents the object.',
    '- bbox: bounding box as [x, y, width, height], each 0..1 relative to image size.',
    '- confidence: 0..1.',
    `- examples: array of 2 SHORT, natural example sentences in ${learningLang} that use the word, at a beginner (A1-A2) level.`,
    `- note: a SHORT memory hint in ${nativeLang} (a mnemonic, a false-friend warning, or a usage tip), at most ~12 words. Empty string "" if there is nothing useful.`,
    `- distractors: array of 3 plausible but INCORRECT ${nativeLang} translations — single words a learner might confuse with the correct translation (never equal to the correct translation).`,
    `- synonyms: array of up to 3 common ${learningLang} synonyms or near-synonyms of the word (single words, never equal to the word itself). Empty array [] if there are none.`,
    `Order objects by prominence (main subject first). Return at most ${maxObjects} objects. If nothing recognizable, return an empty list.`,
    'Respond with ONLY a JSON object matching the schema — no prose, no markdown.',
  ].join('\n');
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = Deno.env.get('RECOGNIZE_API_KEY');
  if (!apiKey) {
    return json({ error: 'server_misconfigured', message: 'RECOGNIZE_API_KEY is not set' }, 500);
  }

  let body: { image?: string; learningLang?: string; nativeLang?: string; maxObjects?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request', message: 'invalid JSON body' }, 400);
  }

  const image = body.image;
  if (!image || typeof image !== 'string') {
    return json({ error: 'bad_request', message: 'missing "image" (base64 jpeg)' }, 400);
  }
  const learningLang = body.learningLang ?? 'en-US';
  const nativeLang = body.nativeLang ?? 'ru-RU';
  // Сколько предметов максимум: 1 предмет (single) … до 8 («поймай всю сцену»).
  const maxObjects = Math.max(1, Math.min(8, Math.round(Number(body.maxObjects) || 3)));
  const dataUrl = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;

  // --- Серверный лимит бесплатных сканов (антифрод) ---
  // Списываем скан ЗАРАНЕЕ (до дорогого вызова модели): превышение → 402 без
  // обращения к провайдеру. Если модель потом упадёт — возвращаем скан (refund).
  // Гость (anon-токен) → userId=null → серверный лимит не применяется (клиентский).
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const userId = token ? userIdFromJwt(token) : null;
  const admin = userId && SUPABASE_URL && SERVICE_ROLE
    ? createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
    : null;

  let scanInfo: { used: number; limit: number; unlimited: boolean } | null = null;
  let consumed = false;
  if (admin && userId) {
    const { data: gate, error } = await admin.rpc('consume_scan', { p_user: userId });
    if (error) {
      // Не блокируем распознавание из-за сбоя учёта (fail-open) — только логируем.
      console.error('[recognize] consume_scan error:', error.message);
    } else if (gate) {
      scanInfo = { used: gate.used, limit: gate.limit, unlimited: gate.unlimited };
      if (gate.allowed === false) {
        return json({ error: 'scan_limit_reached', used: gate.used, limit: gate.limit }, 402);
      }
      consumed = gate.unlimited === false; // счётчик увеличен только для free-пользователя
    }
  }

  // Вернуть скан, если распознавание не удалось (не «сжигаем» на ошибке).
  const refund = async () => {
    if (consumed && admin && userId) {
      try { await admin.rpc('refund_scan', { p_user: userId }); } catch { /* best-effort */ }
    }
  };

  let resp: Response;
  try {
    resp = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Для OpenRouter (необязательно; другими провайдерами игнорируется).
        'HTTP-Referer': 'https://catch-words.com',
        'X-Title': 'TakeWord',
      },
      body: JSON.stringify({
        model: MODEL,
        // Больше предметов и учебного контента → больше места под ответ.
        max_tokens: Math.min(2400, 500 + maxObjects * 240),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildPrompt(learningLang, nativeLang, maxObjects) },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'recognition', schema: SCHEMA },
        },
      }),
    });
  } catch (e) {
    await refund();
    return json({ error: 'upstream_unreachable', message: String(e) }, 502);
  }

  if (!resp.ok) {
    await refund();
    const detail = (await resp.text()).slice(0, 600);
    return json({ error: 'upstream_error', status: resp.status, detail }, 502);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    await refund();
    return json({ error: 'empty_response' }, 502);
  }

  let parsed: { objects?: unknown };
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : content;
  } catch {
    await refund();
    return json({ error: 'parse_failed', detail: String(content).slice(0, 400) }, 502);
  }

  // Валидация/нормализация в коде (json-schema не покрывает длину bbox и диапазоны).
  // Привести значение к массиву коротких непустых строк (examples/distractors).
  const strList = (v: unknown, cap: number): string[] =>
    Array.isArray(v)
      ? v.map((s) => String(s ?? '').trim()).filter((s) => s.length > 0).slice(0, cap)
      : [];

  const rawObjects = Array.isArray(parsed.objects) ? parsed.objects : [];
  const objects = rawObjects
    // deno-lint-ignore no-explicit-any
    .map((o: any) => ({
      word: String(o?.word ?? '').trim(),
      translation: String(o?.translation ?? '').trim(),
      ipa: String(o?.ipa ?? '').trim().replace(/^\/+|\/+$/g, ''),
      category: String(o?.category ?? '').trim() || null,
      emoji: typeof o?.emoji === 'string' && o.emoji.length > 0 ? o.emoji : '🔤',
      bbox:
        Array.isArray(o?.bbox) && o.bbox.length === 4
          ? o.bbox.map((n: unknown) => Math.max(0, Math.min(1, Number(n) || 0)))
          : null,
      confidence:
        typeof o?.confidence === 'number' ? Math.max(0, Math.min(1, o.confidence)) : null,
      examples: strList(o?.examples, 3),
      note: String(o?.note ?? '').trim(),
      distractors: strList(o?.distractors, 3),
      synonyms: strList(o?.synonyms, 3),
    }))
    .filter((o: { word: string }) => o.word.length > 0)
    .slice(0, maxObjects);

  return json({ objects, model: MODEL, scan: scanInfo });
});
