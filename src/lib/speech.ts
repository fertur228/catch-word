/**
 * Озвучка слова (спека §2: уходим от «робо-голоса»). Используем нативный
 * `expo-speech`, но не голос «по умолчанию», а ЛУЧШИЙ доступный на устройстве:
 * iOS-голоса бывают Default (компактный, роботичный) и Enhanced/Premium
 * (нейросетевые, звучат как в топовых обучалках). Выбираем самый качественный
 * для нужного языка и кэшируем выбор.
 *
 * Если на устройстве стоит только компактный голос — стоит предложить скачать
 * улучшенный: Настройки iOS → Универсальный доступ → Контент чтения → Голоса →
 * English → выбрать голос с пометкой «Премиум/Enhanced». См. `hasEnhancedVoice`.
 */
import * as Speech from 'expo-speech';

import { configurePlayback } from '@/lib/audio-session';

/** Скорости речи: обычная и «черепаха» (медленно, для тренировки — как в Duolingo). */
export const SPEECH_RATE = { normal: 0.95, slow: 0.4 } as const;

export interface SpeakOptions {
  /** Колбэк при старте произношения (для анимации «говорит»). */
  onStart?: () => void;
  /** Колбэк при завершении/остановке/ошибке. */
  onDone?: () => void;
  /** Скорость (1.0 — обычная). По умолчанию чуть медленнее для чёткости. */
  rate?: number;
}

// Кэш выбранного голоса по языку (en-US → identifier|null).
const voiceCache = new Map<string, string | null>();
let voicesPromise: Promise<Speech.Voice[]> | null = null;

function loadVoices(): Promise<Speech.Voice[]> {
  if (!voicesPromise) {
    voicesPromise = Speech.getAvailableVoicesAsync().catch(() => [] as Speech.Voice[]);
  }
  return voicesPromise;
}

/** Имена «человечных» голосов iOS — поднимаем их в приоритете. */
const PREFERRED = ['ava', 'evan', 'samantha', 'allison', 'zoe', 'nathan', 'joelle', 'serena', 'daniel', 'arthur', 'kate', 'oliver'];
/** Novelty/служебные голоса — опускаем вниз. */
const NOVELTY = /eloquence|novelty|grandma|grandpa|bells|bubbles|wobble|whisper|organ|cellos|zarvox|trinoids|bad news|good news|boing|jester|superstar/;

function rankVoice(v: Speech.Voice): number {
  let score = 0;
  const q = String(v.quality ?? '').toLowerCase();
  if (q.includes('premium')) score += 100;
  else if (q.includes('enhanced')) score += 60;
  const name = (v.name ?? '').toLowerCase();
  if (PREFERRED.some((n) => name.includes(n))) score += 20;
  if (NOVELTY.test(name)) score -= 100;
  return score;
}

async function bestVoiceFor(language: string): Promise<string | null> {
  if (voiceCache.has(language)) return voiceCache.get(language) ?? null;
  const voices = await loadVoices();
  const lang = language.toLowerCase();
  const base = lang.split('-')[0];
  const candidates = voices.filter((v) => {
    const vl = (v.language ?? '').toLowerCase();
    return vl === lang || vl.startsWith(base + '-') || vl === base;
  });
  candidates.sort((a, b) => {
    // Точное совпадение языка важнее (en-US предпочтительнее en-GB для en-US).
    const exactA = (a.language ?? '').toLowerCase() === lang ? 1 : 0;
    const exactB = (b.language ?? '').toLowerCase() === lang ? 1 : 0;
    if (exactA !== exactB) return exactB - exactA;
    return rankVoice(b) - rankVoice(a);
  });
  const chosen = candidates[0]?.identifier ?? null;
  voiceCache.set(language, chosen);
  return chosen;
}

/**
 * Произнести слово на изучаемом языке лучшим доступным голосом.
 * @param text     что произнести
 * @param language BCP-47, напр. 'en-US' — акцент/язык
 * @param opts     колбэки старт/конец (для анимации) и скорость
 */
export function speakWord(text: string, language = 'en-US', opts: SpeakOptions = {}) {
  // Гарантируем, что звук пойдёт даже в беззвучном режиме (как в Duolingo).
  configurePlayback();
  // Прерываем предыдущее, чтобы не накладывалось.
  Speech.stop();
  const base = {
    language,
    rate: opts.rate ?? SPEECH_RATE.normal,
    pitch: 1.0,
    onStart: opts.onStart,
    onDone: opts.onDone,
    onStopped: opts.onDone,
  };
  // Выбор голоса асинхронный, но после первого раза мгновенный (из кэша).
  bestVoiceFor(language)
    .then((voice) => {
      Speech.speak(text, {
        ...base,
        voice: voice ?? undefined,
        // Если выбранный «улучшенный» голос не сработал — повторяем дефолтным.
        onError: () => Speech.speak(text, base),
      });
    })
    .catch(() => Speech.speak(text, base));
}

/** Есть ли улучшенный (нейросетевой) голос для языка на устройстве. */
export async function hasEnhancedVoice(language = 'en-US'): Promise<boolean> {
  const voices = await loadVoices();
  const base = language.toLowerCase().split('-')[0];
  return voices.some((v) => {
    const vl = (v.language ?? '').toLowerCase();
    const q = String(v.quality ?? '').toLowerCase();
    return vl.startsWith(base) && (q.includes('enhanced') || q.includes('premium'));
  });
}

/** Сбросить кэш голосов (после скачивания нового голоса в настройках iOS). */
export function resetVoiceCache() {
  voicesPromise = null;
  voiceCache.clear();
}
