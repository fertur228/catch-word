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

/** Адаптер хранилища сессии поверх key_value (expo-sqlite). */
const sqliteStorage = {
  getItem: (key: string) => db.getPref(key),
  setItem: (key: string, value: string) => db.setPref(key, value).then(() => {}),
  removeItem: (key: string) => db.deletePref(key).then(() => {}),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
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

/** Настроены ли URL и ключ Supabase. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON);
}
