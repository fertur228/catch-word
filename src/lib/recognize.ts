/**
 * Клиент распознавания: фото → серверная функция /recognize (Gemini) → объекты.
 *
 * Ключ модели живёт на сервере (Supabase Edge Function), здесь — только
 * публичный anon-ключ Supabase. Фото ужимаем до ~1024px (длинная сторона),
 * чтобы беречь токены и трафик. Если бэкенд не настроен / недоступен —
 * возвращаем null, и поток продолжается на моке (приложение работает всегда).
 *
 * Также здесь: вырезка стикера «по рамке» (кроп bbox) и сохранение картинки
 * в постоянную папку, чтобы стикер не пропал из коллекции.
 */
import { Image } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

import { normalizeCategory } from '@/lib/category';
import { lookupWord } from '@/lib/dictionary';
import { supabase } from '@/lib/supabase';
import type { ScanResult, Visor } from '@/lib/scan-job';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const RECOGNIZE_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/recognize` : '';

/** Сервер вернул 402 — бесплатные сканы кончились. Экран показывает пейволл. */
export class ScanLimitError extends Error {
  /** true → premium исчерпал дневной fair-use кап (не free-лимит): экран показывает
   *  «вернись завтра», а НЕ пейволл. */
  readonly premium: boolean;
  constructor(premium = false) {
    super('scan_limit_reached');
    this.name = 'ScanLimitError';
    this.premium = premium;
  }
}

/** Длинная сторона при отправке (меньше токенов/трафика). */
const MAX_EDGE = 1024;
/** Жёсткий таймаут запроса распознавания. */
const TIMEOUT_MS = 15000;

/** Один распознанный предмет (что вернул /recognize). */
export interface RecognizedObject {
  word: string;
  translation: string;
  ipa: string;
  category: string | null;
  emoji: string;
  /** [x, y, w, h] в долях 0..1 (или null). */
  bbox: number[] | null;
  confidence: number | null;
  /** 2–3 примера предложения с этим словом (могут отсутствовать). */
  examples?: string[];
  /** Короткая заметка-мнемоника на родном языке (может быть пустой). */
  note?: string;
  /** Правдоподобные неправильные переводы — для умного теста. */
  distractors?: string[];
  /** До 3 синонимов/близких по значению слов на изучаемом языке. */
  synonyms?: string[];
  /** Точное слово-цель квеста, которому предмет соответствует семантически, или "". */
  questMatch?: string;
}

/** Готов ли бэкенд распознавания (есть URL и ключ). */
export function isRecognitionConfigured(): boolean {
  return Boolean(RECOGNIZE_URL && SUPABASE_ANON);
}

/** Размеры картинки без перекодирования. */
function getSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 0, height: 0 }),
    );
  });
}

/** Ужать фото до ~1024px по длинной стороне → JPEG + base64. */
async function prepareImage(photoUri: string) {
  const { width, height } = await getSize(photoUri);
  const landscape = width >= height && width > 0;
  const action =
    width === 0 || height === 0
      ? { resize: { width: MAX_EDGE } }
      : landscape
        ? { resize: { width: MAX_EDGE } }
        : { resize: { height: MAX_EDGE } };
  return manipulateAsync(photoUri, [action], {
    compress: 0.6,
    format: SaveFormat.JPEG,
    base64: true,
  });
}

/**
 * Позвать /recognize. Возвращает объекты + подготовленное (ужатое) фото
 * (его же используем для кропа стикера), либо null при любой проблеме.
 */
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

  let prepared;
  try {
    prepared = await prepareImage(photoUri);
  } catch (e) {
    console.warn('Не удалось подготовить фото:', e);
    return null;
  }
  if (!prepared.base64) return null;

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
      body: JSON.stringify({ image: prepared.base64, learningLang, nativeLang, maxObjects, questWords }),
    });
    if (res.status === 402) {
      // free-лимит или premium fair-use (флаг premium в теле).
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
      prepared: { uri: prepared.uri, width: prepared.width, height: prepared.height },
    };
  } catch (e) {
    if (e instanceof ScanLimitError) throw e; // пробрасываем — экран покажет пейволл
    console.warn('recognize failed:', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Вырезать предмет «по рамке» (кроп bbox) из подготовленного фото и сохранить
 * в постоянную папку. bbox в долях 0..1. Без bbox — сохраняем кадр целиком.
 */
export async function cropToSticker(
  preparedUri: string,
  width: number,
  height: number,
  bbox: number[] | null,
): Promise<string | null> {
  try {
    let uri = preparedUri;
    if (bbox && bbox.length === 4 && width > 0 && height > 0) {
      const pad = 0.06; // лёгкий запас вокруг предмета
      const bx = Math.max(0, bbox[0] - bbox[2] * pad);
      const by = Math.max(0, bbox[1] - bbox[3] * pad);
      const bw = Math.min(1 - bx, bbox[2] * (1 + 2 * pad));
      const bh = Math.min(1 - by, bbox[3] * (1 + 2 * pad));
      const crop = {
        originX: Math.round(bx * width),
        originY: Math.round(by * height),
        width: Math.max(1, Math.round(bw * width)),
        height: Math.max(1, Math.round(bh * height)),
      };
      const cropped = await manipulateAsync(preparedUri, [{ crop }], {
        compress: 0.8,
        format: SaveFormat.JPEG,
      });
      uri = cropped.uri;
    }
    return await persistImage(uri);
  } catch (e) {
    console.warn('Не удалось вырезать стикер:', e);
    return null;
  }
}

/**
 * Кроп по «визиру»: вырезает квадрат фото, соответствующий рамке наведения на
 * экране. Превью камеры масштабируется в режиме cover (заполняет экран, лишнее
 * обрезается), поэтому точки экрана переводим в пиксели фото через тот же
 * cover-масштаб и берём квадрат вокруг РЕАЛЬНОГО центра визира (visor.cx/cy) —
 * ровно то, что пользователь видел в рамке (визир НЕ по центру экрана — выше).
 * Возвращает { uri, width, height } или null.
 */
export async function cropToFrame(
  uri: string,
  visor: Visor,
): Promise<{ uri: string; width: number; height: number } | null> {
  try {
    // Пустой список действий нормализует EXIF-ориентацию и даёт реальные пиксели.
    const base = await manipulateAsync(uri, [], { compress: 1, format: SaveFormat.JPEG });
    const pw = base.width;
    const ph = base.height;
    const { cx, cy, side: frameSidePt, screenW, screenH } = visor;
    if (!pw || !ph || screenW <= 0 || screenH <= 0) return base;
    // cover-масштаб превью → сторона квадрата в пикселях фото.
    const scale = Math.max(screenW / pw, screenH / ph);
    const side = Math.max(1, Math.min(pw, ph, Math.round(frameSidePt / scale)));
    // Центр визира (в точках экрана) → пиксели фото через ту же cover-трансформацию.
    const cxPx = (cx - screenW / 2) / scale + pw / 2;
    const cyPx = (cy - screenH / 2) / scale + ph / 2;
    const originX = Math.max(0, Math.min(pw - side, Math.round(cxPx - side / 2)));
    const originY = Math.max(0, Math.min(ph - side, Math.round(cyPx - side / 2)));
    const out = await manipulateAsync(
      base.uri,
      [{ crop: { originX, originY, width: side, height: side } }],
      { compress: 0.9, format: SaveFormat.JPEG },
    );
    return { uri: out.uri, width: out.width, height: out.height };
  } catch (e) {
    console.warn('Не удалось вырезать по рамке:', e);
    return null;
  }
}

/** Скопировать картинку из кеша в постоянную папку (чтобы стикер не пропал). */
export async function persistImage(srcUri: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}stickers/`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // папка уже есть — ок
  }
  const ext = srcUri.toLowerCase().includes('.png') ? 'png' : 'jpg';
  const name = `cw-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
  const dest = `${dir}${name}`;
  await FileSystem.copyAsync({ from: srcUri, to: dest });
  return dest;
}

/**
 * Собрать ScanResult из объекта. Словарь у нас EN→RU — для известных
 * английских слов берём более надёжные IPA/перевод из него (модель может
 * ошибаться в транскрипции редких слов).
 */
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
