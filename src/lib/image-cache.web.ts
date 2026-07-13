/**
 * Локальный кэш картинок-стикеров — ВЕБ-версия.
 *
 * Проблема: стикеры хранятся в Supabase Storage, а браузерный HTTP-кэш живёт
 * только `cacheControl` (по умолчанию час) — фото коллекции перекачиваются из
 * сети почти каждый визит и грузятся медленно.
 *
 * Решение — два слоя:
 *  1. Cache API (`caches`) — постоянный кэш блобов по URL, переживает
 *     перезагрузку страницы (это и есть «локал сторедж» для картинок);
 *  2. Map url → objectURL в памяти — мгновенный синхронный ответ при повторном
 *     монтировании тайла в течение сессии (без асинхронного мигания).
 *
 * Первый показ нового URL: качаем блоб сами (один сетевой запрос), кладём в
 * оба слоя и отдаём objectURL. Все следующие показы — из кэша, без сети.
 * Свежезагруженный стикер «сеется» в кэш прямо при аплоаде (seedImageCache),
 * так что даже первая отрисовка облачного URL обходится без скачивания.
 */

import { useEffect, useState } from 'react';

const CACHE_NAME = 'takeword-stickers-v1';

/** url → objectURL: живёт до перезагрузки страницы. */
const mem = new Map<string, string>();
/** Дедупликация параллельных запросов одного URL (сетка тайлов). */
const inflight = new Map<string, Promise<string | null>>();

/** Кэшируем только удалённые http(s)-URL; data:/blob:/file: отдаём как есть. */
function cacheable(uri: string): boolean {
  return uri.startsWith('http://') || uri.startsWith('https://');
}

/** Достать блоб из Cache API или из сети (с записью в кэш); вернуть objectURL. */
function resolve(url: string): Promise<string | null> {
  let p = inflight.get(url);
  if (p) return p;
  p = (async () => {
    try {
      const store = 'caches' in globalThis ? await caches.open(CACHE_NAME) : null;
      let resp = store ? await store.match(url) : undefined;
      if (!resp) {
        resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) return null;
        if (store) await store.put(url, resp.clone());
      }
      const blob = await resp.blob();
      const obj = URL.createObjectURL(blob);
      mem.set(url, obj);
      return obj;
    } catch {
      return null; // офлайн/CORS/приватный режим — покажем удалённый URL как раньше
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

/**
 * URI для отображения: objectURL из кэша, а пока кэш резолвится — null
 * (плашка остаётся пустой те же миллисекунды, что и раньше при загрузке).
 * При промахе кэша и ошибке сети возвращается исходный URL.
 */
export function useCachedImageUri(uri?: string | null): string | null {
  const [src, setSrc] = useState<string | null>(() => {
    if (!uri) return null;
    if (!cacheable(uri)) return uri;
    return mem.get(uri) ?? null;
  });

  useEffect(() => {
    if (!uri) {
      setSrc(null);
      return;
    }
    if (!cacheable(uri)) {
      setSrc(uri);
      return;
    }
    const hit = mem.get(uri);
    if (hit) {
      setSrc(hit);
      return;
    }
    let alive = true;
    setSrc(null);
    resolve(uri).then((obj) => {
      if (alive) setSrc(obj ?? uri);
    });
    return () => {
      alive = false;
    };
  }, [uri]);

  return src;
}

/**
 * Посеять кэш свежезагруженным стикером: блоб уже в руках у аплоада, значит
 * его публичный URL никогда не придётся скачивать на этом устройстве.
 */
export async function seedImageCache(url: string, blob: Blob): Promise<void> {
  try {
    mem.set(url, URL.createObjectURL(blob));
    if ('caches' in globalThis) {
      const store = await caches.open(CACHE_NAME);
      await store.put(url, new Response(blob, { headers: { 'Content-Type': blob.type } }));
    }
  } catch {
    /* кэш — best-effort */
  }
}
