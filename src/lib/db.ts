/**
 * Локальная база данных коллекции (спека §6, §7.2: «Локальная БД — expo-sqlite»).
 *
 * Почему SQLite, а не просто массив в памяти:
 *  1) так требует спека (таблица `word_card`);
 *  2) коллекция не теряется при перезапуске приложения;
 *  3) всё спрятано за простыми функциями ниже — экраны про SQL не знают.
 *
 * Экраны работают не с этими функциями напрямую, а через хук `useCollection()`
 * (см. collection-context.tsx) — он держит карточки в состоянии React.
 */
import * as SQLite from 'expo-sqlite';

import type { WordCard } from '@/types';

const DB_NAME = 'catchword.db';

// База открывается один раз и переиспользуется (ленивая инициализация).
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function init(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS word_card (
      id            TEXT PRIMARY KEY NOT NULL,
      emoji         TEXT,
      image_uri     TEXT,
      word          TEXT NOT NULL,
      translation   TEXT NOT NULL,
      ipa           TEXT,
      examples      TEXT,            -- JSON-массив строк
      category      TEXT,
      learning_lang TEXT NOT NULL,
      native_lang   TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );
  `);
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await init(db);
      return db;
    })();
  }
  return dbPromise;
}

/** Форма строки в таблице (snake_case, как в SQL). */
interface Row {
  id: string;
  emoji: string | null;
  image_uri: string | null;
  word: string;
  translation: string;
  ipa: string | null;
  examples: string | null;
  category: string | null;
  learning_lang: string;
  native_lang: string;
  created_at: number;
}

/** Превратить строку БД в удобный объект `WordCard` (camelCase). */
function rowToCard(r: Row): WordCard {
  return {
    id: r.id,
    emoji: r.emoji ?? '🏷️',
    imageUri: r.image_uri,
    word: r.word,
    translation: r.translation,
    ipa: r.ipa ?? '',
    examples: r.examples ? (JSON.parse(r.examples) as string[]) : [],
    category: r.category,
    learningLang: r.learning_lang,
    nativeLang: r.native_lang,
    createdAt: r.created_at,
  };
}

export async function getAllCards(): Promise<WordCard[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>('SELECT * FROM word_card ORDER BY created_at DESC');
  return rows.map(rowToCard);
}

export async function getCardById(id: string): Promise<WordCard | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>('SELECT * FROM word_card WHERE id = ?', id);
  return row ? rowToCard(row) : null;
}

export async function insertCard(c: WordCard): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO word_card
       (id, emoji, image_uri, word, translation, ipa, examples, category, learning_lang, native_lang, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    c.id,
    c.emoji,
    c.imageUri ?? null,
    c.word,
    c.translation,
    c.ipa,
    JSON.stringify(c.examples),
    c.category ?? null,
    c.learningLang,
    c.nativeLang,
    c.createdAt,
  );
}

export async function deleteCard(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM word_card WHERE id = ?', id);
}

export async function countCards(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM word_card');
  return row?.n ?? 0;
}
