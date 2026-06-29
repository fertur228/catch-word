/**
 * Загрузка стикера (вырезанного PNG/JPG) в Supabase Storage — НАТИВНАЯ версия
 * (читает локальный файл через expo-file-system). Вынесено из cloud-sync.ts,
 * чтобы у веба был свой вариант (sticker-upload.web.ts) без нативных модулей.
 */
import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from '@/lib/supabase';

const BUCKET = 'stickers';

/** Локальный ли это файл (а не уже загруженный URL). */
function isLocalFile(uri: string): boolean {
  return uri.startsWith('file://') || uri.startsWith('/');
}

/** base64 → байты (Hermes имеет глобальный atob). */
function b64ToBytes(b64: string): Uint8Array {
  const bin = (globalThis as { atob?: (s: string) => string }).atob?.(b64) ?? '';
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Загрузить стикер в Storage и вернуть публичный URL. Если это уже URL —
 * вернуть как есть; при ошибке — null (останется локальный файл).
 */
export async function uploadSticker(
  localUri: string,
  userId: string,
  cardId: string,
): Promise<string | null> {
  if (!isLocalFile(localUri)) return localUri;
  try {
    const b64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = b64ToBytes(b64);
    if (bytes.length === 0) return null;
    const ext = localUri.toLowerCase().includes('.png') ? 'png' : 'jpg';
    const path = `${userId}/${cardId}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      upsert: true,
    });
    if (error) {
      console.warn('uploadSticker:', error.message);
      return null;
    }
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.warn('uploadSticker failed:', e);
    return null;
  }
}
