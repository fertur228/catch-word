/**
 * Веб-вариант загрузки стикера в Supabase Storage. На вебе вырез приходит как
 * data URL (или blob URL), поэтому просто превращаем его в Blob и грузим.
 * Уже-загруженные http(s)-URL возвращаем как есть.
 */
import { seedImageCache } from '@/lib/image-cache';
import { supabase } from '@/lib/supabase';

const BUCKET = 'stickers';

export async function uploadSticker(
  localUri: string,
  userId: string,
  cardId: string,
): Promise<string | null> {
  // Уже публичный URL (после прошлой загрузки / с другого устройства) — не трогаем.
  if (localUri.startsWith('http')) return localUri;
  try {
    const blob = await (await fetch(localUri)).blob();
    if (blob.size === 0) return null;
    const isPng = blob.type.includes('png') || localUri.includes('image/png');
    const ext = isPng ? 'png' : 'jpg';
    const path = `${userId}/${cardId}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: isPng ? 'image/png' : 'image/jpeg',
      upsert: true,
      // Стикер не меняется — годовой кэш вместо дефолтного часа.
      cacheControl: '31536000',
    });
    if (error) {
      console.warn('uploadSticker web:', error.message);
      return null;
    }
    const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    // Блоб уже в руках: сеем локальный кэш, чтобы облачный URL на этом
    // устройстве вообще никогда не скачивался из сети.
    await seedImageCache(url, blob);
    return url;
  } catch (e) {
    console.warn('uploadSticker web failed:', e);
    return null;
  }
}
