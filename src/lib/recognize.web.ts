/**
 * Веб-вариант распознавания. ТЕ ЖЕ экспорты, что у recognize.ts, но ресайз/кроп
 * через <canvas> (вместо expo-image-manipulator), запрос — на ту же edge-функцию
 * /recognize. «Сохранение» (persistImage) — no-op: на вебе картинка живёт как
 * data URL и грузится в Storage при входе (см. sticker-upload.web.ts).
 */
import { normalizeCategory } from '@/lib/category';
import { lookupWord } from '@/lib/dictionary';
import { supabase } from '@/lib/supabase';
import type { ScanResult, Visor } from '@/lib/scan-job';
import type { ScanTimer } from '@/lib/scan-timing';

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

// 1536px / JPEG 0.85: агрессивный препроцессинг (1024/0.6) резал точность
// распознавания (готча в памяти команды). Gemini тайлит по 768px — 1536 стоит
// столько же токенов, сколько 1024, а деталей заметно больше.
const MAX_EDGE = 1536;
const JPEG_QUALITY = 0.85;
// Два параллельных вызова модели (распознавание + маски) на больших фото.
const TIMEOUT_MS = 20000;

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
  /** Маска сегментации (data-URI PNG, белое = предмет) — только с wantMasks. */
  mask?: string | null;
  /** Регион маски [x,y,w,h] в долях 0..1 (может чуть отличаться от bbox). */
  maskBox?: number[] | null;
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

/**
 * Нарисовать картинку в canvas, ужав под потолок maxEdge по длинной стороне.
 * Только вниз: `Math.min(1, …)` не даёт растянуть кадр меньше потолка.
 */
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

/** Подготовленный к скану кадр (сигнатура совпадает с recognize.ts). */
export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
}

/**
 * Подготовить кадр к скану: ужать под потолок MAX_EDGE → data URL.
 *
 * Визир на вебе не используется: пользователь не наводит живую камеру, а
 * ВЫБИРАЕТ готовое фото (input capture / галерея), поэтому кроп по экранной
 * рамке вырезал бы случайный квадрат и калечил кадр ещё до распознавания —
 * отдаём кадр целиком, модель сама найдёт главный предмет. (Аргумент visor
 * есть только для паритета сигнатуры с recognize.ts.)
 */
export async function prepareScanImage(
  photoUri: string,
  _visor: Visor | null,
  _timer?: ScanTimer,
): Promise<PreparedImage | null> {
  try {
    const img = await loadImage(photoUri);
    const { canvas, width, height } = drawResized(img);
    return { uri: canvas.toDataURL('image/jpeg', JPEG_QUALITY), width, height };
  } catch (e) {
    console.warn('Не удалось подготовить кадр:', e);
    return null;
  }
}

/**
 * Позвать /recognize подготовленным кадром. Веб остаётся на JSON+base64: тут
 * нет ни моста RN, ни мобильного аплинка, ради которых натив ушёл на сырые
 * байты, а data URL и так уже base64 (см. recognize.ts).
 */
export async function recognizePhoto(
  prepared: PreparedImage,
  learningLang: string,
  nativeLang: string,
  maxObjects = 1,
  questWords: string[] = [],
  _timer?: ScanTimer,
): Promise<{ objects: RecognizedObject[] } | null> {
  if (!isRecognitionConfigured()) return null;

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
      body: JSON.stringify({
        image: prepared.uri,
        learningLang,
        nativeLang,
        maxObjects,
        questWords,
        // Веб: просим маски сегментации — вырез по контуру + белая обводка,
        // как в нативной вырезке Vision на iOS.
        wantMasks: true,
      }),
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
    return { objects: Array.isArray(data.objects) ? data.objects : [] };
  } catch (e) {
    if (e instanceof ScanLimitError) throw e; // пробрасываем — экран покажет пейволл
    console.warn('recognize failed:', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Прогрев соединения с /recognize (см. recognize.ts). */
export function prewarmRecognition(): void {
  if (!isRecognitionConfigured()) return;
  void fetch(RECOGNIZE_URL, { method: 'OPTIONS', headers: { apikey: SUPABASE_ANON } }).catch(() => {});
}

/** Кроп региона [x,y,w,h] (доли 0..1) из картинки → canvas. */
function cropRegion(img: HTMLImageElement, box: number[], width: number, height: number) {
  const sx = Math.round(Math.max(0, box[0]) * width);
  const sy = Math.round(Math.max(0, box[1]) * height);
  const sw = Math.max(1, Math.round(Math.min(1 - Math.max(0, box[0]), box[2]) * width));
  const sh = Math.max(1, Math.round(Math.min(1 - Math.max(0, box[1]), box[3]) * height));
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext('2d')?.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

/**
 * Вырез по маске сегментации + запечённая белая обводка (стикер-стайл, как в
 * нативной вырезке на iOS). Маска — grayscale PNG (белое = предмет), растянутая
 * на регион maskBox; переносим её яркость в альфу кропа, затем под вырез
 * подкладываем белый силуэт, размноженный по кругу (дилатация без ctx.filter —
 * его нет в Safari).
 */
async function maskedSticker(
  img: HTMLImageElement,
  width: number,
  height: number,
  box: number[],
  maskUri: string,
): Promise<string | null> {
  const cut = cropRegion(img, box, width, height);
  const w = cut.width;
  const h = cut.height;

  // Маска → альфа (бинаризация по 127, как рекомендует Google).
  const maskImg = await loadImage(maskUri);
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const mctx = maskCanvas.getContext('2d');
  if (!mctx) return null;
  mctx.drawImage(maskImg, 0, 0, w, h);
  const md = mctx.getImageData(0, 0, w, h);
  let onPixels = 0;
  for (let i = 0; i < md.data.length; i += 4) {
    const on = md.data[i] > 127 ? 255 : 0;
    if (on) onPixels++;
    md.data[i] = 255;
    md.data[i + 1] = 255;
    md.data[i + 2] = 255;
    md.data[i + 3] = on;
  }
  // Маска пустая/вырожденная (<1% пикселей) — не доверяем, пусть будет bbox-кроп.
  if (onPixels < (w * h) / 100) return null;
  mctx.putImageData(md, 0, 0);

  // Альфа выреза = альфа маски.
  const cctx = cut.getContext('2d');
  if (!cctx) return null;
  cctx.globalCompositeOperation = 'destination-in';
  cctx.drawImage(maskCanvas, 0, 0);

  // Белый силуэт того же выреза.
  const white = document.createElement('canvas');
  white.width = w;
  white.height = h;
  const wctx = white.getContext('2d');
  if (!wctx) return null;
  wctx.drawImage(cut, 0, 0);
  wctx.globalCompositeOperation = 'source-in';
  wctx.fillStyle = '#FFFFFF';
  wctx.fillRect(0, 0, w, h);

  // Обводка ~1.5% от большей стороны (мин. 6px) — синхронно со Swift-вырезкой.
  const r = Math.max(6, Math.round(Math.max(w, h) * 0.015));
  const pad = r + 4;
  const out = document.createElement('canvas');
  out.width = w + pad * 2;
  out.height = h + pad * 2;
  const octx = out.getContext('2d');
  if (!octx) return null;
  for (const radius of [r, r / 2]) {
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2;
      octx.drawImage(white, pad + Math.cos(ang) * radius, pad + Math.sin(ang) * radius);
    }
  }
  octx.drawImage(cut, pad, pad);
  return out.toDataURL('image/png');
}

/**
 * Вырезать предмет из подготовленного фото → data URL.
 * С маской сегментации — вырез по контуру + белая обводка (PNG с альфой);
 * без — прежний кроп по bbox (JPEG).
 */
export async function cropToSticker(
  preparedUri: string,
  width: number,
  height: number,
  bbox: number[] | null,
  mask?: string | null,
  maskBox?: number[] | null,
): Promise<string | null> {
  try {
    if (width <= 0 || height <= 0) return preparedUri;
    const img = await loadImage(preparedUri);

    // Путь с маской: регион берём у маски (она обучена под свой box_2d).
    const region = maskBox ?? bbox;
    if (mask && region && region.length === 4) {
      const sticker = await maskedSticker(img, width, height, region, mask).catch(() => null);
      if (sticker) return sticker;
    }

    if (!bbox || bbox.length !== 4) return preparedUri;
    const pad = 0.06; // лёгкий запас вокруг предмета
    const bx = Math.max(0, bbox[0] - bbox[2] * pad);
    const by = Math.max(0, bbox[1] - bbox[3] * pad);
    const bw = Math.min(1 - bx, bbox[2] * (1 + 2 * pad));
    const bh = Math.min(1 - by, bbox[3] * (1 + 2 * pad));
    const canvas = cropRegion(img, [bx, by, bw, bh], width, height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (e) {
    console.warn('cropToSticker web failed:', e);
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
    // Нормализуем регистр/пробелы: иначе «АКСЕССУАР» и «Аксессуар» дробят
    // одну тему на две секции в Коллекции (см. src/lib/category.ts).
    category: normalizeCategory(obj.category),
    emoji: obj.emoji,
    examples: obj.examples ?? [],
    note: obj.note || undefined,
    distractors: obj.distractors ?? [],
    synonyms: obj.synonyms ?? [],
    questMatch: obj.questMatch || undefined,
    auto: true,
  };
}
