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
import { useSyncExternalStore } from 'react';

import * as db from '@/lib/db';
import { EN } from '@/lib/i18n-en';

export type Lang = 'en' | 'ru';
const PREF = 'ui_lang';

let lang: Lang = 'en'; // дефолт — английский
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

/** Прочитать сохранённый язык на старте (иначе остаётся дефолт en). */
export async function initLang(): Promise<void> {
  try {
    const v = await db.getPref(PREF);
    if (v === 'en' || v === 'ru') {
      lang = v;
      emit();
    }
  } catch {
    /* нет доступа к db — остаёмся на дефолте */
  }
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
