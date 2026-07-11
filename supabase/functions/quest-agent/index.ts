// Автономный агент-тренер: ночью решает, что человеку учить сегодня.
//
// Это НЕ фиксированный пайплайн (workflow), а агентный цикл (ReAct):
// модель получает цель и ИНСТРУМЕНТЫ, сама решает, какие вызывать и в каком
// порядке, наблюдает результаты и завершает терминальным действием finish().
//
// Инструменты:
//   get_collection_stats  — обзор коллекции (сколько, слабые, просроченные, категории)
//   get_cards             — сами карточки по фильтру (weak / overdue / recent / mastered)
//   get_quest_history     — что агент назначал раньше (не повторяться)
//   reschedule_cards      — сдвинуть повторение карточек (guardrails + аудит old/new)
//   finish                — терминальное: квест из 3 целей + сообщение тренера
//
// Guardrails (в коде, не в промпте):
//   максимум 8 шагов цикла; finish отклоняется, пока агент не посмотрел карточки;
//   reschedule ≤10 карточек, due_at только в [сегодня, +30 дней], только свои;
//   каждая мутация — в agent_actions с old/new (полный откат одним UPDATE).
//
// Observability: полный след рассуждений каждого прогона — в agent_runs.steps.
//
// Режимы (Authorization: Bearer <QUEST_AGENT_SECRET>, verify_jwt = false):
//   {mode:'cron'}                     — все активные юзеры, квест на СЛЕДУЮЩИЙ UTC-день
//                                       (крон бежит в 22:00 UTC = 03:00 Алматы)
//   {mode:'debug', user_id, day_index?} — один юзер, по умолчанию текущий день
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BASE_URL = Deno.env.get('RECOGNIZE_BASE_URL') ?? 'https://openrouter.ai/api/v1';
const MODEL = Deno.env.get('RECOGNIZE_MODEL') ?? 'google/gemini-2.5-flash';
const API_KEY = Deno.env.get('RECOGNIZE_API_KEY') ?? '';
const AGENT_SECRET = Deno.env.get('QUEST_AGENT_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const DAY_MS = 86_400_000;
const MAX_STEPS = 8;                    // потолок цикла — защита от зацикливания
const MAX_RESCHEDULE = 10;              // максимум карточек за одну ночь
const MAX_RESCHEDULE_DAYS = 30;         // due_at не дальше чем на месяц
const RUN_DEADLINE_MS = 330_000;        // общий дедлайн cron-прогона (лимит edge ~400s)
// Цены google/gemini-2.5-flash на OpenRouter (для cost_usd в трейсе).
const PRICE_IN = 0.30 / 1e6;
const PRICE_OUT = 2.50 / 1e6;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Контракт DailyQuest — тот же, что src/lib/daily-quest.ts ────────────
interface QuestTarget {
  word: string;
  emoji: string;
  translation: string;
  category: string | null;
  ipa: string;
  dayIndex: number;
}

// ── Описания инструментов для модели (OpenAI-совместимый tools формат) ──
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_collection_stats',
      description:
        'Обзор коллекции ученика: сколько карточек всего, сколько слабых (ease<2.0), сколько просроченных (due_at в прошлом), какие категории. Начни с этого.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cards',
      description: 'Карточки ученика по фильтру. weak — плохо запоминаются; overdue — пора повторить; recent — недавно пойманы; mastered — выучены твёрдо.',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', enum: ['weak', 'overdue', 'recent', 'mastered'] },
          limit: { type: 'integer', minimum: 1, maximum: 40 },
        },
        required: ['filter'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_quest_history',
      description: 'Квесты, которые ты назначал этому ученику в прошлые дни. Используй, чтобы не повторять вчерашние цели и понимать динамику сложности.',
      parameters: {
        type: 'object',
        properties: { days: { type: 'integer', minimum: 1, maximum: 14 } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_vocab_map',
      description:
        'Карта словаря ученика: какие бытовые темы покрыты, а где дыры (тем нет или 1 слово). Используй, чтобы предлагать НОВЫЕ цели из непокрытых тем, а не по кругу из одной.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_review_stats',
      description:
        'Как ученик РЕАЛЬНО отвечал в последние дни (телеметрия): по словам — попытки/ошибки, по форматам заданий — где сыпется (на слух, письмо и т.п.). Слова с реальными ошибками важнее просто просроченных.',
      parameters: {
        type: 'object',
        properties: { days: { type: 'integer', minimum: 1, maximum: 14 } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reschedule_cards',
      description:
        'Сдвинуть дату повторения карточек (интервальное повторение). Используй ОСТОРОЖНО и только когда это явно полезно: например, подтянуть на сегодня слово, которое войдёт в квест, или отложить то, что ученик явно знает. Максимум 10 карточек, не дальше чем на 30 дней.',
      parameters: {
        type: 'object',
        properties: {
          card_ids: { type: 'array', items: { type: 'string' }, maxItems: 10 },
          days_from_now: { type: 'integer', minimum: 0, maximum: 30 },
          reason: { type: 'string', description: 'Одно предложение: зачем.' },
        },
        required: ['card_ids', 'days_from_now', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: 'Терминальное действие: выдай план дня. Ровно 3 цели-предмета, которые ученик сфотографирует камерой в быту.',
      parameters: {
        type: 'object',
        properties: {
          quests: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: {
              type: 'object',
              properties: {
                word: { type: 'string', description: 'Слово на изучаемом языке, единственное число, без артикля.' },
                emoji: { type: 'string' },
                translation: { type: 'string', description: 'Перевод на родной язык ученика.' },
                category: { type: 'string' },
                ipa: { type: 'string' },
              },
              required: ['word', 'emoji', 'translation'],
            },
          },
          coach_message: {
            type: 'string',
            description: 'Короткое (1-2 предложения) сообщение тренера на РОДНОМ языке ученика: почему сегодня именно эти цели. Конкретно, по-дружески, без воды.',
          },
          exercises: {
            type: 'array',
            maxItems: 8,
            description:
              'Тренировка дня: 3–6 упражнений под слабые места из телеметрии. Форматы: dictation — предложение с целевым словом (продиктуем ученику); cloze — предложение с пропуском ____ вместо слова + 3 НЕВЕРНЫХ варианта в distractors; writeSentence — короткое задание «составь предложение…» в prompt. Слова — ТОЛЬКО из коллекции или целей квеста.',
            items: {
              type: 'object',
              properties: {
                word: { type: 'string', description: 'Целевое слово на изучаемом языке.' },
                kind: { type: 'string', enum: ['dictation', 'cloze', 'writeSentence'] },
                sentence: { type: 'string', description: 'Для dictation/cloze: предложение ≤120 символов; в cloze вместо слова — ____.' },
                distractors: { type: 'array', items: { type: 'string' }, maxItems: 3, description: 'Только для cloze: 3 неверных варианта.' },
                prompt: { type: 'string', description: 'Для writeSentence: короткое задание на родном языке ученика.' },
                why: { type: 'string', description: 'Одна короткая причина: почему это упражнение (для трейса/баннера).' },
              },
              required: ['word', 'kind'],
            },
          },
          difficulty: { type: 'string', enum: ['easy', 'normal', 'hard'] },
          reasoning: { type: 'string', description: 'Твоя логика выбора, 2-3 предложения (для трейса, ученик не видит).' },
        },
        required: ['quests', 'coach_message', 'difficulty', 'reasoning'],
      },
    },
  },
];

function systemPrompt(learningLang: string, nativeLang: string, dayIndex: number): string {
  return [
    'Ты — автономный тренер в приложении TakeWord: ученик учит язык, фотографируя предметы вокруг себя камерой.',
    `Ученик учит ${learningLang}, родной язык ${nativeLang}. Сегодняшний dayIndex: ${dayIndex}.`,
    '',
    'ЦЕЛЬ: составь план дня, который максимально продвинет словарный запас ИМЕННО ЭТОГО ученика.',
    '',
    'Как работать:',
    '1. Сначала ОБЯЗАТЕЛЬНО вызови get_collection_stats, get_review_stats (реальные ответы ученика) и get_cards; get_quest_history — по необходимости.',
    '2. Реши стратегию: закреплять забываемое (слабые/просроченные) или давать новое. Приоритет: слова с РЕАЛЬНЫМИ ошибками из телеметрии > просроченные > новые. Если ученик сыпется в конкретном формате (например, на слух) — учти это в сложности.',
    '3. Цели квеста — КОНКРЕТНЫЕ ФИЗИЧЕСКИЕ ПРЕДМЕТЫ, которые реально найти дома/в офисе/на улице за минуту (кружка — да, «свобода» — нет).',
    '4. Если слабое слово — предмет, включи его в квест: ученик повторит его вживую. Если включаешь слабые слова в квест, подтяни их повторение на сегодня через reschedule_cards.',
    '5. Не повторяй цели из вчерашних квестов, если ученик их уже ловил (см. историю).',
    '6. Если коллекция пуста — дай 3 простых базовых предмета для новичка.',
    '7. Вместе с finish передай exercises (3–6 упражнений). Формат КАЖДОГО выбирай по ошибкам форматов из get_review_stats, это главный сигнал: ошибки в audio-форматах → БОЛЬШИНСТВО упражнений dictation; ошибки в переводе/выборе → cloze; ошибок нет или серия успехов → продукция (writeSentence). Провалы вчера → difficulty easy; серия успехов → normal/hard.',
    '8. Закончи вызовом finish. Не пиши текст вне инструментов.',
  ].join('\n');
}

// ── Валидация упражнений тренировки (guardrails Э3 — кодом, не промптом) ──
interface Exercise {
  v: 1;
  word: string;
  kind: 'dictation' | 'cloze' | 'writeSentence';
  sentence?: string;
  distractors?: string[];
  prompt?: string;
  why?: string;
}

/**
 * Невалидное упражнение отбрасывается МОЛЧА (квест важнее тренировки):
 * ≤8 штук, kind из белого списка, слово — только из allowedWords (коллекция +
 * цели квеста), предложения ≤120 символов, cloze обязан содержать пропуск
 * «____» и ≥2 дистракторов, dictation — предложение с целевым словом.
 */
function validateExercises(raw: unknown, allowedWords: Set<string>): Exercise[] {
  if (!Array.isArray(raw)) return [];
  const out: Exercise[] = [];
  for (const item of raw.slice(0, 10)) {
    if (out.length >= 8) break;
    const it = (item ?? {}) as Record<string, unknown>;
    const word = String(it.word ?? '').trim();
    const kind = String(it.kind ?? '') as Exercise['kind'];
    if (!word || !['dictation', 'cloze', 'writeSentence'].includes(kind)) continue;
    if (!allowedWords.has(word.toLowerCase())) continue;
    const sentence = it.sentence != null ? String(it.sentence).trim().slice(0, 120) : '';
    const distractors = Array.isArray(it.distractors)
      ? it.distractors.map((d) => String(d ?? '').trim()).filter(Boolean).slice(0, 3)
      : [];
    const prompt = it.prompt != null ? String(it.prompt).trim().slice(0, 120) : '';
    if (kind === 'dictation' && (!sentence || !sentence.toLowerCase().includes(word.toLowerCase()))) continue;
    if (kind === 'cloze' && (!sentence || !sentence.includes('____') || distractors.length < 2)) continue;
    const ex: Exercise = { v: 1, word, kind };
    if (sentence) ex.sentence = sentence;
    if (distractors.length) ex.distractors = distractors;
    if (prompt) ex.prompt = prompt;
    const why = it.why != null ? String(it.why).trim().slice(0, 80) : '';
    if (why) ex.why = why;
    out.push(ex);
  }
  return out;
}

// ── Реализация инструментов ─────────────────────────────────────────────
interface Ctx {
  admin: SupabaseClient;
  userId: string;
  runId: number;
  dayIndex: number;
  learningLang: string;
  nativeLang: string;
  readCalled: boolean; // guardrail: finish только после чтения карточек
  reviewStatsCalled: boolean; // guardrail: finish только после чтения телеметрии
  dryRun: boolean;     // debug: инструменты записи отвечают «понарошку» (проверка детерминированности)
}

async function toolGetStats(ctx: Ctx): Promise<unknown> {
  const now = Date.now();
  const { data, error } = await ctx.admin
    .from('word_cards')
    .select('ease, reps, due_at, category, mastery')
    .eq('user_id', ctx.userId)
    .eq('learning_lang', ctx.learningLang)
    .eq('native_lang', ctx.nativeLang);
  if (error) return { error: error.message };
  const cards = data ?? [];
  const byCat = new Map<string, number>();
  for (const c of cards) {
    const k = (c.category ?? 'без категории').toLowerCase();
    byCat.set(k, (byCat.get(k) ?? 0) + 1);
  }
  return {
    total: cards.length,
    weak: cards.filter((c) => (c.ease ?? 2.5) < 2.0).length,
    overdue: cards.filter((c) => c.due_at != null && Number(c.due_at) < now).length,
    mastered: cards.filter((c) => (c.mastery ?? 0) >= 4).length,
    categories: Object.fromEntries([...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)),
  };
}

async function toolGetCards(ctx: Ctx, args: { filter?: string; limit?: number }): Promise<unknown> {
  const limit = Math.max(1, Math.min(40, Math.round(Number(args.limit) || 20)));
  const now = Date.now();
  let q = ctx.admin
    .from('word_cards')
    .select('id, word, translation, category, ease, reps, mastery, due_at, created_at')
    .eq('user_id', ctx.userId)
    .eq('learning_lang', ctx.learningLang)
    .eq('native_lang', ctx.nativeLang);
  switch (args.filter) {
    case 'weak':     q = q.lt('ease', 2.0).order('ease', { ascending: true }); break;
    case 'overdue':  q = q.lt('due_at', now).order('due_at', { ascending: true }); break;
    case 'recent':   q = q.order('created_at', { ascending: false }); break;
    case 'mastered': q = q.gte('mastery', 4).order('mastery', { ascending: false }); break;
    default: return { error: `unknown filter: ${args.filter}` };
  }
  const { data, error } = await q.limit(limit);
  if (error) return { error: error.message };
  ctx.readCalled = true;
  return (data ?? []).map((c) => ({
    id: c.id,
    word: c.word,
    translation: c.translation,
    category: c.category,
    ease: c.ease,
    reps: c.reps,
    mastery: c.mastery,
    due_in_days: c.due_at != null ? Math.round((Number(c.due_at) - now) / DAY_MS) : null,
  }));
}

async function toolGetHistory(ctx: Ctx, args: { days?: number }): Promise<unknown> {
  const days = Math.max(1, Math.min(14, Math.round(Number(args.days) || 7)));
  const { data, error } = await ctx.admin
    .from('daily_quests')
    .select('day_index, quests, difficulty')
    .eq('user_id', ctx.userId)
    .lt('day_index', ctx.dayIndex)
    .order('day_index', { ascending: false })
    .limit(days);
  if (error) return { error: error.message };
  return (data ?? []).map((r) => ({
    days_ago: ctx.dayIndex - r.day_index,
    difficulty: r.difficulty,
    targets: (r.quests as QuestTarget[]).map((q) => q.word),
  }));
}

// Эталон бытовых тем (v1 — по категориям; эмбеддинг-кластеры после GOOGLE_API_KEY).
const VOCAB_REFERENCE: Record<string, string[]> = {
  kitchen: ['cup', 'plate', 'fork', 'knife', 'bottle', 'kettle', 'pan', 'fridge'],
  furniture: ['chair', 'table', 'sofa', 'bed', 'shelf', 'lamp', 'mirror', 'wardrobe'],
  clothes: ['shirt', 'jacket', 'shoes', 'hat', 'socks', 'jeans', 'scarf', 'belt'],
  bathroom: ['towel', 'soap', 'toothbrush', 'shampoo', 'comb', 'razor'],
  office: ['pen', 'notebook', 'laptop', 'keyboard', 'scissors', 'stapler', 'folder'],
  street: ['car', 'bench', 'tree', 'sign', 'bicycle', 'lantern', 'fence', 'mailbox'],
  electronics: ['phone', 'charger', 'headphones', 'remote', 'camera', 'speaker'],
  food: ['bread', 'apple', 'cheese', 'egg', 'milk', 'tomato', 'banana', 'butter'],
};

async function toolGetVocabMap(ctx: Ctx): Promise<unknown> {
  const { data, error } = await ctx.admin
    .from('word_cards')
    .select('word, category')
    .eq('user_id', ctx.userId)
    .eq('learning_lang', ctx.learningLang)
    .eq('native_lang', ctx.nativeLang)
    .limit(500);
  if (error) return { error: error.message };
  const cards = data ?? [];
  const have = new Set(cards.map((c) => String(c.word ?? '').trim().toLowerCase()));
  const byCat = new Map<string, number>();
  for (const c of cards) {
    const k = String(c.category ?? 'без категории').toLowerCase();
    byCat.set(k, (byCat.get(k) ?? 0) + 1);
  }
  const gaps: Array<{ theme: string; missing_examples: string[] }> = [];
  for (const [theme, words] of Object.entries(VOCAB_REFERENCE)) {
    const missing = words.filter((w) => !have.has(w));
    // Дыра = покрыто меньше четверти эталона темы.
    if (words.length - missing.length <= Math.floor(words.length / 4)) {
      gaps.push({ theme, missing_examples: missing.slice(0, 5) });
    }
  }
  return {
    total_words: cards.length,
    covered_themes: Object.fromEntries([...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)),
    gaps,
    note: 'gaps — темы, где у ученика почти пусто: хорошие кандидаты для новых целей (если это физические предметы вокруг него).',
  };
}

async function toolGetReviewStats(ctx: Ctx, args: { days?: number }): Promise<unknown> {
  ctx.reviewStatsCalled = true;
  const days = Math.max(1, Math.min(14, Math.round(Number(args.days) || 7)));
  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const { data, error } = await ctx.admin
    .from('review_events')
    .select('word, kind, correct, rating, score, response_ms')
    .eq('user_id', ctx.userId)
    .eq('learning_lang', ctx.learningLang)
    .eq('native_lang', ctx.nativeLang)
    .gt('created_at', since)
    .limit(2000);
  if (error) return { error: error.message };
  const rows = data ?? [];
  if (rows.length === 0) return { days, total_answers: 0, note: 'телеметрии пока нет' };

  // Ошибка = явный неверный ответ, «забыл» или низкий score открытого ответа.
  const isMiss = (r: (typeof rows)[number]) =>
    r.correct === false || r.rating === 'again' || (r.score != null && Number(r.score) < 0.5);
  const agg = (key: 'word' | 'kind') => {
    const m = new Map<string, { attempts: number; errors: number }>();
    for (const r of rows) {
      const k = String(r[key] ?? '');
      const v = m.get(k) ?? { attempts: 0, errors: 0 };
      v.attempts += 1;
      if (isMiss(r)) v.errors += 1;
      m.set(k, v);
    }
    return [...m.entries()]
      .map(([name, v]) => ({ [key]: name, ...v }))
      .sort((a, b) => b.errors - a.errors || b.attempts - a.attempts);
  };
  const times = rows.map((r) => Number(r.response_ms)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  return {
    days,
    total_answers: rows.length,
    words_with_errors: agg('word').filter((w) => (w.errors as number) > 0).slice(0, 15),
    formats: agg('kind').slice(0, 10),
    median_response_ms: times.length ? times[Math.floor(times.length / 2)] : null,
  };
}

async function toolReschedule(
  ctx: Ctx,
  args: { card_ids?: string[]; days_from_now?: number; reason?: string },
): Promise<unknown> {
  const ids = Array.isArray(args.card_ids) ? args.card_ids.map(String).slice(0, MAX_RESCHEDULE) : [];
  const days = Math.round(Number(args.days_from_now));
  if (!ids.length) return { error: 'card_ids is empty' };
  if (!Number.isFinite(days) || days < 0 || days > MAX_RESCHEDULE_DAYS) {
    return { error: `days_from_now must be 0..${MAX_RESCHEDULE_DAYS}` };
  }
  // Только карточки ЭТОГО пользователя — фильтр в WHERE, не в промпте.
  const { data: before, error: readErr } = await ctx.admin
    .from('word_cards')
    .select('id, word, due_at')
    .eq('user_id', ctx.userId)
    .in('id', ids);
  if (readErr) return { error: readErr.message };
  const found = before ?? [];
  if (!found.length) return { error: 'no matching cards for this user' };

  // dry_run: агент «действует», но мир не меняется — два прогона сравнимы.
  if (ctx.dryRun) {
    return { rescheduled: found.map((c) => c.word), new_due_in_days: days, dry_run: true };
  }

  const newDue = Date.now() + days * DAY_MS;
  const { error: updErr } = await ctx.admin
    .from('word_cards')
    .update({ due_at: newDue, updated_at: new Date().toISOString() })
    .eq('user_id', ctx.userId)
    .in('id', found.map((c) => c.id));
  if (updErr) return { error: updErr.message };

  // Аудит: old/new для каждой карточки — откат одним UPDATE по agent_actions.
  await ctx.admin.from('agent_actions').insert(
    found.map((c) => ({
      run_id: ctx.runId,
      user_id: ctx.userId,
      action: 'reschedule_cards',
      card_id: c.id,
      old_value: { due_at: c.due_at, reason: args.reason ?? '' },
      new_value: { due_at: newDue },
    })),
  );
  return { rescheduled: found.map((c) => c.word), new_due_in_days: days };
}

// ── Критик (движок v2, Э6): второй агент проверяет план до записи ───────
//
// Отдельный LLM-вызов (t=0, structured) с чеклистом. Не approved → фидбек
// возвращается планировщику tool-сообщением, у него ОДИН ретрай; снова нет →
// квест пишется без упражнений, outcome='critic_fallback' (демо не срывается).
const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  },
  required: ['approved', 'issues'],
  additionalProperties: false,
};

async function criticReview(
  plan: {
    quests: QuestTarget[];
    coach: string;
    difficulty: string;
    exercises: Exercise[];
  },
  recentTargets: string[],
  learningLang: string,
  nativeLang: string,
): Promise<{ approved: boolean; issues: string[]; tokensIn: number; tokensOut: number }> {
  const system = [
    'Ты — строгий критик планов в языковом приложении TakeWord. Проверь план тренера по чеклисту и верни вердикт.',
    'Чеклист (отклоняй ТОЛЬКО за реальные нарушения):',
    `1. Ровно 3 цели, каждая — КОНКРЕТНЫЙ физический предмет на языке ${learningLang}, который реально найти дома/в офисе/на улице за минуту (кружка — да, «свобода»/«погода» — нет).`,
    `2. coach_message — на языке ${nativeLang}, дружелюбный, без воды.`,
    `3. Цели не повторяют недавние: ${recentTargets.length ? recentTargets.join(', ') : '(истории нет)'}.`,
    `4. Упражнения корректны: предложения грамматичны и на ${learningLang}; в cloze пропуск ____ уместен и дистракторы не являются верными ответами; предложение диктанта содержит целевое слово.`,
    'Мелкие стилистические придирки — НЕ повод отклонять. issues — коротко и конкретно.',
  ].join('\n');
  try {
    const resp = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://catch-words.com',
        'X-Title': 'TakeWord quest-critic',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 300,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(plan) },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'critic', schema: CRITIC_SCHEMA } },
      }),
    });
    if (!resp.ok) return { approved: true, issues: ['critic_unavailable'], tokensIn: 0, tokensOut: 0 };
    const data = await resp.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
    return {
      approved: parsed.approved !== false, // сомнение трактуем в пользу плана
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 5) : [],
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
    };
  } catch {
    // Критик недоступен — план не блокируем (критик улучшает, а не гейтит доступность).
    return { approved: true, issues: ['critic_error'], tokensIn: 0, tokensOut: 0 };
  }
}

// ── Агентный цикл для одного пользователя ───────────────────────────────
async function runAgentForUser(
  admin: SupabaseClient,
  userId: string,
  dayIndex: number,
  dryRun = false,
): Promise<{
  outcome: string;
  runId: number | null;
  quests?: string[];
  exercises?: Exercise[];
  difficulty?: string;
}> {
  // Активная пара языков = пара самой свежей карточки.
  const { data: last } = await admin
    .from('word_cards')
    .select('learning_lang, native_lang')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  const learningLang = last?.[0]?.learning_lang ?? 'en-US';
  const nativeLang = last?.[0]?.native_lang ?? 'ru-RU';

  const { data: runRow, error: runErr } = await admin
    .from('agent_runs')
    .insert({ user_id: userId, day_index: dayIndex, model: MODEL })
    .select('id')
    .single();
  if (runErr || !runRow) return { outcome: 'error', runId: null };
  const runId = runRow.id as number;

  const ctx: Ctx = {
    admin,
    userId,
    runId,
    dayIndex,
    learningLang,
    nativeLang,
    readCalled: false,
    reviewStatsCalled: false,
    dryRun,
  };
  let exercisesNudged = false; // однократный отказ finish без упражнений (квест важнее — второй раз принимаем)
  let criticRetried = false; // у планировщика один ретрай после отказа критика
  const steps: Array<{ tool: string; args: unknown; result: unknown }> = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let noToolStrikes = 0; // модель иногда игнорирует tool_choice=required и пишет текст
  let outcome = 'error';
  let finalQuests: string[] | undefined;
  let finalExercises: Exercise[] | undefined;
  let finalDifficulty: string | undefined;

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: systemPrompt(learningLang, nativeLang, dayIndex) },
    { role: 'user', content: 'Составь план на сегодня.' },
  ];

  try {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const resp = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://catch-words.com',
          'X-Title': 'TakeWord quest-agent',
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          tools: TOOLS,
          // Текст вне инструментов не нужен никогда. Если модель уже нарушила
          // контракт (написала план текстом) и карточки прочитаны — принудительно
          // форсируем именно finish: Gemini иногда игнорирует мягкий 'required'.
          tool_choice:
            noToolStrikes > 0 && ctx.readCalled && ctx.reviewStatsCalled
              ? { type: 'function', function: { name: 'finish' } }
              : 'required',
          temperature: 0, // воспроизводимость: тот же ученик → тот же план (шлюз П3)
          max_tokens: 1200,
        }),
      });
      if (!resp.ok) {
        steps.push({ tool: '_llm_error', args: { step }, result: await resp.text() });
        break;
      }
      const data = await resp.json();
      tokensIn += data.usage?.prompt_tokens ?? 0;
      tokensOut += data.usage?.completion_tokens ?? 0;
      const msg = data.choices?.[0]?.message;
      const call = msg?.tool_calls?.[0];
      if (!call) {
        // Нарушение контракта — не роняем прогон, а возвращаем модель в цикл
        // корректирующим сообщением (до 2 раз, дальше честный обрыв).
        steps.push({ tool: '_no_tool_call', args: { step }, result: msg?.content ?? null });
        noToolStrikes += 1;
        if (noToolStrikes > 2) break;
        messages.push(
          { role: 'assistant', content: msg?.content ?? '' },
          {
            role: 'user',
            content:
              'Отвечай ТОЛЬКО вызовом инструмента. Если план готов — вызови finish с 3 целями, coach_message, difficulty и reasoning.',
          },
        );
        continue;
      }

      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* пустые аргументы */ }
      const name = call.function.name as string;

      // Терминальное действие.
      if (name === 'finish') {
        // Guardrail: нельзя выдавать план, не посмотрев ни одной карточки.
        if (!ctx.readCalled) {
          messages.push(msg, {
            role: 'tool', tool_call_id: call.id,
            content: JSON.stringify({ error: 'Сначала посмотри карточки ученика (get_cards), потом решай.' }),
          });
          steps.push({ tool: 'finish', args, result: 'guard: rejected — no reads yet' });
          continue;
        }
        // Guardrail: план без взгляда на реальные ответы ученика — не план.
        if (!ctx.reviewStatsCalled) {
          messages.push(msg, {
            role: 'tool', tool_call_id: call.id,
            content: JSON.stringify({ error: 'Сначала вызови get_review_stats (реальные ответы ученика), потом решай.' }),
          });
          steps.push({ tool: 'finish', args, result: 'guard: rejected — review stats not read' });
          continue;
        }
        const rawQuests = Array.isArray(args.quests) ? (args.quests as Record<string, unknown>[]) : [];
        if (rawQuests.length !== 3) {
          messages.push(msg, {
            role: 'tool', tool_call_id: call.id,
            content: JSON.stringify({ error: 'Нужно ровно 3 цели.' }),
          });
          steps.push({ tool: 'finish', args, result: 'guard: rejected — not 3 targets' });
          continue;
        }
        const quests: QuestTarget[] = rawQuests.map((q) => ({
          word: String(q.word ?? '').trim(),
          emoji: String(q.emoji ?? '❓'),
          translation: String(q.translation ?? '').trim(),
          category: q.category != null ? String(q.category) : null,
          ipa: q.ipa != null ? String(q.ipa) : '',
          dayIndex,
        }));
        // Упражнения тренировки: слова — только из коллекции или целей квеста.
        const { data: ownWords } = await admin
          .from('word_cards')
          .select('word')
          .eq('user_id', userId)
          .eq('learning_lang', learningLang)
          .eq('native_lang', nativeLang)
          .limit(500);
        const allowed = new Set<string>(
          (ownWords ?? []).map((r: { word: unknown }) => String(r.word).toLowerCase()),
        );
        for (const q of quests) allowed.add(q.word.toLowerCase());
        const exercises = validateExercises(args.exercises, allowed);

        // Guardrail: тренировка — обязательная часть плана. Один отказ с
        // подсказкой; если модель и со второго раза не дала валидных
        // упражнений — принимаем квест без них (квест важнее).
        if (exercises.length === 0 && !exercisesNudged) {
          exercisesNudged = true;
          messages.push(msg, {
            role: 'tool', tool_call_id: call.id,
            content: JSON.stringify({
              error: 'Добавь в exercises 3–6 упражнений (dictation/cloze/writeSentence) под цели квеста и слабые слова. dictation/cloze — с полем sentence (в cloze пропуск ____ и 3 distractors).',
            }),
          });
          steps.push({ tool: 'finish', args: { reasoning: args.reasoning }, result: 'guard: rejected — no exercises' });
          continue;
        }

        // ── Критик (Э6): второй агент проверяет план до записи ──
        const historyRaw = (await toolGetHistory(ctx, { days: 7 })) as
          | Array<{ targets?: string[] }>
          | { error: string };
        const recentTargets = Array.isArray(historyRaw)
          ? historyRaw.flatMap((h) => h.targets ?? [])
          : [];
        const critic = await criticReview(
          {
            quests,
            coach: String(args.coach_message ?? ''),
            difficulty: String(args.difficulty ?? 'normal'),
            exercises,
          },
          recentTargets,
          learningLang,
          nativeLang,
        );
        tokensIn += critic.tokensIn;
        tokensOut += critic.tokensOut;
        steps.push({ tool: '_critic', args: {}, result: { approved: critic.approved, issues: critic.issues } });

        let exercisesToWrite = exercises;
        let criticFallback = false;
        if (!critic.approved) {
          if (!criticRetried) {
            criticRetried = true;
            messages.push(msg, {
              role: 'tool', tool_call_id: call.id,
              content: JSON.stringify({
                error: `Критик отклонил план: ${critic.issues.join('; ')}. Исправь и вызови finish снова.`,
              }),
            });
            continue;
          }
          // Второй отказ: квест важнее — пишем без упражнений, помечаем фолбэк.
          exercisesToWrite = [];
          criticFallback = true;
        }

        if (!dryRun) {
          const { error: upErr } = await admin.from('daily_quests').upsert({
            user_id: userId,
            day_index: dayIndex,
            quests,
            coach_message: String(args.coach_message ?? ''),
            difficulty: String(args.difficulty ?? 'normal'),
            exercises: exercisesToWrite,
            run_id: runId,
          });
          if (upErr) {
            steps.push({ tool: 'finish', args, result: `db error: ${upErr.message}` });
            break;
          }
        }
        finalQuests = quests.map((q) => q.word);
        finalExercises = exercisesToWrite;
        finalDifficulty = String(args.difficulty ?? 'normal');
        steps.push({
          tool: 'finish',
          args: { reasoning: args.reasoning },
          result: {
            targets: finalQuests,
            exercises: exercisesToWrite.map((e) => `${e.kind}:${e.word}`),
          },
        });
        outcome = criticFallback ? 'critic_fallback' : 'ok';
        break;
      }

      // Обычные инструменты.
      let result: unknown;
      if (name === 'get_collection_stats') result = await toolGetStats(ctx);
      else if (name === 'get_cards') result = await toolGetCards(ctx, args);
      else if (name === 'get_quest_history') result = await toolGetHistory(ctx, args);
      else if (name === 'get_review_stats') result = await toolGetReviewStats(ctx, args);
      else if (name === 'get_vocab_map') result = await toolGetVocabMap(ctx);
      else if (name === 'reschedule_cards') result = await toolReschedule(ctx, args);
      else result = { error: `unknown tool: ${name}` };

      steps.push({ tool: name, args, result });
      messages.push(msg, {
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
    if (outcome !== 'ok' && steps.length >= MAX_STEPS) outcome = 'guard_rejected';
  } catch (e) {
    steps.push({ tool: '_exception', args: {}, result: String(e) });
  }

  await admin
    .from('agent_runs')
    .update({
      finished_at: new Date().toISOString(),
      steps,
      outcome,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: tokensIn * PRICE_IN + tokensOut * PRICE_OUT,
    })
    .eq('id', runId);
  return { outcome, runId, quests: finalQuests, exercises: finalExercises, difficulty: finalDifficulty };
}

// ── Дайджест недели (Э6): один LLM-вызов, не ReAct ──────────────────────
async function runDigestForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<{ outcome: string; week_start?: string }> {
  const { data: last } = await admin
    .from('word_cards')
    .select('learning_lang, native_lang')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  const learningLang = last?.[0]?.learning_lang ?? 'en-US';
  const nativeLang = last?.[0]?.native_lang ?? 'ru-RU';

  const since = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const { data: events } = await admin
    .from('review_events')
    .select('word, kind, correct, rating, score')
    .eq('user_id', userId)
    .eq('learning_lang', learningLang)
    .eq('native_lang', nativeLang)
    .gt('created_at', since)
    .limit(1000);
  const rows = events ?? [];
  if (rows.length === 0) return { outcome: 'skipped_no_activity' };

  const isMiss = (r: (typeof rows)[number]) =>
    r.correct === false || r.rating === 'again' || (r.score != null && Number(r.score) < 0.5);
  const byWord = new Map<string, { attempts: number; errors: number }>();
  for (const r of rows) {
    const v = byWord.get(String(r.word)) ?? { attempts: 0, errors: 0 };
    v.attempts += 1;
    if (isMiss(r)) v.errors += 1;
    byWord.set(String(r.word), v);
  }
  const sorted = [...byWord.entries()];
  const hard = sorted.filter(([, v]) => v.errors > 0).sort((a, b) => b[1].errors - a[1].errors).slice(0, 3);
  const strong = sorted.filter(([, v]) => v.errors === 0 && v.attempts >= 2).slice(0, 3);
  const stats = {
    answers: rows.length,
    errors: rows.filter(isMiss).length,
    hard_words: hard.map(([w]) => w),
    strong_words: strong.map(([w]) => w),
  };

  let digest = '';
  try {
    const resp = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://catch-words.com',
        'X-Title': 'TakeWord coach-digest',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 350,
        messages: [
          {
            role: 'system',
            content: `Ты — тренер TakeWord. Напиши ученику итог недели на языке ${nativeLang}: максимум 550 символов, связный тёплый текст без списков. Сначала что получилось, затем где спотыкался (назови слова), в конце — короткий план на следующую неделю.`,
          },
          { role: 'user', content: JSON.stringify(stats) },
        ],
      }),
    });
    if (!resp.ok) return { outcome: 'llm_error' };
    const data = await resp.json();
    digest = String(data.choices?.[0]?.message?.content ?? '').trim().slice(0, 600);
  } catch {
    return { outcome: 'llm_error' };
  }
  if (!digest) return { outcome: 'llm_error' };

  // Понедельник текущей UTC-недели.
  const now = new Date();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  const weekStart = monday.toISOString().slice(0, 10);

  const { error } = await admin.from('coach_digests').upsert({
    user_id: userId,
    week_start: weekStart,
    digest,
    stats,
  });
  if (error) return { outcome: 'db_error' };
  return { outcome: 'ok', week_start: weekStart };
}

// ── HTTP-обвязка ─────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!API_KEY || !AGENT_SECRET || !SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: 'server_misconfigured' }, 500);
  }
  // Аутентификация собственным секретом (как polar-webhook): крон и debug-curl.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (token !== AGENT_SECRET) return json({ error: 'unauthorized' }, 401);

  let body: { mode?: string; user_id?: string; day_index?: number; dry_run?: boolean };
  try { body = await req.json(); } catch { body = {}; }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const todayIdx = Math.floor(Date.now() / DAY_MS);

  // 'user' — рабочий режим ночного fan-out (pg_cron шлёт ПО ОДНОМУ запросу на
  // юзера, см. миграцию); 'debug' — то же самое руками, + поддержка dry_run.
  // Один юзер на запрос — принципиально: батч всех в одном запросе упирается
  // в WORKER_RESOURCE_LIMIT edge-воркера (проверено 10.07.2026).
  // Дайджест недели (воскресный cron, fan-out по юзерам с активностью).
  if (body.mode === 'digest') {
    if (!body.user_id) return json({ error: 'user_id required' }, 400);
    const res = await runDigestForUser(admin, String(body.user_id));
    return json({ mode: 'digest', ...res });
  }

  if (body.mode === 'debug' || body.mode === 'user') {
    if (!body.user_id) return json({ error: 'user_id required' }, 400);
    const dayIndex = Number.isFinite(Number(body.day_index)) ? Number(body.day_index) : todayIdx;
    const res = await runAgentForUser(admin, String(body.user_id), dayIndex, body.dry_run === true);
    return json({ mode: body.mode, day_index: dayIndex, dry_run: body.dry_run === true, ...res });
  }

  // cron: ЗАПАСНОЙ последовательный режим для ручного прогона малых баз.
  // На проде НЕ используется — там fan-out по одному юзеру (см. выше).
  const dayIndex = todayIdx + 1;
  // Только активные: есть хотя бы одна карточка (не жжём токены на пустых).
  const { data: users, error } = await admin
    .from('word_cards')
    .select('user_id')
    .limit(2000);
  if (error) return json({ error: error.message }, 500);
  const unique = [...new Set((users ?? []).map((r) => r.user_id as string))];

  const started = Date.now();
  const results: Array<{ user_id: string; outcome: string }> = [];
  for (const uid of unique) {
    if (Date.now() - started > RUN_DEADLINE_MS) {
      results.push({ user_id: uid, outcome: 'skipped_deadline' });
      continue;
    }
    const res = await runAgentForUser(admin, uid, dayIndex);
    results.push({ user_id: uid, outcome: res.outcome });
  }
  return json({ mode: 'cron', day_index: dayIndex, processed: results.length, results });
});
