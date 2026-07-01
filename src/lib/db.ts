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
 *
 * Хранит два набора данных:
 *  - `word_card`  — карточки слов (+ поля SRS интервального повторения);
 *  - `key_value`  — пользовательские настройки (язык изучения/родной, онбординг).
 */
import * as SQLite from 'expo-sqlite';

import type { WordCard } from '@/types';

const DB_NAME = 'catchword.db';

// База открывается один раз и переиспользуется (ленивая инициализация).
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Безопасно добавить колонку в существующую БД (если её ещё нет). */
async function addColumnIfMissing(db: SQLite.SQLiteDatabase, sql: string) {
  try {
    await db.execAsync(sql);
  } catch {
    // Колонка уже существует — это ок (ALTER упадёт, мы это глотаем).
  }
}

async function init(db: SQLite.SQLiteDatabase) {
  // Свежая БД создаётся сразу со всеми колонками.
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
      created_at    INTEGER NOT NULL,
      due_at        INTEGER,
      interval      INTEGER,
      ease          REAL,
      reps          INTEGER,
      mastery       INTEGER,
      notes         TEXT,
      distractors   TEXT,            -- JSON-массив строк (AI-варианты для теста)
      owner_id      TEXT             -- id аккаунта-владельца (null = гость)
    );
    CREATE TABLE IF NOT EXISTS key_value (
      key   TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );
  `);

  // Миграция старой БД (без SRS-колонок): добавляем их по одной, не падая,
  // если они уже есть. Так апдейт приложения не ломает существующую коллекцию.
  await addColumnIfMissing(db, 'ALTER TABLE word_card ADD COLUMN due_at INTEGER');
  await addColumnIfMissing(db, 'ALTER TABLE word_card ADD COLUMN interval INTEGER');
  await addColumnIfMissing(db, 'ALTER TABLE word_card ADD COLUMN ease REAL');
  await addColumnIfMissing(db, 'ALTER TABLE word_card ADD COLUMN reps INTEGER');
  await addColumnIfMissing(db, 'ALTER TABLE word_card ADD COLUMN mastery INTEGER');
  await addColumnIfMissing(db, 'ALTER TABLE word_card ADD COLUMN notes TEXT');
  await addColumnIfMissing(db, 'ALTER TABLE word_card ADD COLUMN distractors TEXT');
  await addColumnIfMissing(db, 'ALTER TABLE word_card ADD COLUMN owner_id TEXT');
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
  due_at: number | null;
  interval: number | null;
  ease: number | null;
  reps: number | null;
  mastery: number | null;
  notes: string | null;
  distractors: string | null;
  owner_id: string | null;
}

/** Превратить строку БД в удобный объект `WordCard` (camelCase). */
function rowToCard(r: Row): WordCard {
  return {
    id: r.id,
    emoji: r.emoji ?? '',
    imageUri: r.image_uri,
    word: r.word,
    translation: r.translation,
    ipa: r.ipa ?? '',
    examples: r.examples ? (JSON.parse(r.examples) as string[]) : [],
    category: r.category,
    learningLang: r.learning_lang,
    nativeLang: r.native_lang,
    createdAt: r.created_at,
    dueAt: r.due_at ?? undefined,
    interval: r.interval ?? undefined,
    ease: r.ease ?? undefined,
    reps: r.reps ?? undefined,
    mastery: r.mastery ?? undefined,
    notes: r.notes ?? undefined,
    distractors: r.distractors ? (JSON.parse(r.distractors) as string[]) : undefined,
    ownerId: r.owner_id,
  };
}

/**
 * Карточки одного владельца (аккаунта). Локальная БД общая на устройство, поэтому
 * показываем только карточки текущего аккаунта; `null` — гостевые (без входа).
 */
export async function getCardsForOwner(ownerId: string | null): Promise<WordCard[]> {
  const db = await getDb();
  const rows =
    ownerId == null
      ? await db.getAllAsync<Row>(
          'SELECT * FROM word_card WHERE owner_id IS NULL ORDER BY created_at DESC',
        )
      : await db.getAllAsync<Row>(
          'SELECT * FROM word_card WHERE owner_id = ? ORDER BY created_at DESC',
          ownerId,
        );
  return rows.map(rowToCard);
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
       (id, emoji, image_uri, word, translation, ipa, examples, category,
        learning_lang, native_lang, created_at, due_at, interval, ease, reps, mastery, notes, distractors, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    c.dueAt ?? null,
    c.interval ?? null,
    c.ease ?? null,
    c.reps ?? null,
    c.mastery ?? null,
    c.notes ?? null,
    c.distractors ? JSON.stringify(c.distractors) : null,
    c.ownerId ?? null,
  );
}

/** Обновить только SRS-поля карточки (после повтора). */
export async function updateCardSrs(
  id: string,
  srs: { dueAt: number; interval: number; ease: number; reps: number; mastery: number },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE word_card SET due_at = ?, interval = ?, ease = ?, reps = ?, mastery = ? WHERE id = ?`,
    srs.dueAt,
    srs.interval,
    srs.ease,
    srs.reps,
    srs.mastery,
    id,
  );
}

export async function deleteCard(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM word_card WHERE id = ?', id);
}

/** Удалить все карточки (очистка коллекции). */
export async function clearCards(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM word_card');
}

/**
 * Удалить карточки только одной пары языков — очистка одного «курса».
 * Слова других пар (другие курсы) остаются нетронутыми.
 */
export async function clearCardsForPair(learning: string, native: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'DELETE FROM word_card WHERE learning_lang = ? AND native_lang = ?',
    learning,
    native,
  );
}

export async function countCards(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM word_card');
  return row?.n ?? 0;
}

// --- Настройки (key_value): язык изучения/родной, флаг онбординга ---

/** Прочитать значение настройки по ключу (или null, если нет). */
export async function getPref(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM key_value WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

/** Записать значение настройки по ключу. */
export async function setPref(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO key_value (key, value) VALUES (?, ?)', key, value);
}

/** Удалить настройку по ключу (нужно для хранилища сессии Supabase). */
export async function deletePref(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM key_value WHERE key = ?', key);
}
