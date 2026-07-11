/**
 * Клиент ИИ-оценки открытых ответов (движок v2, Э2 → edge-функция grade-answer).
 *
 * Контракт отказоустойчивости (спека B.2): потолок ожидания ~6 секунд —
 * попытка с таймаутом 4 с + один ретрай с таймаутом 2 с. Любая ошибка →
 * структурированный отказ, по которому экран падает в локальный фолбэк
 * (пользователь НИКОГДА не застревает на спиннере):
 *   'auth'        — гость: локальная проверка + CTA «Войди»;
 *   'limit'       — кап 50/день: молчаливый локальный фолбэк до конца сессии;
 *   'unavailable' — LLM/сеть: «Тренер недоступен».
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export type GradeTask = 'dictation' | 'write_sentence' | 'describe_photo';
export type GradeVerdict = 'correct' | 'partial' | 'wrong';

export interface GradeRequest {
  task: GradeTask;
  word: string;
  /** Что ученик слышал (диктант) — предложение целиком. */
  expected?: string;
  userAnswer: string;
  learningLang: string;
  nativeLang: string;
}

export type GradeOutcome =
  | { ok: true; verdict: GradeVerdict; score: number; feedback: string; corrected: string }
  | { ok: false; reason: 'auth' | 'limit' | 'unavailable' };

const TIMEOUTS_MS = [4_000, 2_000] as const;

async function attempt(req: GradeRequest, token: string, timeoutMs: number): Promise<GradeOutcome | null> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, reason: 'unavailable' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${url}/functions/v1/grade-answer`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        apikey: anon,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...req, userAnswer: req.userAnswer.slice(0, 500) }),
    });
    if (resp.status === 401) return { ok: false, reason: 'auth' };
    if (resp.status === 429) return { ok: false, reason: 'limit' };
    if (!resp.ok) return null; // 5xx → пробуем ретрай
    const d = await resp.json();
    if (!d || typeof d.verdict !== 'string') return null;
    return {
      ok: true,
      verdict: (['correct', 'partial', 'wrong'].includes(d.verdict) ? d.verdict : 'partial') as GradeVerdict,
      score: Math.max(0, Math.min(1, Number(d.score) || 0)),
      feedback: String(d.feedback ?? ''),
      corrected: String(d.corrected ?? ''),
    };
  } catch {
    return null; // таймаут/сеть → ретрай
  } finally {
    clearTimeout(timer);
  }
}

/** Оценить открытый ответ. Никогда не бросает исключений. */
export async function gradeAnswer(req: GradeRequest): Promise<GradeOutcome> {
  try {
    if (!isSupabaseConfigured()) return { ok: false, reason: 'unavailable' };
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, reason: 'auth' };
    for (const timeoutMs of TIMEOUTS_MS) {
      const res = await attempt(req, token, timeoutMs);
      if (res) return res;
    }
    return { ok: false, reason: 'unavailable' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
