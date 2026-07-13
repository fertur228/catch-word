/**
 * Локальный кэш картинок-стикеров — НАТИВНАЯ версия (заглушка).
 * На iOS/Android expo-image сам кэширует загруженные URL на диск
 * (cachePolicy по умолчанию 'disk'), поэтому тут ничего делать не нужно.
 * Реальная реализация — для веба: image-cache.web.ts (Cache API + objectURL).
 */

/** Вернуть URI для отображения. На нативе — как есть. */
export function useCachedImageUri(uri?: string | null): string | null {
  return uri ?? null;
}

/** Положить свежезагруженный стикер в кэш (на нативе не нужно). */
export async function seedImageCache(_url: string, _blob: unknown): Promise<void> {
  /* no-op */
}
