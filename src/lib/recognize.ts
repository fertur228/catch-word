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
import { frameCropRect, resizeToFit } from '@/lib/scan-geometry';
import { parseServerTimings, type ScanTimer } from '@/lib/scan-timing';

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

/**
 * Потолок длинной стороны при отправке. 1536/0.85 вместо 1024/0.6: агрессивный
 * препроцессинг резал точность (готча в памяти команды), а Gemini тайлит
 * по 768px — 1536 стоит столько же токенов, деталей заметно больше.
 *
 * ВАЖНО: это именно ПОТОЛОК, а не целевой размер — кадр меньше него НЕ растягиваем
 * (см. prepareScanImage). Квадрат под визиром на iPhone выходит ~1250px, и прежний
 * безусловный resize раздувал его до 1536: лишние байты в аплоад без единого
 * лишнего пикселя информации.
 */
const MAX_EDGE = 1536;
const JPEG_QUALITY = 0.85;
/** Жёсткий таймаут запроса распознавания. */
const TIMEOUT_MS = 20000;

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
  /** Маска сегментации (data-URI PNG) — только веб (wantMasks); на нативе вырезает Vision. */
  mask?: string | null;
  /** Регион маски [x,y,w,h] в долях 0..1. */
  maskBox?: number[] | null;
}

/** Готов ли бэкенд распознавания (есть URL и ключ). */
export function isRecognitionConfigured(): boolean {
  return Boolean(RECOGNIZE_URL && SUPABASE_ANON);
}

/** Подготовленный к скану кадр: файл на диске + его реальные размеры. */
export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
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

/**
 * Подготовить кадр к скану ОДНИМ перекодированием: кроп по визиру (single) +
 * ужатие под потолок MAX_EDGE. Результат идёт и в распознавание, и в нативную
 * вырезку (Vision получает центрированный субъект → чище стикер).
 *
 * Почему одним: раньше путь камера→сеть перекодировал 12-мегапиксельный JPEG
 * ТРИЖДЫ (нормализация EXIF ради размеров → кроп → ресайз+base64). Один
 * manipulateAsync применяет EXIF-ориентацию сам, а размеры для кропа читаем
 * getSize'ом (заголовок, без декодирования) — лишние проходы не нужны.
 *
 * ВАЖНО (готча с ориентацией): размеры БЕРЁМ ИЗ САМОГО ИЗОБРАЖЕНИЯ (getSize), а
 * НЕ из takePictureAsync. Камера на iOS отдаёт размеры в сенсорной ориентации
 * (ландшафт 4032×3024), а manipulateAsync режет уже развёрнутый портретный кадр
 * (3024×4032) — кроп по «сенсорным» размерам уезжает мимо рамки, и модель видит
 * не тот предмет. getSize даёт те же ориентированные размеры, что и manipulate.
 *
 * visor=null → без кропа (режим «поймай всю сцену»: нужен весь кадр).
 */
export async function prepareScanImage(
  photoUri: string,
  visor: Visor | null,
  timer?: ScanTimer,
): Promise<PreparedImage | null> {
  try {
    const size = await getSize(photoUri);
    const actions: Parameters<typeof manipulateAsync>[1] = [];

    // 1) Кроп по рамке наведения (только single).
    const crop = visor ? frameCropRect(size.width, size.height, visor) : null;
    if (crop) actions.push({ crop });
    // Размеры кадра и регион кропа — в диагностику: если кроп снова уедет,
    // это будет видно на экране Результата, а не только на словах.
    timer?.info('кадр px', `${size.width}×${size.height}`);
    if (crop) timer?.info('кроп px', `${crop.originX},${crop.originY} ${crop.width}²`);

    // 2) Ужатие — ТОЛЬКО вниз (см. resizeToFit).
    const outW = crop ? crop.width : size.width;
    const outH = crop ? crop.height : size.height;
    if (outW <= 0 || outH <= 0) {
      // Размеры неизвестны (getSize не смог) — страхуемся прежним поведением.
      actions.push({ resize: { width: MAX_EDGE } });
    } else {
      const resize = resizeToFit(outW, outH, MAX_EDGE);
      if (resize) actions.push({ resize });
    }

    const out = await manipulateAsync(photoUri, actions, {
      compress: JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });
    return { uri: out.uri, width: out.width, height: out.height };
  } catch (e) {
    console.warn('Не удалось подготовить кадр:', e);
    return null;
  }
}

/**
 * Позвать /recognize уже подготовленным кадром. Возвращает объекты либо null
 * при любой проблеме (кроме исчерпанного лимита — он летит ScanLimitError).
 *
 * Кадр уходит СЫРЫМИ БАЙТАМИ (application/octet-stream), а не base64 внутри
 * JSON: base64 раздувает тело на треть (253КБ вместо 189КБ), а на мобильном
 * аплинке это самая дорогая часть ожидания. Заодно гигантская base64-строка
 * больше не гоняется через мост. Параметры — в query. Веб остаётся на JSON
 * (см. recognize.web.ts): там нет ни моста, ни мобильного аплинка.
 */
export async function recognizePhoto(
  prepared: PreparedImage,
  learningLang: string,
  nativeLang: string,
  maxObjects = 1,
  questWords: string[] = [],
  timer?: ScanTimer,
): Promise<{ objects: RecognizedObject[] } | null> {
  if (!isRecognitionConfigured()) return null;

  // Токен вошедшего пользователя — чтобы сервер посчитал лимит именно ему.
  // Гость → anon-ключ (серверный лимит к нему не применяется).
  const token = (await supabase.auth.getSession()).data.session?.access_token;

  const qs = new URLSearchParams({
    learningLang,
    nativeLang,
    maxObjects: String(maxObjects),
  });
  if (questWords.length > 0) qs.set('questWords', questWords.join(','));

  const task = FileSystem.createUploadTask(`${RECOGNIZE_URL}?${qs.toString()}`, prepared.uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': 'application/octet-stream',
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${token ?? SUPABASE_ANON}`,
    },
  });
  // Жёсткий таймаут: у аплоад-задачи нет AbortSignal — отменяем её вручную.
  let timedOut = false;
  const killer = setTimeout(() => {
    timedOut = true;
    void task.cancelAsync().catch(() => {});
  }, TIMEOUT_MS);

  try {
    let res;
    try {
      res = await task.uploadAsync();
    } catch (e) {
      // Транспортный сбой САМОЙ аплоад-задачи (не HTTP-ответ): значит запрос до
      // сервера не дошёл — скан не списан, можно честно повторить прежним путём.
      // Страховка на случай, если BINARY_CONTENT где-то поведёт себя не так:
      // хуже медленный скан, чем сломанный. Сервер принимает оба формата.
      if (timedOut) throw e;
      console.warn('recognize: бинарный аплоад не удался, откат на JSON:', e);
      timer?.add('откат на JSON', 0);
      return await recognizeViaJson(prepared, learningLang, nativeLang, maxObjects, questWords, token);
    }
    if (!res || timedOut) {
      console.warn('recognize: таймаут аплоада');
      return null;
    }
    // Серверные тайминги (сколько внутри функции заняли гейт лимита и модель) —
    // чтобы в дев-логе было видно, что из «сети+модели» чьё.
    const srv = res.headers?.['x-scan-timings'] ?? res.headers?.['X-Scan-Timings'];
    for (const s of parseServerTimings(srv)) timer?.add(s.name, s.ms);
    if (res.status === 402) {
      // free-лимит или premium fair-use (флаг premium в теле).
      const body = safeJson(res.body) as { premium?: boolean } | null;
      throw new ScanLimitError(body?.premium === true);
    }
    if (res.status < 200 || res.status >= 300) {
      console.warn('recognize HTTP', res.status, String(res.body).slice(0, 200));
      return null;
    }
    const data = safeJson(res.body) as { objects?: RecognizedObject[] } | null;
    return { objects: Array.isArray(data?.objects) ? data.objects : [] };
  } catch (e) {
    if (e instanceof ScanLimitError) throw e; // пробрасываем — экран покажет пейволл
    console.warn('recognize failed:', e);
    return null;
  } finally {
    clearTimeout(killer);
  }
}

/** Разобрать JSON, не роняя поток на битом теле. */
function safeJson(body: string | undefined | null): unknown {
  try {
    return body ? JSON.parse(body) : null;
  } catch {
    return null;
  }
}

/**
 * Прежний путь: base64 внутри JSON. Живёт только как страховка, если бинарный
 * аплоад сорвётся на транспорте (см. recognizePhoto) — тело на треть толще,
 * поэтому основным его больше не делаем.
 */
async function recognizeViaJson(
  prepared: PreparedImage,
  learningLang: string,
  nativeLang: string,
  maxObjects: number,
  questWords: string[],
  token: string | undefined,
): Promise<{ objects: RecognizedObject[] } | null> {
  const b64 = await FileSystem.readAsStringAsync(prepared.uri, {
    encoding: FileSystem.EncodingType.Base64,
  }).catch(() => null);
  if (!b64) return null;

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
      body: JSON.stringify({ image: b64, learningLang, nativeLang, maxObjects, questWords }),
    });
    if (res.status === 402) {
      const body = (await res.json().catch(() => null)) as { premium?: boolean } | null;
      throw new ScanLimitError(body?.premium === true);
    }
    if (!res.ok) {
      console.warn('recognize (JSON) HTTP', res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const data = (await res.json()) as { objects?: RecognizedObject[] };
    return { objects: Array.isArray(data.objects) ? data.objects : [] };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Прогреть соединение с /recognize (TLS + инстанс edge-функции). Зовём при
 * открытии камеры: к моменту нажатия затвора рукопожатие уже сделано, и скан
 * не платит за него. Ошибки игнорируем — это чистая оптимизация.
 */
export function prewarmRecognition(): void {
  if (!isRecognitionConfigured()) return;
  void fetch(RECOGNIZE_URL, { method: 'OPTIONS', headers: { apikey: SUPABASE_ANON } }).catch(() => {});
}

/**
 * Вырезать предмет «по рамке» (кроп bbox) из подготовленного фото и сохранить
 * в постоянную папку. bbox в долях 0..1. Без bbox — сохраняем кадр целиком.
 * mask/maskBox — только для сигнатурного паритета с recognize.web.ts: на нативе
 * вырезку по контуру делает Vision (subject-lift), маски сервера не нужны.
 */
export async function cropToSticker(
  preparedUri: string,
  width: number,
  height: number,
  bbox: number[] | null,
  _mask?: string | null,
  _maskBox?: number[] | null,
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
