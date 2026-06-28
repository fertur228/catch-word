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
// Запрос  (POST JSON): { image: "<base64 jpeg>", learningLang: "en-US", nativeLang: "ru-RU" }
// Ответ           : { objects: [ { word, translation, ipa, category, emoji, bbox, confidence } ] }
// ─────────────────────────────────────────────────────────────────────────

// Провайдеро-нейтрально (OpenAI-совместимо). По умолчанию — OpenRouter: работает
// из Казахстана и сам ходит к Google; модель Gemini Flash-Lite доступна там как
// google/gemini-2.5-flash-lite. Можно навести на OpenAI (api.openai.com/v1) и т.п.
const BASE_URL = Deno.env.get('RECOGNIZE_BASE_URL') ?? 'https://openrouter.ai/api/v1';
const MODEL = Deno.env.get('RECOGNIZE_MODEL') ?? 'google/gemini-2.5-flash-lite';

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
        required: ['word', 'translation', 'ipa', 'category', 'emoji', 'bbox', 'confidence'],
        properties: {
          word: { type: 'string' },
          translation: { type: 'string' },
          ipa: { type: 'string' },
          category: { type: 'string' },
          emoji: { type: 'string' },
          bbox: { type: 'array', items: { type: 'number' } },
          confidence: { type: 'number' },
        },
      },
    },
  },
};

function buildPrompt(learningLang: string, nativeLang: string): string {
  return [
    'You identify physical objects in a photo to help someone learn a language.',
    'Identify the MOST PROMINENT foreground object, then up to 2 more notable objects.',
    'For each object return:',
    `- word: the object's common name in ${learningLang} (a single, lowercase noun).`,
    `- translation: that word translated into ${nativeLang}.`,
    `- ipa: IPA transcription of the ${learningLang} word (symbols only, no slashes).`,
    `- category: a one-word category in ${nativeLang}.`,
    '- emoji: one emoji that best represents the object.',
    '- bbox: bounding box as [x, y, width, height], each 0..1 relative to image size.',
    '- confidence: 0..1.',
    'Order objects by prominence (main subject first). If nothing recognizable, return an empty list.',
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

  let body: { image?: string; learningLang?: string; nativeLang?: string };
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
  const dataUrl = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;

  let resp: Response;
  try {
    resp = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Для OpenRouter (необязательно; другими провайдерами игнорируется).
        'HTTP-Referer': 'https://catchword.app',
        'X-Title': 'CatchWord',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildPrompt(learningLang, nativeLang) },
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
    return json({ error: 'upstream_unreachable', message: String(e) }, 502);
  }

  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 600);
    return json({ error: 'upstream_error', status: resp.status, detail }, 502);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return json({ error: 'empty_response' }, 502);

  let parsed: { objects?: unknown };
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : content;
  } catch {
    return json({ error: 'parse_failed', detail: String(content).slice(0, 400) }, 502);
  }

  // Валидация/нормализация в коде (json-schema не покрывает длину bbox и диапазоны).
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
    }))
    .filter((o: { word: string }) => o.word.length > 0);

  return json({ objects, model: MODEL });
});
