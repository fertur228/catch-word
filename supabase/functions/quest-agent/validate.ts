// Валидация упражнений тренировки (guardrails Э3 — кодом, не промптом).
//
// Чистый TypeScript без Deno-API: вынесен из index.ts, чтобы покрыть юнит-тестами
// (vitest гоняет его в node). index.ts импортирует отсюда с расширением .ts —
// так требует Deno для относительных импортов.

/** Упражнение тренировки дня (контракт v1 — тот же, что AgentExercise на клиенте). */
export interface Exercise {
  v: 1;
  word: string;
  kind: 'dictation' | 'cloze' | 'writeSentence';
  sentence?: string;
  distractors?: string[];
  prompt?: string;
  why?: string;
}

/**
 * Санитайзер эмодзи цели квеста. Модель иногда кладёт в поле мусор: «getTable»
 * (ночь 14.07, чёрный текст вместо иконки) или слово на языке ученика
 * (« میز» — «стол» на фарси). Эмодзи не содержит БУКВ/ЦИФР НИКАКИХ алфавитов
 * (\p{L}/\p{N}) и короче 9 код-юнитов; всё остальное заменяем нейтральным
 * символом.
 */
export function sanitizeEmoji(raw: unknown, fallback = '❓'): string {
  const s = String(raw ?? '').trim();
  if (!s || s.length > 8 || /[\p{L}\p{N}]/u.test(s)) return fallback;
  return s;
}

/**
 * Кап длины сообщения тренера: hero-карточка на клиенте показывает максимум
 * 3 строки (~120 символов), промпт просит ≤110, но модель это нарушает.
 * Режем по границе предложения, если целое предложение влезает; иначе — жёстко
 * с многоточием. Схлопываем переводы строк/двойные пробелы.
 */
export function clampCoachMessage(raw: unknown, max = 120): string {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  let out = '';
  for (const m of s.matchAll(/[^.!?…]+[.!?…]+["»)]?(\s|$)/g)) {
    const candidate = (out ? out + ' ' : '') + m[0].trim();
    if (candidate.length > max) break;
    out = candidate;
  }
  if (out) return out;
  return s.slice(0, max - 1).trimEnd() + '…';
}

/**
 * Невалидное упражнение отбрасывается МОЛЧА (квест важнее тренировки):
 * ≤8 штук, kind из белого списка, слово — только из allowedWords (коллекция +
 * цели квеста), предложения ≤120 символов, cloze обязан содержать пропуск
 * «____» и ≥2 дистракторов, dictation — предложение с целевым словом.
 */
export function validateExercises(raw: unknown, allowedWords: Set<string>): Exercise[] {
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
