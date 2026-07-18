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
// Запрос — два формата тела (оба поддержаны, старые сборки не ломаются):
//   application/octet-stream — СЫРЫЕ байты JPEG, параметры в query (натив):
//     base64 в JSON раздувает тело на треть (253КБ против 189КБ), а мобильный
//     аплинк — самая дорогая часть ожидания пользователя.
//   application/json — { image, learningLang, nativeLang, maxObjects?, wantMasks? } (веб).
// Ответ           : { objects: [ { word, translation, ipa, category, emoji, bbox,
//                     confidence, examples[], note, distractors[], mask?, maskBox? } ] }
//                   + заголовок x-scan-timings (gate/model/total, мс) — дев-диагностика.
//                   ВНИМАНИЕ: значение заголовка обязано быть ASCII (latin-1);
//                   кириллица в нём роняет ВЕСЬ ответ в 500 (наступали).
//
// wantMasks (веб): ПАРАЛЛЕЛЬНЫЙ второй вызов модели за масками сегментации в
// каноническом формате Gemini (box_2d 0..1000 + base64-PNG маска). Отдельный
// вызов, потому что маски — специально обученный формат: под json_schema модель
// «фантазирует» битый base64 (проверено), а без схемы отдаёт валидный PNG.
// Ошибка сегментации не роняет распознавание — объекты придут без mask.
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
  // Тайминги этапов должны быть читаемы браузером (веб-клиент), иначе CORS их скроет.
  'Access-Control-Expose-Headers': 'x-scan-timings',
};

function json(body: unknown, status = 200, timings?: Record<string, number>): Response {
  const headers: Record<string, string> = { ...CORS, 'Content-Type': 'application/json' };
  // Тайминги — диагностика, и она НЕ ИМЕЕТ ПРАВА ронять распознавание: значение
  // заголовка обязано быть латиницей (ByteString), поэтому ключи только ASCII
  // (`gate`/`model`/`total` — человекочитаемые подписи рисует клиент), плюс
  // фильтр и try/catch на случай будущей неаккуратности.
  if (timings) {
    try {
      const v = Object.entries(timings)
        .map(([k, ms]) => `${k.replace(/[^\x20-\x7E]/g, '')}=${Math.round(ms)}`)
        .filter((s) => !s.startsWith('='))
        .join(';');
      if (v) headers['x-scan-timings'] = v;
    } catch {
      // без таймингов, но с результатом
    }
  }
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Сырые байты → base64 (для data-URI провайдеру). Порциями: одним spread'ом
 * на ~200КБ можно словить переполнение стека аргументов.
 */
function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
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
          'examples', 'note', 'distractors', 'synonyms', 'questMatch',
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
          questMatch: { type: 'string' },
        },
      },
    },
  },
};

/**
 * Маски сегментации: канонический промпт Gemini (см. доки Google по segmentation).
 * ВАЖНО: без response_format — структурный вывод ломает обученный формат масок.
 */
function buildSegPrompt(maxObjects: number): string {
  const what =
    maxObjects <= 1
      ? 'the single MOST PROMINENT foreground object'
      : `the prominent foreground objects (at most ${maxObjects})`;
  return (
    `Give the segmentation masks for ${what}. ` +
    'Output a JSON list of segmentation masks where each entry contains the 2D bounding box in the key "box_2d", ' +
    'the segmentation mask in key "mask", and the text label in the key "label". Use descriptive labels.'
  );
}

/** box_2d [ymin,xmin,ymax,xmax] в долях тысячи → наш bbox [x,y,w,h] в долях 1. */
function box2dToBbox(b: unknown): number[] | null {
  if (!Array.isArray(b) || b.length !== 4) return null;
  const [ymin, xmin, ymax, xmax] = b.map((n) => Math.max(0, Math.min(1000, Number(n) || 0)));
  if (xmax <= xmin || ymax <= ymin) return null;
  return [xmin / 1000, ymin / 1000, (xmax - xmin) / 1000, (ymax - ymin) / 1000];
}

/** Пересечение-над-объединением двух bbox [x,y,w,h] — для матчинга масок к объектам. */
function iou(a: number[], b: number[]): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

/** Параллельный вызов за масками. Любая ошибка → [] (маски — best-effort). */
async function fetchSegmentation(
  apiKey: string,
  dataUrl: string,
  maxObjects: number,
  signal?: AbortSignal,
): Promise<{ box: number[]; mask: string }[]> {
  try {
    const resp = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://catch-words.com',
        'X-Title': 'TakeWord',
      },
      body: JSON.stringify({
        model: MODEL,
        // Маска ~1–3КБ base64 на предмет; с запасом на сцену из 8.
        max_tokens: 12000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildSegPrompt(maxObjects) },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    let text = String(data?.choices?.[0]?.message?.content ?? '');
    // JSON приходит в ```json-ограде — срезаем.
    text = text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) return [];
    return arr
      // deno-lint-ignore no-explicit-any
      .map((it: any) => {
        const box = box2dToBbox(it?.box_2d);
        const mask = typeof it?.mask === 'string' ? it.mask.trim() : '';
        // Валидный data-URI PNG разумного размера, иначе выбрасываем.
        const ok = box && mask.startsWith('data:image/png;base64,') && mask.length < 300_000;
        return ok ? { box: box as number[], mask } : null;
      })
      .filter((x): x is { box: number[]; mask: string } => x !== null)
      .slice(0, maxObjects);
  } catch (e) {
    console.error('[recognize] segmentation failed:', String(e).slice(0, 200));
    return [];
  }
}

function buildPrompt(
  learningLang: string,
  nativeLang: string,
  maxObjects: number,
  questWords: string[],
): string {
  const more = Math.max(0, maxObjects - 1);
  const single = maxObjects <= 1;
  const intro = single
    ? 'The photo is tightly framed around ONE object that fills the center — identify THAT object, precisely.'
    : `Identify the MOST PROMINENT foreground object, then up to ${more} more clearly visible objects.`;
  return [
    `You are an expert at naming physical objects to help someone learn ${learningLang}.`,
    intro,
    'Be accurate: give the SPECIFIC everyday noun a native speaker would use, not a vague category (e.g. "mug" not "cup", "sneaker" not "shoe"). Use the generic object name, never a brand.',
    'Look closely before answering: use shape, material, size and surrounding context to tell similar objects apart (e.g. thermos vs bottle, notebook vs book, monitor vs TV).',
    'If the photo is imperfect (blurry, partial, odd angle), still give your single best guess and lower confidence accordingly. Return an empty list ONLY if there is genuinely no discernible object.',
    'For each object return:',
    `- word: the object's common name in ${learningLang} — a single, lowercase, singular noun.`,
    `- translation: that word translated into ${nativeLang}.`,
    `- ipa: IPA transcription of the ${learningLang} word (symbols only, no slashes).`,
    `- category: a one-word category in ${nativeLang}.`,
    '- emoji: one emoji that best represents the object.',
    '- bbox: bounding box as [x, y, width, height], each 0..1 relative to image size.',
    '- confidence: your honest 0..1 certainty.',
    `- examples: array of 2 SHORT, natural example sentences in ${learningLang} that use the word, at a beginner (A1-A2) level.`,
    `- note: a SHORT memory hint in ${nativeLang} (a mnemonic, a false-friend warning, or a usage tip), at most ~12 words. Empty string "" if there is nothing useful.`,
    `- distractors: array of 3 plausible but INCORRECT ${nativeLang} translations — single words a learner might confuse with the correct translation (never equal to the correct translation).`,
    `- synonyms: array of up to 3 common ${learningLang} synonyms or near-synonyms of the word (single words, never equal to the word itself). Empty array [] if there are none.`,
    '- questMatch: the EXACT daily-quest target word this object matches (see targets below), or "" if none.',
    `Order objects by prominence (main subject first). Return at most ${maxObjects} objects.`,
    questWords.length
      ? `Daily-quest targets: ${questWords.join(', ')}. Match GENEROUSLY: if the main object is essentially one of these (e.g. a thermos or flask counts as "bottle", a power bank as "battery"), set its questMatch to that EXACT target word (verbatim from the list). Otherwise "".`
      : 'No quest targets provided → questMatch must be "".',
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

  // --- Разбор запроса: два формата тела ---
  // application/octet-stream — СЫРЫЕ байты JPEG, параметры в query (натив):
  //   base64 в JSON раздувает тело на треть, а мобильный аплинк — самая дорогая
  //   часть ожидания пользователя (см. src/lib/recognize.ts).
  // application/json — прежний формат {image: dataURL|base64, ...} (веб).
  let image: string | undefined;
  let learningLang: string;
  let nativeLang: string;
  let rawMaxObjects: unknown;
  let rawQuestWords: unknown;
  let wantMasks = false;

  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/octet-stream')) {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await req.arrayBuffer());
    } catch {
      return json({ error: 'bad_request', message: 'cannot read binary body' }, 400);
    }
    if (bytes.byteLength === 0) {
      return json({ error: 'bad_request', message: 'empty image body' }, 400);
    }
    image = toBase64(bytes);
    const q = new URL(req.url).searchParams;
    learningLang = q.get('learningLang') ?? 'en-US';
    nativeLang = q.get('nativeLang') ?? 'ru-RU';
    rawMaxObjects = q.get('maxObjects');
    rawQuestWords = (q.get('questWords') ?? '').split(',');
    wantMasks = q.get('wantMasks') === 'true';
  } else {
    let body: {
      image?: string; learningLang?: string; nativeLang?: string; maxObjects?: number;
      questWords?: unknown; wantMasks?: boolean;
    };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'bad_request', message: 'invalid JSON body' }, 400);
    }
    image = body.image;
    if (!image || typeof image !== 'string') {
      return json({ error: 'bad_request', message: 'missing "image" (base64 jpeg)' }, 400);
    }
    learningLang = body.learningLang ?? 'en-US';
    nativeLang = body.nativeLang ?? 'ru-RU';
    rawMaxObjects = body.maxObjects;
    rawQuestWords = body.questWords;
    wantMasks = body.wantMasks === true;
  }

  // Сколько предметов максимум: 1 предмет (single) … до 8 («поймай всю сцену»).
  const maxObjects = Math.max(1, Math.min(8, Math.round(Number(rawMaxObjects) || 3)));
  // Цели дневного квеста (англ. слова) — модель проверит семантическое совпадение.
  const questWords: string[] = Array.isArray(rawQuestWords)
    ? (rawQuestWords as unknown[]).map((s) => String(s ?? '').trim()).filter(Boolean).slice(0, 12)
    : [];
  const qwLower = questWords.map((w) => w.toLowerCase());
  const dataUrl = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;

  // --- Серверный лимит бесплатных сканов (антифрод) ---
  // Гость (anon-токен) → userId=null → серверный лимит не применяется (клиентский).
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const userId = token ? userIdFromJwt(token) : null;
  const admin = userId && SUPABASE_URL && SERVICE_ROLE
    ? createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
    : null;

  // Маски (веб): стартуем ПАРАЛЛЕЛЬНО с распознаванием — стена времени не растёт.
  const segAc = new AbortController();
  const segP = wantMasks
    ? fetchSegmentation(apiKey, dataUrl, maxObjects, segAc.signal)
    : Promise.resolve([] as { box: number[]; mask: string }[]);

  // Гейт лимита и вызов модели стартуют ПАРАЛЛЕЛЬНО. Раньше скан ждал round-trip
  // в базу, прежде чем модель вообще увидит фото, — а это ожидание пользователя.
  // Скан по-прежнему списывается ДО выдачи результата, порядок проверки не изменён:
  // отказ гейта → обрываем вызов модели (abort) и возвращаем 402, как и раньше.
  const tStart = Date.now();
  const modelAc = new AbortController();
  const modelP = fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    signal: modelAc.signal,
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
            { type: 'text', text: buildPrompt(learningLang, nativeLang, maxObjects, questWords) },
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
  // Отказ гейта обрывает вызов ниже — гасим отказ промиса, чтобы он не всплыл
  // необработанным и не уронил инстанс функции.
  modelP.catch(() => {});

  const timings: Record<string, number> = {};
  let scanInfo: { used: number; limit: number; unlimited: boolean } | null = null;
  let consumed = false;
  if (admin && userId) {
    const tGate = Date.now();
    const { data: gate, error } = await admin.rpc('consume_scan', { p_user: userId });
    timings['gate'] = Date.now() - tGate;
    if (error) {
      // Не блокируем распознавание из-за сбоя учёта (fail-open) — только логируем.
      console.error('[recognize] consume_scan error:', error.message);
    } else if (gate) {
      scanInfo = { used: gate.used, limit: gate.limit, unlimited: gate.unlimited };
      if (gate.allowed === false) {
        // Лимит исчерпан: обрываем уже начатые вызовы, чтобы не платить за них.
        modelAc.abort();
        segAc.abort();
        // premium=true → это fair-use кап (100/день), а не free-лимит: клиент НЕ
        // показывает пейволл, а сообщает «дневной лимит, вернись завтра».
        return json({ error: 'scan_limit_reached', used: gate.used, limit: gate.limit,
                      premium: gate.premium === true }, 402);
      }
      // Скан засчитан для ОБОИХ тарифов (premium теперь тоже под капом) → при ошибке
      // модели возвращаем его через refund_scan.
      consumed = gate.allowed === true;
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
    resp = await modelP;
  } catch (e) {
    await refund();
    return json({ error: 'upstream_unreachable', message: String(e) }, 502);
  }
  timings['model'] = Date.now() - tStart;

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
      // Только слово ИЗ переданных целей квеста (иначе "" — защита от галлюцинаций).
      questMatch: ((): string => {
        const qm = String(o?.questMatch ?? '').trim().toLowerCase();
        const i = qm ? qwLower.indexOf(qm) : -1;
        return i >= 0 ? questWords[i] : '';
      })(),
    }))
    .filter((o: { word: string }) => o.word.length > 0)
    .slice(0, maxObjects);

  // Прикрепляем маски: каждому объекту — сегмент с максимальным IoU его bbox
  // (жадно, сегмент используется один раз). maskBox — регион САМОЙ маски
  // (маска обучена под свой box_2d, он может чуть отличаться от нашего bbox).
  const segs = await segP;
  timings['total'] = Date.now() - tStart;
  if (segs.length > 0) {
    const used = new Set<number>();
    for (const o of objects as ({ bbox: number[] | null } & Record<string, unknown>)[]) {
      let best = -1;
      let bestIou = 0;
      for (let i = 0; i < segs.length; i++) {
        if (used.has(i)) continue;
        // Один предмет без bbox + единственный сегмент — очевидный матч.
        const score = o.bbox ? iou(o.bbox, segs[i].box) : objects.length === 1 && segs.length === 1 ? 1 : 0;
        if (score > bestIou) {
          bestIou = score;
          best = i;
        }
      }
      if (best >= 0 && bestIou >= 0.1) {
        used.add(best);
        o.mask = segs[best].mask;
        o.maskBox = segs[best].box;
      }
    }
  }

  return json({ objects, model: MODEL, scan: scanInfo }, 200, timings);
});
