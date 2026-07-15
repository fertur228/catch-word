/**
 * Смена языка интерфейса (i18n).
 *
 * Ключ перевода = РУССКИЙ исходный текст (gettext-стиль):
 *   t('Настройки') → 'Settings' при языке en, иначе 'Настройки'.
 * Английский — по умолчанию. Строки без перевода временно остаются русскими
 * (fallback на ключ), поэтому приложение работает даже частично переведённым.
 *
 * Реактивно через useSyncExternalStore — единый стор на всё приложение, смена
 * языка мгновенно перерисовывает все экраны. Язык хранится в prefs (db).
 */
import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';

import * as db from '@/lib/db';
import { EN } from '@/lib/i18n-en';

export type Lang = 'en' | 'ru';
const PREF = 'ui_lang';

/** Язык устройства: русская система → ru, всё остальное → en. */
function deviceLang(): Lang {
  try {
    return getLocales()[0]?.languageCode === 'ru' ? 'ru' : 'en';
  } catch {
    return 'en';
  }
}

let lang: Lang = 'en'; // до initLang — английский; реальный дефолт считается там
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
};
const getSnapshot = () => lang;

const translate = (l: Lang, ru: string) => (l === 'en' ? EN[ru] ?? ru : ru);

/**
 * Выбрать язык на старте: сохранённый вручную → иначе язык устройства.
 * Дефолт НЕ сохраняется в prefs — пустой pref означает «юзер язык не выбирал»,
 * на это опирается syncLangToNative.
 */
export async function initLang(): Promise<void> {
  let next = deviceLang();
  try {
    const v = await db.getPref(PREF);
    if (v === 'en' || v === 'ru') next = v;
  } catch {
    /* нет доступа к db — берём язык устройства */
  }
  if (next !== lang) {
    lang = next;
    emit();
  }
}

/**
 * После онбординга: если юзер ещё не выбирал язык вручную, подтянуть интерфейс
 * к родному языку пары ('ru-RU' → ru, 'en-US' → en, остальные — не трогаем).
 */
export async function syncLangToNative(nativeCode: string): Promise<void> {
  const short = nativeCode.slice(0, 2);
  if (short !== 'en' && short !== 'ru') return;
  try {
    if ((await db.getPref(PREF)) != null) return; // выбор юзера важнее
  } catch {
    return;
  }
  await setLang(short);
}

export function getLang(): Lang {
  return lang;
}

export async function setLang(next: Lang): Promise<void> {
  if (next === lang) return;
  lang = next;
  emit();
  try {
    await db.setPref(PREF, next);
  } catch {
    /* не удалось сохранить — язык всё равно сменится на эту сессию */
  }
}

/** Императивный перевод — для НЕ-React кода (alert'ы, строки в функциях). */
export function t(ru: string): string {
  return translate(lang, ru);
}

/** Реактивный перевод в компонентах: `const tr = useT();` затем `tr('Настройки')`. */
export function useT(): (ru: string) => string {
  const l = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return (ru: string) => translate(l, ru);
}

/** Для переключателя языка в Настройках. */
export function useLang(): { lang: Lang; setLang: (l: Lang) => void } {
  const l = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { lang: l, setLang };
}
