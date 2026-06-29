/**
 * Клиент Supabase (auth + БД + storage). Сессия хранится в НАШЕЙ SQLite
 * (таблица key_value через db.ts) — поэтому не нужен AsyncStorage / нативные
 * модули и пересборка. Flow — `implicit` (токены приходят во фрагменте URL),
 * чтобы не тянуть полифилл crypto для PKCE.
 */
import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

import * as db from '@/lib/db';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * supabase-js падает прямо в createClient, если URL пустой/кривой или ключ
 * пустой. Чтобы отсутствие env-переменных (напр. при первой сборке на Cloudflare)
 * НЕ роняло весь билд — включая лендинг, которому Supabase не нужен, — при кривом
 * URL/пустом ключе подставляем безопасные заглушки. Реальные значения приходят из
 * EXPO_PUBLIC_* при сборке; isSupabaseConfigured() остаётся честным — UI знает,
 * настроен ли бэкенд (без него вход/синк/распознавание просто недоступны).
 */
function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const CLIENT_URL = isValidHttpUrl(SUPABASE_URL) ? SUPABASE_URL : 'https://placeholder.supabase.co';
const CLIENT_ANON = SUPABASE_ANON || 'placeholder-anon-key';

/** Адаптер хранилища сессии поверх key_value (expo-sqlite). */
const sqliteStorage = {
  getItem: (key: string) => db.getPref(key),
  setItem: (key: string, value: string) => db.setPref(key, value).then(() => {}),
  removeItem: (key: string) => db.deletePref(key).then(() => {}),
};

export const supabase = createClient(CLIENT_URL, CLIENT_ANON, {
  auth: {
    storage: sqliteStorage,
    autoRefreshToken: true,
    persistSession: true,
    // На вебе Supabase сам ловит токены из #fragment после OAuth-редиректа
    // (см. auth-context.web.tsx). На нативе токены ставим вручную из deep-link.
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'implicit',
  },
});

/** Настроены ли URL и ключ Supabase (валидный URL + непустой ключ). */
export function isSupabaseConfigured(): boolean {
  return isValidHttpUrl(SUPABASE_URL) && Boolean(SUPABASE_ANON);
}
