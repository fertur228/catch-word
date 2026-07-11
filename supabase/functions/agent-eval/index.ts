// Судья прогонов агента (движок v2, Э6): LLM-оценка одного прогона по рубрике.
//
//   pg_cron 23:00 ── fan-out по run_id ──► agent-eval ──► agent_evals
//
// Fan-out по одному прогону на HTTP-запрос — принципиально (WORKER_RESOURCE_LIMIT,
// прецедент 10.07). Рубрика 1–5: персонализация / разнообразие / выполнимость /
// качество упражнений. Ground truth: ручная разметка 10 прогонов по той же
// рубрике (scripts/judge-ground-truth.md) — % согласия судьи с человеком.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BASE_URL = Deno.env.get('RECOGNIZE_BASE_URL') ?? 'https://openrouter.ai/api/v1';
const MODEL = Deno.env.get('RECOGNIZE_MODEL') ?? 'google/gemini-2.5-flash';
const API_KEY = Deno.env.get('RECOGNIZE_API_KEY') ?? '';
const AGENT_SECRET = Deno.env.get('QUEST_AGENT_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const PRICE_IN = 0.30 / 1e6;
const PRICE_OUT = 2.50 / 1e6;

const RUBRIC_SCHEMA = {
  type: 'object',
  properties: {
    personalization: { type: 'integer', minimum: 1, maximum: 5, description: 'План опирается на данные ИМЕННО этого ученика (телеметрия/просрочка), а не общий шаблон.' },
    variety: { type: 'integer', minimum: 1, maximum: 5, description: 'Цели/форматы не повторяют вчерашние по кругу.' },
    feasibility: { type: 'integer', minimum: 1, maximum: 5, description: 'Цели — конкретные фотографируемые предметы.' },
    exercises_quality: { type: 'integer', minimum: 1, maximum: 5, description: 'Упражнения грамматичны и соответствуют слабым местам; 1 — если упражнений нет без причины.' },
    verdict: { type: 'string', description: 'Один абзац: главное достоинство и главный недостаток прогона.' },
  },
  required: ['personalization', 'variety', 'feasibility', 'exercises_quality', 'verdict'],
  additionalProperties: false,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Компактная выжимка прогона для судьи (полные steps — слишком жирно). */
// deno-lint-ignore no-explicit-any
function summarizeRun(steps: any[]): unknown {
  return steps.map((s) => {
    if (s.tool === 'finish') return { tool: 'finish', reasoning: s.args?.reasoning, result: s.result };
    if (s.tool === '_critic') return { tool: 'critic', result: s.result };
    return { tool: s.tool, args: s.args, result_preview: JSON.stringify(s.result).slice(0, 300) };
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!API_KEY || !AGENT_SECRET || !SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: 'server_misconfigured' }, 500);
  }
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (token !== AGENT_SECRET) return json({ error: 'unauthorized' }, 401);

  let body: { run_id?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const runId = Math.round(Number(body.run_id));
  if (!Number.isFinite(runId) || runId <= 0) return json({ error: 'run_id required' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: run, error } = await admin
    .from('agent_runs')
    .select('id, user_id, day_index, outcome, steps')
    .eq('id', runId)
    .maybeSingle();
  if (error || !run) return json({ error: error?.message ?? 'run_not_found' }, 404);

  const prompt = [
    'Оцени ночной прогон агента-тренера по рубрике (1–5 по каждой оси). Будь строг, но справедлив.',
    `outcome: ${run.outcome}`,
    'Трейс (инструменты → результаты):',
    JSON.stringify(summarizeRun(Array.isArray(run.steps) ? run.steps : [])),
  ].join('\n');

  let resp: Response;
  try {
    resp = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://catch-words.com',
        'X-Title': 'TakeWord agent-eval',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_schema', json_schema: { name: 'rubric', schema: RUBRIC_SCHEMA } },
      }),
    });
  } catch (e) {
    return json({ error: `llm_error: ${String(e)}` }, 502);
  }
  if (!resp.ok) return json({ error: `llm_status_${resp.status}` }, 502);

  try {
    const data = await resp.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
    const clamp = (n: unknown) => Math.max(1, Math.min(5, Math.round(Number(n) || 1)));
    const scores = {
      personalization: clamp(parsed.personalization),
      variety: clamp(parsed.variety),
      feasibility: clamp(parsed.feasibility),
      exercises_quality: clamp(parsed.exercises_quality),
    };
    const cost =
      (data.usage?.prompt_tokens ?? 0) * PRICE_IN + (data.usage?.completion_tokens ?? 0) * PRICE_OUT;
    const { error: insErr } = await admin.from('agent_evals').upsert({
      run_id: runId,
      scores,
      verdict: String(parsed.verdict ?? '').slice(0, 500),
      cost_usd: cost,
    });
    if (insErr) return json({ error: insErr.message }, 500);
    return json({ run_id: runId, scores });
  } catch (e) {
    return json({ error: `parse_error: ${String(e)}` }, 502);
  }
});
