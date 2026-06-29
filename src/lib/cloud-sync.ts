/**
 * Облачная синхронизация коллекции и загрузка стикеров в Supabase.
 *
 * Работает только когда пользователь вошёл (передаём userId). Стикеры
 * (вырезанные PNG) грузятся в Storage-бакет `stickers`, в карточке хранится
 * их публичный URL — так картинка одинаково видна на всех устройствах.
 */
import { supabase } from '@/lib/supabase';
import type { WordCard } from '@/types';

// Загрузка стикеров вынесена в отдельный модуль с платформенными вариантами
// (sticker-upload.ts — нативный, sticker-upload.web.ts — веб). Реэкспортим,
// чтобы импорт `uploadSticker from '@/lib/cloud-sync'` не менялся у потребителей.
export { uploadSticker } from '@/lib/sticker-upload';

/** WordCard → строка таблицы word_cards. */
function cardToRow(userId: string, c: WordCard) {
  return {
    user_id: userId,
    id: c.id,
    emoji: c.emoji,
    image_uri: c.imageUri ?? null,
    word: c.word,
    translation: c.translation,
    ipa: c.ipa,
    examples: c.examples,
    category: c.category ?? null,
    learning_lang: c.learningLang,
    native_lang: c.nativeLang,
    created_at: c.createdAt,
    due_at: c.dueAt ?? null,
    interval: c.interval ?? null,
    ease: c.ease ?? null,
    reps: c.reps ?? null,
    mastery: c.mastery ?? null,
    notes: c.notes ?? null,
    updated_at: new Date().toISOString(),
  };
}

/** Строка таблицы → WordCard. */
// deno-lint-ignore no-explicit-any
function rowToCard(r: any): WordCard {
  return {
    id: r.id,
    emoji: r.emoji ?? '',
    imageUri: r.image_uri,
    word: r.word,
    translation: r.translation,
    ipa: r.ipa ?? '',
    examples: Array.isArray(r.examples) ? r.examples : [],
    category: r.category,
    learningLang: r.learning_lang,
    nativeLang: r.native_lang,
    createdAt: Number(r.created_at),
    dueAt: r.due_at != null ? Number(r.due_at) : undefined,
    interval: r.interval ?? undefined,
    ease: r.ease ?? undefined,
    reps: r.reps ?? undefined,
    mastery: r.mastery ?? undefined,
    notes: r.notes ?? undefined,
  };
}

/** Залить/обновить карточку в облаке. */
export async function pushCard(userId: string, card: WordCard): Promise<void> {
  const { error } = await supabase.from('word_cards').upsert(cardToRow(userId, card));
  if (error) console.warn('pushCard:', error.message);
}

/** Удалить карточку из облака. */
export async function deleteCloudCard(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('word_cards').delete().eq('user_id', userId).eq('id', id);
  if (error) console.warn('deleteCloudCard:', error.message);
}

/** Удалить все карточки пользователя в облаке. */
export async function clearCloudCards(userId: string): Promise<void> {
  const { error } = await supabase.from('word_cards').delete().eq('user_id', userId);
  if (error) console.warn('clearCloudCards:', error.message);
}

/** Удалить карточки пользователя только одной пары языков (один «курс»). */
export async function clearCloudCardsForPair(
  userId: string,
  learning: string,
  native: string,
): Promise<void> {
  const { error } = await supabase
    .from('word_cards')
    .delete()
    .eq('user_id', userId)
    .eq('learning_lang', learning)
    .eq('native_lang', native);
  if (error) console.warn('clearCloudCardsForPair:', error.message);
}

/** Скачать все карточки пользователя из облака. */
export async function pullCards(userId: string): Promise<WordCard[]> {
  const { data, error } = await supabase.from('word_cards').select('*').eq('user_id', userId);
  if (error || !data) {
    if (error) console.warn('pullCards:', error.message);
    return [];
  }
  return data.map(rowToCard);
}
