/**
 * Веб-вариант распознавания. ТЕ ЖЕ экспорты, что у recognize.ts, но ресайз/кроп
 * через <canvas> (вместо expo-image-manipulator), запрос — на ту же edge-функцию
 * /recognize. «Сохранение» (persistImage) — no-op: на вебе картинка живёт как
 * data URL и грузится в Storage при входе (см. sticker-upload.web.ts).
 */
import { lookupWord } from '@/lib/dictionary';
import { supabase } from '@/lib/supabase';
import type { ScanResult, Visor } from '@/lib/scan-job';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const RECOGNIZE_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/recognize` : '';

/** Сервер вернул 402 — бесплатные сканы кончились. Экран показывает пейволл. */
export class ScanLimitError extends Error {
  /** true → premium исчерпал дневной fair-use кап (не free-лимит). */
  readonly premium: boolean;
  constructor(premium = false) {
    super('scan_limit_reached');
    this.name = 'ScanLimitError';
    this.premium = premium;
  }
}

const MAX_EDGE = 1024;
const TIMEOUT_MS = 15000;

/** Один распознанный предмет (что вернёт /recognize). Совпадает с recognize.ts. */
export interface RecognizedObject {
  word: string;
  translation: string;
  ipa: string;
  category: string | null;
  emoji: string;
  bbox: number[] | null;
  confidence: number | null;
  examples?: string[];
  note?: string;
  distractors?: string[];
  synonyms?: string[];
  questMatch?: string;
}

export function isRecognitionConfigured(): boolean {
  return Boolean(RECOGNIZE_URL && SUPABASE_ANON);
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = uri;
  });
}

/** Нарисовать картинку в canvas с ресайзом до maxEdge по длинной стороне. */
function drawResized(img: HTMLImageElement, maxEdge = MAX_EDGE) {
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  const scale = Math.min(1, maxEdge / Math.max(w0, h0, 1));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
  return { canvas, width: w, height: h };
}

async function prepare(uri: string) {
  try {
    const img = await loadImage(uri);
    const { canvas, width, height } = drawResized(img);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.6), width, height };
  } catch {
    return null;
  }
}

export async function recognizePhoto(
  photoUri: string,
  learningLang: string,
  nativeLang: string,
  maxObjects = 1,
  questWords: string[] = [],
): Promise<{
  objects: RecognizedObject[];
  prepared: { uri: string; width: number; height: number };
} | null> {
  if (!isRecognitionConfigured()) return null;
  const prepared = await prepare(photoUri);
  if (!prepared) return null;

  // Токен вошедшего пользователя — чтобы сервер посчитал лимит именно ему.
  // Гость → anon-ключ (серверный лимит к нему не применяется).
  const token = (await supabase.auth.getSession()).data.session?.access_token;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(RECOGNIZE_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token ?? SUPABASE_ANON}`,
      },
      body: JSON.stringify({ image: prepared.dataUrl, learningLang, nativeLang, maxObjects, questWords }),
    });
    if (res.status === 402) {
      const body = (await res.json().catch(() => null)) as { premium?: boolean } | null;
      throw new ScanLimitError(body?.premium === true);
    }
    if (!res.ok) {
      console.warn('recognize HTTP', res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const data = (await res.json()) as { objects?: RecognizedObject[] };
    return {
      objects: Array.isArray(data.objects) ? data.objects : [],
      prepared: { uri: prepared.dataUrl, width: prepared.width, height: prepared.height },
    };
  } catch (e) {
    if (e instanceof ScanLimitError) throw e; // пробрасываем — экран покажет пейволл
    console.warn('recognize failed:', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Вырезать предмет по bbox (доли 0..1) из подготовленного фото → data URL. */
export async function cropToSticker(
  preparedUri: string,
  width: number,
  height: number,
  bbox: number[] | null,
): Promise<string | null> {
  try {
    if (!bbox || bbox.length !== 4 || width <= 0 || height <= 0) return preparedUri;
    const img = await loadImage(preparedUri);
    const pad = 0.06; // лёгкий запас вокруг предмета
    const bx = Math.max(0, bbox[0] - bbox[2] * pad);
    const by = Math.max(0, bbox[1] - bbox[3] * pad);
    const bw = Math.min(1 - bx, bbox[2] * (1 + 2 * pad));
    const bh = Math.min(1 - by, bbox[3] * (1 + 2 * pad));
    const sx = Math.round(bx * width);
    const sy = Math.round(by * height);
    const sw = Math.max(1, Math.round(bw * width));
    const sh = Math.max(1, Math.round(bh * height));
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return preparedUri;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (e) {
    console.warn('cropToSticker web failed:', e);
    return null;
  }
}

/**
 * На вебе «визира» (рамки наведения) нет — пользователь не наводит живую камеру,
 * а ВЫБИРАЕТ готовое фото (input capture / галерея). Поэтому кроп по экранной
 * рамке тут неуместен: он вырезал бы случайный центральный квадрат и калечил бы
 * фото ещё до распознавания. Возвращаем кадр ЦЕЛИКОМ — распознавание само найдёт
 * главный предмет. (Сигнатура совпадает с recognize.ts; screen-аргументы не нужны.)
 */
export async function cropToFrame(
  uri: string,
  _visor: Visor,
): Promise<{ uri: string; width: number; height: number } | null> {
  try {
    const img = await loadImage(uri);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    return { uri, width, height };
  } catch (e) {
    console.warn('cropToFrame web failed:', e);
    return null;
  }
}

/** На вебе «постоянная папка» не нужна — data URL самодостаточен. */
export async function persistImage(srcUri: string): Promise<string> {
  return srcUri;
}

/** Собрать ScanResult из объекта (для EN уточняем IPA/перевод словарём). */
export function toScanResult(obj: RecognizedObject, learningLang: string): ScanResult {
  let ipa = obj.ipa;
  let translation = obj.translation;
  if (learningLang.toLowerCase().startsWith('en')) {
    const hit = lookupWord(obj.word);
    if (hit) {
      if (hit.ipa) ipa = hit.ipa;
      if (!translation && hit.translation) translation = hit.translation;
    }
  }
  return {
    word: obj.word,
    translation,
    ipa,
    category: obj.category,
    emoji: obj.emoji,
    examples: obj.examples ?? [],
    note: obj.note || undefined,
    distractors: obj.distractors ?? [],
    synonyms: obj.synonyms ?? [],
    questMatch: obj.questMatch || undefined,
    auto: true,
  };
}
